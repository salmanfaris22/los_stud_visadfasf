package service

import (
	"context"
	"fmt"
	"path"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// UploadService issues presigned upload URLs (browser → storage directly) and signed downloads.
type UploadService struct{ base }

var imageMimes = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "image/gif": true}

var fileMimes = map[string]bool{
	"application/pdf": true, "application/zip": true, "application/x-zip-compressed": true,
	"application/msword": true, "application/vnd.openxmlformats-officedocument.wordprocessingml.document": true,
	"application/vnd.ms-excel": true, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": true,
	"application/vnd.ms-powerpoint": true, "application/vnd.openxmlformats-officedocument.presentationml.presentation": true,
	"text/plain": true, "text/csv": true, "application/json": true, "video/mp4": true, "audio/mpeg": true,
}

type uploadRule struct{ public, staffOnly, imagesOnly bool }

var uploadRules = map[string]uploadRule{
	"submission": {},
	"comment":    {},
	"avatar":     {public: true, imagesOnly: true},
	"thumbnail":  {public: true, staffOnly: true, imagesOnly: true},
	"cms":        {public: true, staffOnly: true, imagesOnly: true},
	"blog":       {public: true, staffOnly: true, imagesOnly: true},
}

// IsImage reports whether a mime type is an accepted image.
func IsImage(mime string) bool { return imageMimes[mime] }

// uploadLimit returns the max bytes allowed for a mime type under current settings.
func uploadLimit(st Settings, mime string) int64 {
	if imageMimes[mime] {
		return int64(st.Uploads.MaxImageMB) << 20
	}
	return int64(st.Uploads.MaxFileMB) << 20
}

// FileURL is the stable URL stored in records (it redirects to a signed link).
func (b base) fileURL(u repository.Upload) string {
	if u.IsPublic && b.Cfg.S3PublicURL != "" {
		return b.Cfg.S3PublicURL + "/" + u.ObjectKey
	}
	return "/api/v1/files/" + u.ID.String()
}

func fileURLByID(id uuid.UUID) string { return "/api/v1/files/" + id.String() }

func (b base) toUpload(u repository.Upload) dto.Upload {
	return dto.Upload{ID: u.ID, FileName: u.FileName, Mime: u.Mime, SizeBytes: u.SizeBytes, URL: b.fileURL(u), Status: u.Status}
}

var unsafeName = regexp.MustCompile(`[^A-Za-z0-9._-]+`)

func cleanFileName(n string) string {
	n = path.Base(strings.ReplaceAll(n, "\\", "/"))
	n = strings.Trim(unsafeName.ReplaceAllString(n, "-"), "-.")
	if n == "" {
		n = "file"
	}
	if len(n) > 120 {
		n = n[len(n)-120:]
	}
	return n
}

func (s *UploadService) Presign(ctx context.Context, actor *auth.Principal, in dto.PresignInput) (dto.Presigned, error) {
	rule, ok := uploadRules[in.Purpose]
	if !ok {
		return dto.Presigned{}, apperr.Invalid("unknown upload purpose")
	}
	if rule.staffOnly && !actor.IsStaff() {
		return dto.Presigned{}, apperr.Forbidden("staff only")
	}
	if in.Purpose == "submission" && !actor.IsStudent() {
		return dto.Presigned{}, apperr.Forbidden("only students upload submissions")
	}
	mime := strings.ToLower(strings.TrimSpace(strings.Split(in.Mime, ";")[0]))
	if rule.imagesOnly && !imageMimes[mime] {
		return dto.Presigned{}, apperr.Invalid("please upload a PNG, JPG, WEBP or GIF image")
	}
	if !imageMimes[mime] && !fileMimes[mime] {
		return dto.Presigned{}, apperr.Invalid("file type %s is not allowed", mime)
	}
	st := s.settings.Get(ctx)
	if in.Size > uploadLimit(st, mime) {
		if imageMimes[mime] {
			return dto.Presigned{}, apperr.Invalid("images must be %d MB or smaller", st.Uploads.MaxImageMB)
		}
		return dto.Presigned{}, apperr.Invalid("files must be %d MB or smaller", st.Uploads.MaxFileMB)
	}
	key := fmt.Sprintf("%s/%s/%s/%s", in.Purpose, time.Now().UTC().Format("2006/01"), uuid.NewString(), cleanFileName(in.FileName))
	u, err := s.Q.CreateUpload(ctx, repository.CreateUploadParams{OwnerID: actor.ID, Purpose: in.Purpose, ObjectKey: key, FileName: strings.TrimSpace(in.FileName),
		Mime: mime, SizeBytes: in.Size, IsPublic: rule.public})
	if err != nil {
		return dto.Presigned{}, dbErr(err, "upload")
	}
	putURL, err := s.Store.PresignPut(ctx, key, 15*time.Minute)
	if err != nil {
		return dto.Presigned{}, apperr.Unavailable("file storage is not reachable")
	}
	return dto.Presigned{Upload: s.toUpload(u), PutURL: putURL, Headers: map[string]string{"Content-Type": mime}}, nil
}

// Complete verifies the object landed in storage and is within limits.
func (s *UploadService) Complete(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.Upload, error) {
	u, err := s.Q.GetUpload(ctx, id)
	if err != nil || u.OwnerID != actor.ID {
		return dto.Upload{}, apperr.NotFound("upload")
	}
	size, _, err := s.Store.Size(ctx, u.ObjectKey)
	if err != nil {
		return dto.Upload{}, apperr.Invalid("the file did not arrive, please upload again")
	}
	if size > uploadLimit(s.settings.Get(ctx), u.Mime) {
		_ = s.Store.Remove(ctx, u.ObjectKey)
		_ = s.Q.DeleteUpload(ctx, u.ID)
		return dto.Upload{}, apperr.Invalid("file is larger than allowed")
	}
	if u, err = s.Q.MarkUploadReady(ctx, repository.MarkUploadReadyParams{ID: id, SizeBytes: size}); err != nil {
		return dto.Upload{}, dbErr(err, "upload")
	}
	return s.toUpload(u), nil
}

// DownloadURL returns a signed link when the principal may read the file.
func (s *UploadService) DownloadURL(ctx context.Context, actor *auth.Principal, id uuid.UUID, download bool) (string, bool, error) {
	u, err := s.Q.GetUpload(ctx, id)
	if err != nil || u.Status != "ready" {
		return "", false, apperr.NotFound("file")
	}
	if !s.canRead(ctx, actor, u) {
		return "", false, apperr.Forbidden("you cannot open this file")
	}
	ttl := 10 * time.Minute
	if u.IsPublic {
		ttl = 6 * time.Hour
	}
	link, err := s.Store.PresignGet(ctx, u.ObjectKey, u.FileName, download, ttl)
	if err != nil {
		return "", false, apperr.Unavailable("file storage is not reachable")
	}
	return link, u.IsPublic, nil
}

func (s *UploadService) canRead(ctx context.Context, p *auth.Principal, u repository.Upload) bool {
	switch {
	case u.IsPublic:
		return true
	case p == nil:
		return false
	case u.OwnerID == p.ID:
		return true
	case p.IsStaff():
		return p.Can("submissions", "view") || p.Can("students", "view")
	}
	ok, _ := s.Q.UploadInStudentThread(ctx, repository.UploadInStudentThreadParams{UploadID: &u.ID, StudentID: p.ID})
	return ok
}

// requireReady checks an upload belongs to the owner and finished uploading (used by submissions/comments).
func (b base) requireReady(ctx context.Context, owner uuid.UUID, id uuid.UUID) (repository.Upload, error) {
	u, err := b.Q.GetUpload(ctx, id)
	if err != nil || u.OwnerID != owner {
		return u, apperr.Invalid("attachment not found, upload it again")
	}
	if u.Status != "ready" {
		return u, apperr.Invalid("attachment %s did not finish uploading", u.FileName)
	}
	return u, nil
}
