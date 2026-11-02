package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type liveListIn struct {
	dto.PageQuery
	From     time.Time `query:"from" doc:"Sessions starting at/after (RFC3339)"`
	To       time.Time `query:"to" doc:"Sessions starting before (RFC3339)"`
	CourseID string    `query:"course_id"`
}

type myLiveIn struct {
	Scope string `query:"scope" enum:"upcoming,past" default:"upcoming"`
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func (h *Handler) liveRoutes(api huma.API) {
	t, g := "Live sessions", h.g
	huma.Register(api, op("list-live", http.MethodGet, "/live", t, "List live sessions", g.Perm("live", "view")), h.listLive)
	huma.Register(api, op("create-live", http.MethodPost, "/live", t, "Schedule a Google Meet session", g.Perm("live", "create")), h.createLive)
	huma.Register(api, op("get-live", http.MethodGet, "/live/{id}", t, "Session with audience and attendance", g.Perm("live", "view")), h.getLive)
	huma.Register(api, op("update-live", http.MethodPut, "/live/{id}", t, "Update a session", g.Perm("live", "edit")), h.updateLive)
	huma.Register(api, op("delete-live", http.MethodDelete, "/live/{id}", t, "Delete a session", g.Perm("live", "delete")), h.deleteLive)
	huma.Register(api, op("mark-live-attendance", http.MethodPut, "/live/{id}/attendance", t, "Mark attendance manually", g.Perm("live", "edit")), h.markLive)
	huma.Register(api, op("set-live-recording", http.MethodPut, "/live/{id}/recording", t, "Attach a recording link", g.Perm("live", "edit")), h.setRecording)
	huma.Register(api, op("sync-live", http.MethodPost, "/live/{id}/sync", t, "Sync with Google Calendar / Meet / Drive", g.Perm("live", "edit")), h.syncLive)
	huma.Register(api, op("live-ics", http.MethodGet, "/live/{id}/ics", t, "Download .ics calendar file", g.Staff()), h.liveICS)

	huma.Register(api, op("my-live", http.MethodGet, "/me/live", t, "My upcoming or past live sessions", g.Student()), h.myLive)
	huma.Register(api, op("join-live", http.MethodPost, "/me/live/{id}/join", t, "Join (records attendance) and get the Meet link", g.Student()), h.joinLive)
	huma.Register(api, op("my-live-ics", http.MethodGet, "/me/live/{id}/ics", t, "Add a session to my calendar (.ics)", g.Student()), h.liveICS)
}

func (h *Handler) listLive(ctx context.Context, in *liveListIn) (*Out[dto.List[dto.LiveSession]], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.List(ctx, actor(ctx), dto.LiveFilter{PageQuery: in.PageQuery, From: timePtr(in.From), To: timePtr(in.To), CourseID: cid}))
}

func (h *Handler) createLive(ctx context.Context, in *bodyIn[dto.LiveInput]) (*Out[dto.LiveDetail], error) {
	return ok(h.s.Live.Create(ctx, actor(ctx), in.Body))
}

func (h *Handler) getLive(ctx context.Context, in *idPath) (*Out[dto.LiveDetail], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.Get(ctx, actor(ctx), id))
}

func (h *Handler) updateLive(ctx context.Context, in *idBody[dto.LiveInput]) (*Out[dto.LiveDetail], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteLive(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return done(h.s.Live.Delete(ctx, actor(ctx), id))
}

func (h *Handler) markLive(ctx context.Context, in *idBody[dto.LiveAttendanceInput]) (*Out[dto.LiveDetail], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.MarkAttendance(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) setRecording(ctx context.Context, in *idBody[dto.RecordingInput]) (*Out[dto.LiveDetail], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.SetRecording(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) syncLive(ctx context.Context, in *idBody[dto.SyncInput]) (*Out[dto.SyncResult], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.Sync(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) liveICS(ctx context.Context, in *idPath) (*FileOut, error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return file(h.s.Live.ICS(ctx, actor(ctx), id))
}

func (h *Handler) myLive(ctx context.Context, in *myLiveIn) (*Out[[]dto.LiveSession], error) {
	return ok(h.s.Live.Mine(ctx, actor(ctx), in.Scope))
}

func (h *Handler) joinLive(ctx context.Context, in *idPath) (*Out[dto.JoinResult], error) {
	id, err := parseID(in.ID, "live session")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Live.Join(ctx, actor(ctx), id))
}
