package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type publicCoursesIn struct {
	Q        string `query:"q" maxLength:"100"`
	Category string `query:"category" maxLength:"60"`
	Limit    int32  `query:"limit" default:"60" minimum:"1" maximum:"200"`
}

type slugPath struct {
	Slug string `path:"slug" maxLength:"120"`
}

type limitIn struct {
	Limit int32 `query:"limit" default:"20" minimum:"1" maximum:"100"`
}

type leadListIn struct {
	dto.PageQuery
	Status string `query:"status" enum:"new,contacted,converted,lost,"`
	Q      string `query:"q" maxLength:"100"`
}

type blogListIn struct {
	dto.PageQuery
	Status string `query:"status" enum:"draft,published,"`
	Q      string `query:"q" maxLength:"100"`
}

type keyBody struct {
	Key  string `path:"key" maxLength:"40"`
	Body dto.CMSInput
}

func (h *Handler) siteRoutes(api huma.API) {
	t, g := "Public website", h.g
	huma.Register(api, op("site-info", http.MethodGet, "/public/site", t, "Branding and landing page content"), h.siteInfo)
	huma.Register(api, op("public-courses", http.MethodGet, "/public/courses", t, "Course catalog"), h.publicCourses)
	huma.Register(api, op("public-categories", http.MethodGet, "/public/categories", t, "Catalog categories"), h.publicCategories)
	huma.Register(api, op("public-course", http.MethodGet, "/public/courses/{slug}", t, "Course page: syllabus, mentors, batches"), h.publicCourse)
	huma.Register(api, op("public-posts", http.MethodGet, "/public/blog", t, "Published blog posts"), h.publicPosts)
	huma.Register(api, op("public-post", http.MethodGet, "/public/blog/{slug}", t, "One blog post"), h.publicPost)
	huma.Register(api, op("create-lead", http.MethodPost, "/public/leads", t, "Enquiry / contact form", g.RateLimit("lead", 10, time.Hour)), h.createLead)

	t = "Website admin"
	huma.Register(api, op("list-cms", http.MethodGet, "/cms", t, "Landing page blocks", g.Perm("cms", "view")), h.listCMS)
	huma.Register(api, op("save-cms", http.MethodPut, "/cms/{key}", t, "Save a landing page block", g.Perm("cms", "edit")), h.saveCMS)
	huma.Register(api, op("list-leads", http.MethodGet, "/leads", t, "Enquiries", g.Perm("leads", "view")), h.listLeads)
	huma.Register(api, op("export-leads", http.MethodGet, "/leads/export", t, "Download enquiries as CSV", g.Perm("leads", "view")), h.exportLeads)
	huma.Register(api, op("update-lead", http.MethodPut, "/leads/{id}", t, "Update lead status / notes", g.Perm("leads", "edit")), h.updateLead)
	huma.Register(api, op("delete-lead", http.MethodDelete, "/leads/{id}", t, "Delete a lead", g.Perm("leads", "delete")), h.deleteLead)
	huma.Register(api, op("list-posts", http.MethodGet, "/blog", t, "Blog posts", g.Perm("blog", "view")), h.listPosts)
	huma.Register(api, op("create-post", http.MethodPost, "/blog", t, "Write a blog post", g.Perm("blog", "create")), h.createPost)
	huma.Register(api, op("get-post", http.MethodGet, "/blog/{id}", t, "Get a blog post", g.Perm("blog", "view")), h.getPost)
	huma.Register(api, op("update-post", http.MethodPut, "/blog/{id}", t, "Update a blog post", g.Perm("blog", "edit")), h.updatePost)
	huma.Register(api, op("delete-post", http.MethodDelete, "/blog/{id}", t, "Delete a blog post", g.Perm("blog", "delete")), h.deletePost)
}

func (h *Handler) siteInfo(ctx context.Context, _ *noInput) (*Out[dto.SiteInfo], error) {
	return ok(h.s.Site.Info(ctx))
}

func (h *Handler) publicCourses(ctx context.Context, in *publicCoursesIn) (*Out[[]dto.PublicCourse], error) {
	return ok(h.s.Site.Courses(ctx, in.Q, in.Category, in.Limit))
}

func (h *Handler) publicCategories(ctx context.Context, _ *noInput) (*Out[[]string], error) {
	return ok(h.s.Site.Categories(ctx))
}

func (h *Handler) publicCourse(ctx context.Context, in *slugPath) (*Out[dto.PublicCourseDetail], error) {
	return ok(h.s.Site.Course(ctx, in.Slug))
}

func (h *Handler) publicPosts(ctx context.Context, in *limitIn) (*Out[[]dto.PublicPost], error) {
	return ok(h.s.Site.PublicPosts(ctx, in.Limit))
}

func (h *Handler) publicPost(ctx context.Context, in *slugPath) (*Out[dto.BlogPost], error) {
	return ok(h.s.Site.PublicPost(ctx, in.Slug))
}

func (h *Handler) createLead(ctx context.Context, in *bodyIn[dto.LeadInput]) (*Out[dto.OK], error) {
	return ack(h.s.Site.CreateLead(ctx, in.Body), "thanks! our team will contact you soon")
}

func (h *Handler) listCMS(ctx context.Context, _ *noInput) (*Out[[]dto.CMSBlock], error) {
	return ok(h.s.Site.CMS(ctx))
}

func (h *Handler) saveCMS(ctx context.Context, in *keyBody) (*Out[dto.CMSBlock], error) {
	return ok(h.s.Site.SaveCMS(ctx, actor(ctx), in.Key, in.Body))
}

// v1 lead routes, bridged to the v2 LeadService until the CRM handlers land.
// The old ?status filter maps to a stage kind: converted→won, lost→lost, new/contacted→open.
func (h *Handler) listLeads(ctx context.Context, in *leadListIn) (*Out[dto.LeadList], error) {
	kind := map[string]string{"new": "open", "contacted": "open", "converted": "won", "lost": "lost"}[in.Status]
	return ok(h.s.Leads.List(ctx, actor(ctx), dto.LeadFilter{PageQuery: in.PageQuery, StageKind: kind, Q: in.Q}))
}

func (h *Handler) exportLeads(ctx context.Context, _ *noInput) (*FileOut, error) {
	return file(h.s.Leads.Export(ctx, actor(ctx)))
}

func (h *Handler) updateLead(ctx context.Context, in *idBody[dto.LeadUpdate]) (*Out[dto.Lead], error) {
	id, err := parseID(in.ID, "lead")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Leads.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteLead(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "lead")
	if err != nil {
		return nil, err
	}
	return done(h.s.Leads.Delete(ctx, actor(ctx), id))
}

func (h *Handler) listPosts(ctx context.Context, in *blogListIn) (*Out[dto.List[dto.BlogPost]], error) {
	return ok(h.s.Site.Posts(ctx, dto.BlogFilter{PageQuery: in.PageQuery, Status: in.Status, Q: in.Q}))
}

func (h *Handler) createPost(ctx context.Context, in *bodyIn[dto.BlogInput]) (*Out[dto.BlogPost], error) {
	return ok(h.s.Site.CreatePost(ctx, actor(ctx), in.Body))
}

func (h *Handler) getPost(ctx context.Context, in *idPath) (*Out[dto.BlogPost], error) {
	id, err := parseID(in.ID, "post")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Site.Post(ctx, id))
}

func (h *Handler) updatePost(ctx context.Context, in *idBody[dto.BlogInput]) (*Out[dto.BlogPost], error) {
	id, err := parseID(in.ID, "post")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Site.UpdatePost(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deletePost(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "post")
	if err != nil {
		return nil, err
	}
	return done(h.s.Site.DeletePost(ctx, actor(ctx), id))
}
