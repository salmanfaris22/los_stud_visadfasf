package service

import (
	"context"
	"strings"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// CommentService is the YouTube-style Q&A under each video.
type CommentService struct{ base }

// canSee checks a user may read/post comments on a video.
func (s *CommentService) canSee(ctx context.Context, actor *auth.Principal, videoID uuid.UUID) (repository.Video, error) {
	v, err := s.Q.GetVideo(ctx, videoID)
	if err != nil {
		return v, dbErr(err, "video")
	}
	if actor.IsStudent() {
		return v, s.access.EnsureEnrolled(ctx, actor, v.CourseID)
	}
	if !actor.Can("comments", "view") {
		return v, apperr.Forbidden("you need the comments view permission")
	}
	return v, s.access.EnsureCourse(ctx, actor, v.CourseID)
}

func (s *CommentService) List(ctx context.Context, actor *auth.Principal, videoID uuid.UUID) ([]dto.VideoComment, error) {
	if _, err := s.canSee(ctx, actor, videoID); err != nil {
		return nil, err
	}
	rows, err := s.Q.ListVideoComments(ctx, videoID)
	if err != nil {
		return nil, dbErr(err, "comments")
	}
	top := []dto.VideoComment{}
	replies := map[uuid.UUID][]dto.VideoComment{}
	for _, r := range rows {
		c := dto.VideoComment{ID: r.ID, VideoID: r.VideoID, ParentID: r.ParentID, AuthorID: r.UserID, AuthorName: r.AuthorName, AuthorAvatar: str(r.AuthorAvatar),
			AuthorKind: r.AuthorKind, Body: r.Body, Pinned: r.Pinned, CreatedAt: r.CreatedAt, Replies: []dto.VideoComment{}}
		if r.ParentID == nil {
			top = append(top, c)
		} else {
			replies[*r.ParentID] = append([]dto.VideoComment{c}, replies[*r.ParentID]...) // oldest reply first
		}
	}
	for i := range top {
		if rs := replies[top[i].ID]; rs != nil {
			top[i].Replies = rs
		}
	}
	return top, nil
}

func (s *CommentService) Create(ctx context.Context, actor *auth.Principal, videoID uuid.UUID, in dto.VideoCommentInput) ([]dto.VideoComment, error) {
	v, err := s.canSee(ctx, actor, videoID)
	if err != nil {
		return nil, err
	}
	if actor.IsStaff() && !actor.Can("comments", "create") {
		return nil, apperr.Forbidden("you need the comments create permission")
	}
	var parent repository.VideoComment
	if in.ParentID != nil {
		if parent, err = s.Q.GetVideoComment(ctx, *in.ParentID); err != nil || parent.VideoID != videoID {
			return nil, apperr.NotFound("comment")
		}
		if parent.ParentID != nil { // keep threads one level deep
			in.ParentID = parent.ParentID
		}
	}
	if _, err := s.Q.CreateVideoComment(ctx, repository.CreateVideoCommentParams{VideoID: videoID, UserID: actor.ID, ParentID: in.ParentID, Body: strings.TrimSpace(in.Body)}); err != nil {
		return nil, dbErr(err, "comment")
	}
	link := "/learn/watch/" + videoID.String() + "?tab=qa"
	switch {
	case in.ParentID != nil && parent.UserID != actor.ID:
		s.notify.Send(ctx, []uuid.UUID{parent.UserID}, "comment_reply", actor.Name+" replied to your question", trim(in.Body, 120), link)
	case in.ParentID == nil && actor.IsStudent():
		mentors, _ := s.mentors(ctx, v.CourseID)
		ids := make([]uuid.UUID, 0, len(mentors))
		for _, m := range mentors {
			ids = append(ids, m.ID)
		}
		s.notify.Send(ctx, ids, "question", "New question on "+v.Title, trim(in.Body, 120), "/comments")
	}
	return s.List(ctx, actor, videoID)
}

func (s *CommentService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	c, err := s.Q.GetVideoComment(ctx, id)
	if err != nil {
		return dbErr(err, "comment")
	}
	if c.UserID != actor.ID {
		if !actor.Can("comments", "delete") {
			return apperr.Forbidden("you can only delete your own comments")
		}
		v, err := s.Q.GetVideo(ctx, c.VideoID)
		if err != nil {
			return dbErr(err, "video")
		}
		if err := s.access.EnsureCourse(ctx, actor, v.CourseID); err != nil {
			return err
		}
	}
	if err := s.Q.DeleteVideoComment(ctx, id); err != nil {
		return dbErr(err, "comment")
	}
	s.audit.Log(ctx, actor, "delete", "comment", id, map[string]string{"body": trim(c.Body, 80)})
	return nil
}

func (s *CommentService) Pin(ctx context.Context, actor *auth.Principal, id uuid.UUID, pinned bool) error {
	c, err := s.Q.GetVideoComment(ctx, id)
	if err != nil {
		return dbErr(err, "comment")
	}
	v, err := s.Q.GetVideo(ctx, c.VideoID)
	if err != nil {
		return dbErr(err, "video")
	}
	if err := s.access.EnsureCourse(ctx, actor, v.CourseID); err != nil {
		return err
	}
	return dbErr(s.Q.PinVideoComment(ctx, repository.PinVideoCommentParams{ID: id, Pinned: pinned}), "comment")
}

// Moderation lists recent comments across courses (optionally only unanswered student questions).
func (s *CommentService) Moderation(ctx context.Context, actor *auth.Principal, unanswered bool, p dto.PageQuery) (dto.List[dto.ModerationComment], error) {
	rows, err := s.Q.ListRecentComments(ctx, repository.ListRecentCommentsParams{MentorID: actor.MentorScope(), Unanswered: unanswered, Lim: p.Lim(), Off: p.Off()})
	if err != nil {
		return dto.List[dto.ModerationComment]{}, dbErr(err, "comments")
	}
	out := make([]dto.ModerationComment, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.ModerationComment{ID: r.ID, VideoID: r.VideoID, VideoTitle: r.VideoTitle, CourseID: r.CourseID, CourseTitle: r.CourseTitle,
			ParentID: r.ParentID, AuthorName: r.AuthorName, AuthorKind: r.AuthorKind, Body: r.Body, Pinned: r.Pinned, CreatedAt: r.CreatedAt})
	}
	return dto.NewList(out, total, p), nil
}

// AnnouncementService posts news to everyone, a course or a batch.
type AnnouncementService struct{ base }

func (s *AnnouncementService) List(ctx context.Context, p dto.PageQuery) (dto.List[dto.Announcement], error) {
	rows, err := s.Q.ListAnnouncements(ctx, repository.ListAnnouncementsParams{Lim: p.Lim(), Off: p.Off()})
	if err != nil {
		return dto.List[dto.Announcement]{}, dbErr(err, "announcements")
	}
	out := make([]dto.Announcement, 0, len(rows))
	var total int64
	for _, r := range rows {
		total = r.TotalCount
		out = append(out, dto.Announcement{ID: r.ID, Title: r.Title, Body: r.Body, TargetType: r.TargetType, TargetID: r.TargetID, TargetLabel: r.TargetLabel,
			Pinned: r.Pinned, AuthorName: str(r.AuthorName), CreatedAt: r.CreatedAt})
	}
	return dto.NewList(out, total, p), nil
}

func (s *AnnouncementService) checkTarget(ctx context.Context, actor *auth.Principal, in *dto.AnnouncementInput) error {
	switch in.TargetType {
	case "all":
		if actor.MentorScope() != nil {
			return apperr.Forbidden("choose one of your courses or batches")
		}
		in.TargetID = nil
	case "course":
		if in.TargetID == nil {
			return apperr.Invalid("choose a course")
		}
		return s.access.EnsureCourse(ctx, actor, *in.TargetID)
	case "batch":
		if in.TargetID == nil {
			return apperr.Invalid("choose a batch")
		}
		return s.access.EnsureBatch(ctx, actor, *in.TargetID)
	}
	return nil
}

func (s *AnnouncementService) Create(ctx context.Context, actor *auth.Principal, in dto.AnnouncementInput) (dto.Announcement, error) {
	if err := s.checkTarget(ctx, actor, &in); err != nil {
		return dto.Announcement{}, err
	}
	a, err := s.Q.CreateAnnouncement(ctx, repository.CreateAnnouncementParams{Title: strings.TrimSpace(in.Title), Body: in.Body, TargetType: in.TargetType,
		TargetID: in.TargetID, Pinned: in.Pinned, AuthorID: &actor.ID})
	if err != nil {
		return dto.Announcement{}, dbErr(err, "announcement")
	}
	if ids, err := s.Q.AnnouncementAudience(ctx, repository.AnnouncementAudienceParams{TargetType: in.TargetType, TargetID: in.TargetID}); err == nil {
		s.notify.Send(ctx, ids, "announcement", "📢 "+a.Title, trim(a.Body, 140), "/learn/announcements")
	}
	s.audit.Log(ctx, actor, "create", "announcement", a.ID, in)
	return dto.Announcement{ID: a.ID, Title: a.Title, Body: a.Body, TargetType: a.TargetType, TargetID: a.TargetID, Pinned: a.Pinned, AuthorName: actor.Name, CreatedAt: a.CreatedAt}, nil
}

func (s *AnnouncementService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.AnnouncementInput) (dto.Announcement, error) {
	if err := s.checkTarget(ctx, actor, &in); err != nil {
		return dto.Announcement{}, err
	}
	a, err := s.Q.UpdateAnnouncement(ctx, repository.UpdateAnnouncementParams{ID: id, Title: strings.TrimSpace(in.Title), Body: in.Body, TargetType: in.TargetType, TargetID: in.TargetID, Pinned: in.Pinned})
	if err != nil {
		return dto.Announcement{}, dbErr(err, "announcement")
	}
	s.audit.Log(ctx, actor, "update", "announcement", id, in)
	return dto.Announcement{ID: a.ID, Title: a.Title, Body: a.Body, TargetType: a.TargetType, TargetID: a.TargetID, Pinned: a.Pinned, CreatedAt: a.CreatedAt}, nil
}

func (s *AnnouncementService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	a, err := s.Q.GetAnnouncement(ctx, id)
	if err != nil {
		return dbErr(err, "announcement")
	}
	if a.AuthorID == nil || *a.AuthorID != actor.ID {
		in := dto.AnnouncementInput{TargetType: a.TargetType, TargetID: a.TargetID}
		if err := s.checkTarget(ctx, actor, &in); err != nil {
			return err
		}
	}
	if err := s.Q.DeleteAnnouncement(ctx, id); err != nil {
		return dbErr(err, "announcement")
	}
	s.audit.Log(ctx, actor, "delete", "announcement", id, map[string]string{"title": a.Title})
	return nil
}

func (s *AnnouncementService) Mine(ctx context.Context, student *auth.Principal, limit int32) ([]dto.Announcement, error) {
	rows, err := s.Q.MyAnnouncements(ctx, repository.MyAnnouncementsParams{StudentID: student.ID, Lim: limit})
	if err != nil {
		return nil, dbErr(err, "announcements")
	}
	out := make([]dto.Announcement, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Announcement{ID: r.ID, Title: r.Title, Body: r.Body, TargetType: r.TargetType, TargetID: r.TargetID, Pinned: r.Pinned,
			AuthorName: str(r.AuthorName), CreatedAt: r.CreatedAt})
	}
	return out, nil
}
