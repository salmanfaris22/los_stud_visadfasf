package service

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// SiteService powers the public website (catalog, course pages, blog, enquiry form)
// and its admin side (CMS blocks, leads, blog posts).
type SiteService struct {
	base
	leads *LeadService
}

// CMSKeys are the editable landing-page blocks.
var CMSKeys = []string{"hero", "stats", "features", "how", "testimonials", "faqs", "cta", "footer"}

func validCMSKey(k string) bool {
	for _, x := range CMSKeys {
		if x == k {
			return true
		}
	}
	return false
}

func (s *SiteService) blocks(ctx context.Context) (map[string]map[string]any, []dto.CMSBlock, error) {
	rows, err := s.Q.ListCMSBlocks(ctx)
	if err != nil {
		return nil, nil, dbErr(err, "cms")
	}
	m := map[string]map[string]any{}
	list := make([]dto.CMSBlock, 0, len(rows))
	for _, r := range rows {
		data := map[string]any{}
		_ = json.Unmarshal(r.Data, &data)
		m[r.Key] = data
		list = append(list, dto.CMSBlock{Key: r.Key, Data: data, UpdatedAt: r.UpdatedAt})
	}
	return m, list, nil
}

func (s *SiteService) Info(ctx context.Context) (dto.SiteInfo, error) {
	st := s.settings.Get(ctx)
	m, _, err := s.blocks(ctx)
	if err != nil {
		return dto.SiteInfo{}, err
	}
	return dto.SiteInfo{Branding: st.Branding, Signup: st.Signup.Enabled, Google: s.Google.Enabled(), Blocks: m}, nil
}

func (s *SiteService) Courses(ctx context.Context, q, category string, limit int32) ([]dto.PublicCourse, error) {
	rows, err := s.Q.ListPublicCourses(ctx, repository.ListPublicCoursesParams{Q: optStr(q), Category: optStr(category), Lim: limit})
	if err != nil {
		return nil, dbErr(err, "courses")
	}
	out := make([]dto.PublicCourse, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.PublicCourse{ID: r.ID, Slug: r.Slug, Title: r.Title, Subtitle: r.Subtitle, ThumbnailURL: r.ThumbnailUrl, Level: r.Level,
			Language: r.Language, Category: r.Category, PriceLabel: r.PriceLabel, VideoCount: r.VideoCount, TotalSeconds: r.TotalSeconds, StudentCount: r.StudentCount})
	}
	return out, nil
}

func (s *SiteService) Categories(ctx context.Context) ([]string, error) {
	c, err := s.Q.ListPublicCategories(ctx)
	return c, dbErr(err, "categories")
}

func (s *SiteService) Course(ctx context.Context, slug string) (dto.PublicCourseDetail, error) {
	c, err := s.Q.GetCourseBySlug(ctx, slug)
	if err != nil || c.Status != "published" || !c.IsPublic {
		return dto.PublicCourseDetail{}, apperr.NotFound("course")
	}
	videos, err := s.curriculum(ctx, c.ID)
	if err != nil {
		return dto.PublicCourseDetail{}, err
	}
	mentors, err := s.mentors(ctx, c.ID)
	if err != nil {
		return dto.PublicCourseDetail{}, err
	}
	batches, err := s.Q.ListCourseOpenBatches(ctx, c.ID)
	if err != nil {
		return dto.PublicCourseDetail{}, dbErr(err, "batches")
	}
	det := dto.PublicCourseDetail{Description: c.Description, WhatYouLearn: c.WhatYouLearn, Lessons: make([]dto.PublicLesson, 0, len(videos)),
		Mentors: mentors, Batches: make([]dto.PublicBatch, 0, len(batches))}
	total := int32(0)
	for _, v := range videos {
		l := dto.PublicLesson{ID: v.ID, Title: v.Title, DurationSeconds: v.DurationSeconds, IsPreview: v.IsPreview, ThumbnailURL: v.ThumbnailURL, TaskCount: len(v.Tasks)}
		if v.IsPreview {
			l.EmbedURL = v.EmbedURL
		}
		total += v.DurationSeconds
		det.TaskCount += len(v.Tasks)
		det.Lessons = append(det.Lessons, l)
	}
	for _, b := range batches {
		det.Batches = append(det.Batches, dto.PublicBatch{ID: b.ID, Name: b.Name, StartDate: dateStr(b.StartDate), EndDate: dateStr(b.EndDate), Location: b.Location,
			ScheduleNote: b.ScheduleNote, Status: b.Status, TypeName: b.TypeName, IsOffline: b.IsOffline})
	}
	det.Course = dto.PublicCourse{ID: c.ID, Slug: c.Slug, Title: c.Title, Subtitle: c.Subtitle, ThumbnailURL: c.ThumbnailUrl, Level: c.Level, Language: c.Language,
		Category: c.Category, PriceLabel: c.PriceLabel, VideoCount: int32(len(videos)), TotalSeconds: total}
	return det, nil
}

// ── enquiry form ──

// CreateLead stores a website enquiry as a CRM lead (de-duplicated and auto-assigned).
func (s *SiteService) CreateLead(ctx context.Context, in dto.LeadInput) error {
	_, err := s.leads.Capture(ctx, nil, LeadCapture{Name: in.Name, Email: in.Email, Phone: in.Phone, CourseID: in.CourseID,
		Message: in.Message, Source: orDefault(in.Source, "website")})
	return err
}

// ── CMS ──

func (s *SiteService) CMS(ctx context.Context) ([]dto.CMSBlock, error) {
	_, list, err := s.blocks(ctx)
	return list, err
}

func (s *SiteService) SaveCMS(ctx context.Context, actor *auth.Principal, key string, in dto.CMSInput) (dto.CMSBlock, error) {
	if !validCMSKey(key) {
		return dto.CMSBlock{}, apperr.Invalid("unknown block %q (use one of %s)", key, strings.Join(CMSKeys, ", "))
	}
	raw, err := json.Marshal(in.Data)
	if err != nil || len(raw) > 200_000 {
		return dto.CMSBlock{}, apperr.Invalid("block content is too large")
	}
	r, err := s.Q.UpsertCMSBlock(ctx, repository.UpsertCMSBlockParams{Key: key, Data: raw, UpdatedBy: &actor.ID})
	if err != nil {
		return dto.CMSBlock{}, dbErr(err, "cms block")
	}
	s.audit.Log(ctx, actor, "update", "cms", key, nil)
	return dto.CMSBlock{Key: r.Key, Data: in.Data, UpdatedAt: r.UpdatedAt}, nil
}

// ── blog ──

func toPost(b repository.BlogPost, author string) dto.BlogPost {
	return dto.BlogPost{ID: b.ID, Slug: b.Slug, Title: b.Title, Excerpt: b.Excerpt, Content: b.Content, CoverURL: b.CoverUrl, Tags: b.Tags, Status: b.Status,
		PublishedAt: b.PublishedAt, SeoTitle: b.SeoTitle, SeoDescription: b.SeoDescription, AuthorName: author, CreatedAt: b.CreatedAt, UpdatedAt: b.UpdatedAt}
}

func (s *SiteService) Posts(ctx context.Context, f dto.BlogFilter) (dto.List[dto.BlogPost], error) {
	rows, err := s.Q.ListBlogPosts(ctx, repository.ListBlogPostsParams{Status: optStr(f.Status), Q: optStr(f.Q), Lim: f.Lim(), Off: f.Off()})
	if err != nil {
		return dto.List[dto.BlogPost]{}, dbErr(err, "posts")
	}
	out := make([]dto.BlogPost, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, toPost(repository.BlogPost{ID: r.ID, Slug: r.Slug, Title: r.Title, Excerpt: r.Excerpt, Content: r.Content, CoverUrl: r.CoverUrl, Tags: r.Tags,
			Status: r.Status, PublishedAt: r.PublishedAt, SeoTitle: r.SeoTitle, SeoDescription: r.SeoDescription, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}, str(r.AuthorName)))
	}
	return dto.NewList(out, total, f.PageQuery), nil
}

func (s *SiteService) Post(ctx context.Context, id uuid.UUID) (dto.BlogPost, error) {
	b, err := s.Q.GetBlogPost(ctx, id)
	if err != nil {
		return dto.BlogPost{}, dbErr(err, "post")
	}
	return toPost(b, ""), nil
}

func (s *SiteService) postSlug(ctx context.Context, in dto.BlogInput, self uuid.UUID) (string, error) {
	base := orDefault(in.Slug, Slugify(in.Title))
	slug := base
	for i := 2; i < 500; i++ {
		p, err := s.Q.GetPublishedPostBySlug(ctx, slug)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && p.ID == self) {
			break
		}
		if err != nil {
			return "", dbErr(err, "post")
		}
		slug = fmt.Sprintf("%s-%d", base, i)
	}
	return slug, nil
}

func cleanTags(tags []string) []string {
	out := []string{}
	for _, t := range tags {
		if t = strings.ToLower(strings.TrimSpace(t)); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func (s *SiteService) CreatePost(ctx context.Context, actor *auth.Principal, in dto.BlogInput) (dto.BlogPost, error) {
	slug, err := s.postSlug(ctx, in, uuid.Nil)
	if err != nil {
		return dto.BlogPost{}, err
	}
	b, err := s.Q.CreateBlogPost(ctx, repository.CreateBlogPostParams{Slug: slug, Title: strings.TrimSpace(in.Title), Excerpt: in.Excerpt, Content: in.Content,
		CoverUrl: in.CoverURL, Tags: cleanTags(in.Tags), Status: in.Status, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription, AuthorID: &actor.ID})
	if err != nil {
		return dto.BlogPost{}, dbErr(err, "post with this slug")
	}
	s.audit.Log(ctx, actor, "create", "blog", b.ID, map[string]string{"title": b.Title, "status": b.Status})
	return toPost(b, actor.Name), nil
}

func (s *SiteService) UpdatePost(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.BlogInput) (dto.BlogPost, error) {
	slug, err := s.postSlug(ctx, in, id)
	if err != nil {
		return dto.BlogPost{}, err
	}
	b, err := s.Q.UpdateBlogPost(ctx, repository.UpdateBlogPostParams{ID: id, Slug: slug, Title: strings.TrimSpace(in.Title), Excerpt: in.Excerpt, Content: in.Content,
		CoverUrl: in.CoverURL, Tags: cleanTags(in.Tags), Status: in.Status, SeoTitle: in.SeoTitle, SeoDescription: in.SeoDescription})
	if err != nil {
		return dto.BlogPost{}, dbErr(err, "post with this slug")
	}
	s.audit.Log(ctx, actor, "update", "blog", id, map[string]string{"title": b.Title, "status": b.Status})
	return toPost(b, ""), nil
}

func (s *SiteService) DeletePost(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	if err := s.Q.DeleteBlogPost(ctx, id); err != nil {
		return dbErr(err, "post")
	}
	s.audit.Log(ctx, actor, "delete", "blog", id, nil)
	return nil
}

func (s *SiteService) PublicPosts(ctx context.Context, limit int32) ([]dto.PublicPost, error) {
	rows, err := s.Q.ListPublishedPosts(ctx, limit)
	if err != nil {
		return nil, dbErr(err, "posts")
	}
	out := make([]dto.PublicPost, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.PublicPost{ID: r.ID, Slug: r.Slug, Title: r.Title, Excerpt: r.Excerpt, CoverURL: r.CoverUrl, Tags: r.Tags, PublishedAt: r.PublishedAt, AuthorName: str(r.AuthorName)})
	}
	return out, nil
}

func (s *SiteService) PublicPost(ctx context.Context, slug string) (dto.BlogPost, error) {
	r, err := s.Q.GetPublishedPostBySlug(ctx, slug)
	if err != nil {
		return dto.BlogPost{}, dbErr(err, "post")
	}
	return toPost(repository.BlogPost{ID: r.ID, Slug: r.Slug, Title: r.Title, Excerpt: r.Excerpt, Content: r.Content, CoverUrl: r.CoverUrl, Tags: r.Tags, Status: r.Status,
		PublishedAt: r.PublishedAt, SeoTitle: r.SeoTitle, SeoDescription: r.SeoDescription, CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt}, str(r.AuthorName)), nil
}
