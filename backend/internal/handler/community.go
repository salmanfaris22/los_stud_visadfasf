package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type moderationIn struct {
	dto.PageQuery
	Unanswered bool `query:"unanswered"`
}

type pinBody struct {
	Pinned bool `json:"pinned"`
}

type myAnnouncementsIn struct {
	Limit int32 `query:"limit" default:"30" minimum:"1" maximum:"200"`
}

func (h *Handler) commentRoutes(api huma.API) {
	t, g := "Video Q&A", h.g
	huma.Register(api, op("list-video-comments", http.MethodGet, "/videos/{id}/comments", t, "Questions and answers under a video", g.Auth()), h.listComments)
	huma.Register(api, op("create-video-comment", http.MethodPost, "/videos/{id}/comments", t, "Ask a question or reply", g.Auth()), h.createComment)
	huma.Register(api, op("delete-video-comment", http.MethodDelete, "/comments/{id}", t, "Delete a comment", g.Auth()), h.deleteComment)
	huma.Register(api, op("pin-video-comment", http.MethodPut, "/comments/{id}/pin", t, "Pin or unpin a comment", g.Perm("comments", "edit")), h.pinComment)
	huma.Register(api, op("moderate-comments", http.MethodGet, "/comments", t, "Recent comments across courses", g.Perm("comments", "view")), h.moderation)
}

func (h *Handler) listComments(ctx context.Context, in *idPath) (*Out[[]dto.VideoComment], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Comments.List(ctx, actor(ctx), id))
}

func (h *Handler) createComment(ctx context.Context, in *idBody[dto.VideoCommentInput]) (*Out[[]dto.VideoComment], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Comments.Create(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteComment(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "comment")
	if err != nil {
		return nil, err
	}
	return done(h.s.Comments.Delete(ctx, actor(ctx), id))
}

func (h *Handler) pinComment(ctx context.Context, in *idBody[pinBody]) (*Out[dto.OK], error) {
	id, err := parseID(in.ID, "comment")
	if err != nil {
		return nil, err
	}
	return ack(h.s.Comments.Pin(ctx, actor(ctx), id, in.Body.Pinned), "")
}

func (h *Handler) moderation(ctx context.Context, in *moderationIn) (*Out[dto.List[dto.ModerationComment]], error) {
	return ok(h.s.Comments.Moderation(ctx, actor(ctx), in.Unanswered, in.PageQuery))
}

func (h *Handler) announcementRoutes(api huma.API) {
	t, g := "Announcements", h.g
	huma.Register(api, op("list-announcements", http.MethodGet, "/announcements", t, "List announcements", g.Perm("announcements", "view")), h.listAnnouncements)
	huma.Register(api, op("create-announcement", http.MethodPost, "/announcements", t, "Post an announcement (notifies students)", g.Perm("announcements", "create")), h.createAnnouncement)
	huma.Register(api, op("update-announcement", http.MethodPut, "/announcements/{id}", t, "Update an announcement", g.Perm("announcements", "edit")), h.updateAnnouncement)
	huma.Register(api, op("delete-announcement", http.MethodDelete, "/announcements/{id}", t, "Delete an announcement", g.Perm("announcements", "delete")), h.deleteAnnouncement)
	huma.Register(api, op("my-announcements", http.MethodGet, "/me/announcements", t, "Announcements for me", g.Student()), h.myAnnouncements)
}

func (h *Handler) listAnnouncements(ctx context.Context, in *pageIn) (*Out[dto.List[dto.Announcement]], error) {
	return ok(h.s.Announcements.List(ctx, in.PageQuery))
}

func (h *Handler) createAnnouncement(ctx context.Context, in *bodyIn[dto.AnnouncementInput]) (*Out[dto.Announcement], error) {
	return ok(h.s.Announcements.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) updateAnnouncement(ctx context.Context, in *idBody[dto.AnnouncementInput]) (*Out[dto.Announcement], error) {
	id, err := parseID(in.ID, "announcement")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Announcements.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteAnnouncement(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "announcement")
	if err != nil {
		return nil, err
	}
	return done(h.s.Announcements.Delete(ctx, actor(ctx), id))
}

func (h *Handler) myAnnouncements(ctx context.Context, in *myAnnouncementsIn) (*Out[[]dto.Announcement], error) {
	return ok(h.s.Announcements.Mine(ctx, actor(ctx), in.Limit))
}
