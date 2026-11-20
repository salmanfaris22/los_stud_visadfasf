package service

import (
	"context"
	"encoding/json"
	"io"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
	"github.com/lms/backend/internal/service/certart"
)

// certTemplate is the part of a template the renderer needs.
type certTemplate struct {
	ID            uuid.UUID
	Name          string
	BackgroundURL string
	Fields        []dto.CertificateField
}

func parseFields(raw json.RawMessage) []dto.CertificateField {
	out := []dto.CertificateField{}
	_ = json.Unmarshal(raw, &out)
	return out
}

func templateDTO(id uuid.UUID, name, bg string, fields json.RawMessage, isDefault bool, courses int32, created, updated time.Time) dto.CertificateTemplate {
	return dto.CertificateTemplate{ID: id, Name: name, BackgroundURL: bg, Fields: parseFields(fields), IsDefault: isDefault,
		CourseCount: courses, CreatedAt: created, UpdatedAt: updated}
}

// Templates lists every certificate template, the default first.
func (s *CertificateService) Templates(ctx context.Context) ([]dto.CertificateTemplate, error) {
	rows, err := s.Q.ListCertificateTemplates(ctx)
	if err != nil {
		return nil, dbErr(err, "certificate templates")
	}
	out := make([]dto.CertificateTemplate, 0, len(rows))
	for _, r := range rows {
		out = append(out, templateDTO(r.ID, r.Name, r.BackgroundUrl, r.Fields, r.IsDefault, r.CourseCount, r.CreatedAt, r.UpdatedAt))
	}
	return out, nil
}

// TemplateOptions is the short list for the course form.
func (s *CertificateService) TemplateOptions(ctx context.Context) ([]dto.CertificateTemplateOption, error) {
	rows, err := s.Q.ListCertificateTemplates(ctx)
	if err != nil {
		return nil, dbErr(err, "certificate templates")
	}
	out := make([]dto.CertificateTemplateOption, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.CertificateTemplateOption{ID: r.ID, Name: r.Name, IsDefault: r.IsDefault})
	}
	return out, nil
}

func (s *CertificateService) Template(ctx context.Context, id uuid.UUID) (dto.CertificateTemplate, error) {
	r, err := s.Q.GetCertificateTemplate(ctx, id)
	if err != nil {
		return dto.CertificateTemplate{}, dbErr(err, "certificate template")
	}
	return templateDTO(r.ID, r.Name, r.BackgroundUrl, r.Fields, r.IsDefault, r.CourseCount, r.CreatedAt, r.UpdatedAt), nil
}

// checkTemplate validates what protovalidate cannot: unique field ids and image sources the API can read.
func (s *CertificateService) checkTemplate(in dto.CertificateTemplateInput) error {
	if err := s.checkImageURL(in.BackgroundURL, "background"); err != nil {
		return err
	}
	seen := map[string]bool{}
	for _, f := range in.Fields {
		if seen[f.ID] {
			return apperr.Invalid("two fields use the id %q", f.ID)
		}
		seen[f.ID] = true
		if f.Kind == "image" {
			if err := s.checkImageURL(f.Src, f.Label); err != nil {
				return err
			}
		}
	}
	return nil
}

// checkImageURL only accepts images stored by this API (uploads or built-in art), never outside links.
func (s *CertificateService) checkImageURL(u, what string) error {
	switch {
	case u == "", strings.HasPrefix(u, certart.URLPrefix), strings.HasPrefix(u, "/api/v1/files/"):
		return nil
	case s.Cfg.S3PublicURL != "" && strings.HasPrefix(u, s.Cfg.S3PublicURL+"/"):
		return nil
	}
	return apperr.Invalid("%s: upload the image here instead of using an outside link", what)
}

func (s *CertificateService) CreateTemplate(ctx context.Context, actor *auth.Principal, in dto.CertificateTemplateInput) (dto.CertificateTemplate, error) {
	if err := s.checkTemplate(in); err != nil {
		return dto.CertificateTemplate{}, err
	}
	fields, _ := json.Marshal(nonNilFields(in.Fields))
	var id uuid.UUID
	err := s.tx(ctx, func(q *repository.Queries) error {
		if in.IsDefault {
			if err := q.ClearDefaultCertificateTemplate(ctx); err != nil {
				return err
			}
		}
		t, err := q.CreateCertificateTemplate(ctx, repository.CreateCertificateTemplateParams{
			Name: strings.TrimSpace(in.Name), BackgroundUrl: in.BackgroundURL, Fields: fields, IsDefault: in.IsDefault, CreatedBy: &actor.ID})
		id = t.ID
		return err
	})
	if err != nil {
		return dto.CertificateTemplate{}, dbErr(err, "certificate template")
	}
	s.audit.Log(ctx, actor, "create", "certificate_template", id, map[string]string{"name": in.Name})
	return s.Template(ctx, id)
}

func (s *CertificateService) UpdateTemplate(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.CertificateTemplateInput) (dto.CertificateTemplate, error) {
	if err := s.checkTemplate(in); err != nil {
		return dto.CertificateTemplate{}, err
	}
	fields, _ := json.Marshal(nonNilFields(in.Fields))
	err := s.tx(ctx, func(q *repository.Queries) error {
		if _, err := q.UpdateCertificateTemplate(ctx, repository.UpdateCertificateTemplateParams{
			ID: id, Name: strings.TrimSpace(in.Name), BackgroundUrl: in.BackgroundURL, Fields: fields}); err != nil {
			return err
		}
		if in.IsDefault {
			if err := q.ClearDefaultCertificateTemplate(ctx); err != nil {
				return err
			}
			_, err := q.MakeDefaultCertificateTemplate(ctx, id)
			return err
		}
		return nil
	})
	if err != nil {
		return dto.CertificateTemplate{}, dbErr(err, "certificate template")
	}
	s.audit.Log(ctx, actor, "update", "certificate_template", id, map[string]string{"name": in.Name})
	return s.Template(ctx, id)
}

func (s *CertificateService) SetDefaultTemplate(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	err := s.tx(ctx, func(q *repository.Queries) error {
		if err := q.ClearDefaultCertificateTemplate(ctx); err != nil {
			return err
		}
		n, err := q.MakeDefaultCertificateTemplate(ctx, id)
		if err == nil && n == 0 {
			return apperr.NotFound("certificate template")
		}
		return err
	})
	if err != nil {
		return dbErr(err, "certificate template")
	}
	s.audit.Log(ctx, actor, "set_default", "certificate_template", id, nil)
	return nil
}

func (s *CertificateService) DeleteTemplate(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	t, err := s.Q.GetCertificateTemplate(ctx, id)
	if err != nil {
		return dbErr(err, "certificate template")
	}
	if t.IsDefault {
		return apperr.Invalid("this is the default template: make another template the default first")
	}
	if _, err := s.Q.DeleteCertificateTemplate(ctx, id); err != nil {
		return dbErr(err, "certificate template")
	}
	s.audit.Log(ctx, actor, "delete", "certificate_template", id, map[string]string{"name": t.Name})
	return nil
}

// sampleValues fill a preview: the sample student from the design, and the chosen course when there is one.
func (s *CertificateService) sampleValues(ctx context.Context, courseID *uuid.UUID) CertValues {
	v := CertValues{Student: "Fathima Risana", Course: "AI Video Production",
		CourseText: "The course covered AI-assisted scriptwriting, AI image and video generation, AI voiceovers, and editing workflows for creating professional video content.",
		Code:       "MS-SAMPLE01", VerifyURL: s.verifyURL("MS-SAMPLE01"), Issued: time.Now().In(s.settings.Location(ctx))}
	if courseID != nil {
		if c, err := s.Q.GetCourse(ctx, *courseID); err == nil {
			v.Course, v.CourseText = c.Title, c.CertificateText
		}
	}
	return v
}

// PreviewTemplate renders an unsaved template with sample values.
func (s *CertificateService) PreviewTemplate(ctx context.Context, _ *auth.Principal, in dto.CertificateTemplateInput, courseID *uuid.UUID) (dto.File, error) {
	if err := s.checkTemplate(in); err != nil {
		return dto.File{}, err
	}
	t := certTemplate{Name: in.Name, BackgroundURL: in.BackgroundURL, Fields: in.Fields}
	raw, err := s.render(ctx, t, s.sampleValues(ctx, courseID))
	if err != nil {
		return dto.File{}, err
	}
	return dto.File{Name: "certificate-preview.pdf", ContentType: "application/pdf", Data: raw}, nil
}

// templateFor picks the template of an issued certificate: its own, else the course's, else the default.
func (s *CertificateService) templateFor(ctx context.Context, ids ...*uuid.UUID) (certTemplate, bool) {
	for _, id := range ids {
		if id == nil {
			continue
		}
		if t, err := s.Q.GetCertificateTemplate(ctx, *id); err == nil {
			return certTemplate{ID: t.ID, Name: t.Name, BackgroundURL: t.BackgroundUrl, Fields: parseFields(t.Fields)}, true
		}
	}
	if t, err := s.Q.GetDefaultCertificateTemplate(ctx); err == nil {
		return certTemplate{ID: t.ID, Name: t.Name, BackgroundURL: t.BackgroundUrl, Fields: parseFields(t.Fields)}, true
	}
	return certTemplate{}, false
}

// defaultTemplateID is the template a new certificate is issued with when its course has none.
func (s *CertificateService) defaultTemplateID(ctx context.Context) *uuid.UUID {
	if t, err := s.Q.GetDefaultCertificateTemplate(ctx); err == nil {
		return &t.ID
	}
	return nil
}

func (s *CertificateService) render(ctx context.Context, t certTemplate, v CertValues) ([]byte, error) {
	bg, err := s.image(ctx, t.BackgroundURL)
	if err != nil {
		return nil, err
	}
	raw, err := RenderTemplatePDF("Certificate "+v.Code, bg, t.Fields, v, func(src string) ([]byte, error) { return s.image(ctx, src) })
	if err != nil {
		if apperr.KindOf(err) != apperr.KindInternal {
			return nil, err
		}
		return nil, apperr.Invalid("%s", err.Error())
	}
	return raw, nil
}

// Images are immutable (an upload never changes), so a small cache saves storage round trips.
var certImageCache = struct {
	sync.Mutex
	m    map[string][]byte
	size int
}{m: map[string][]byte{}}

const certImageCacheMax = 64 << 20

// image loads built-in art or an uploaded image by its stored URL.
func (s *CertificateService) image(ctx context.Context, u string) ([]byte, error) {
	if u == "" {
		return nil, nil
	}
	if name, ok := strings.CutPrefix(u, certart.URLPrefix); ok {
		b, found := certart.Art(name)
		if !found {
			return nil, apperr.Invalid("unknown built-in image %q", name)
		}
		return b, nil
	}
	certImageCache.Lock()
	if b, ok := certImageCache.m[u]; ok {
		certImageCache.Unlock()
		return b, nil
	}
	certImageCache.Unlock()

	var key string
	switch {
	case strings.HasPrefix(u, "/api/v1/files/"):
		id, err := uuid.Parse(strings.TrimPrefix(u, "/api/v1/files/"))
		if err != nil {
			return nil, apperr.Invalid("bad image link")
		}
		up, err := s.Q.GetUpload(ctx, id)
		if err != nil || up.Status != "ready" {
			return nil, apperr.Invalid("an image of this template was not found: upload it again")
		}
		key = up.ObjectKey
	case s.Cfg.S3PublicURL != "" && strings.HasPrefix(u, s.Cfg.S3PublicURL+"/"):
		key = strings.TrimPrefix(u, s.Cfg.S3PublicURL+"/")
	default:
		return nil, apperr.Invalid("upload the image here instead of using an outside link")
	}
	rc, err := s.Store.Get(ctx, key)
	if err != nil {
		return nil, apperr.Unavailable("file storage is not reachable")
	}
	defer rc.Close()
	b, err := io.ReadAll(io.LimitReader(rc, 25<<20))
	if err != nil {
		return nil, apperr.Unavailable("file storage is not reachable")
	}
	if imageType(b) == "" {
		return nil, apperr.Invalid("use a JPG or PNG image (WebP and other formats cannot go in a PDF)")
	}
	certImageCache.Lock()
	if certImageCache.size+len(b) > certImageCacheMax {
		certImageCache.m, certImageCache.size = map[string][]byte{}, 0
	}
	certImageCache.m[u] = b
	certImageCache.size += len(b)
	certImageCache.Unlock()
	return b, nil
}

func nonNilFields(f []dto.CertificateField) []dto.CertificateField {
	if f == nil {
		return []dto.CertificateField{}
	}
	return f
}

