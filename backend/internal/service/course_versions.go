package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// CourseVersionService builds course versions and moves students between them.
// A version freezes which lessons, tasks and quizzes exist (and their order); text edits to
// an existing item still reach everyone.
type CourseVersionService struct {
	base
	courses *CourseService
}

// removeItem deletes a lesson, task or quiz from the working copy. When a built course version
// contains it, the row is archived instead, so students on that version keep it (and their work).
func (b base) removeItem(ctx context.Context, kind string, id uuid.UUID, archive, del func(context.Context, uuid.UUID) error) error {
	used, err := b.Q.ItemInAnyVersion(ctx, repository.ItemInAnyVersionParams{Kind: kind, ItemID: id})
	if err != nil {
		return err
	}
	if used {
		return archive(ctx, id)
	}
	return del(ctx, id)
}

func (s *CourseVersionService) Summary(ctx context.Context, actor *auth.Principal, courseID uuid.UUID) (dto.VersionSummary, error) {
	if _, err := s.courses.load(ctx, actor, courseID); err != nil {
		return dto.VersionSummary{}, err
	}
	rows, err := s.Q.ListCourseVersions(ctx, courseID)
	if err != nil {
		return dto.VersionSummary{}, dbErr(err, "versions")
	}
	out := dto.VersionSummary{Versions: make([]dto.CourseVersion, 0, len(rows))}
	for _, r := range rows {
		out.Versions = append(out.Versions, dto.CourseVersion{ID: r.ID, Number: r.Number, Note: r.Note, CreatedAt: r.CreatedAt, CreatedByName: str(r.CreatedByName),
			StudentCount: r.StudentCount, VideoCount: r.VideoCount, TaskCount: r.TaskCount, QuizCount: r.QuizCount})
	}
	working, err := s.Q.WorkingCourseItems(ctx, courseID)
	if err != nil {
		return dto.VersionSummary{}, dbErr(err, "curriculum")
	}
	var latest []repository.VersionItemsRow
	if len(rows) > 0 {
		if latest, err = s.Q.VersionItems(ctx, rows[0].ID); err != nil {
			return dto.VersionSummary{}, dbErr(err, "version")
		}
	} else if len(working) == 0 {
		return out, nil // empty course, nothing to build yet
	}
	out.Changes, out.HasChanges = diffItems(working, latest)
	if len(rows) == 0 {
		out.HasChanges = true // first build
	}
	return out, nil
}

// diffItems compares the working copy with a version: counts added/removed items per kind and
// whether the order of the items both share changed.
func diffItems(working []repository.WorkingCourseItemsRow, version []repository.VersionItemsRow) (dto.VersionChanges, bool) {
	type key struct {
		kind string
		id   uuid.UUID
	}
	old := make(map[key]int32, len(version))
	for _, v := range version {
		old[key{v.Kind, v.ItemID}] = v.Position
	}
	var c dto.VersionChanges
	seen := make(map[key]bool, len(working))
	for _, w := range working {
		k := key{w.Kind, w.ItemID}
		seen[k] = true
		pos, ok := old[k]
		switch {
		case !ok:
			bump(&c, w.Kind, true)
		case pos != w.Position:
			c.Reordered = true
		}
	}
	for k := range old {
		if !seen[k] {
			bump(&c, k.kind, false)
		}
	}
	changed := c.Reordered || c.AddedVideos+c.RemovedVideos+c.AddedTasks+c.RemovedTasks+c.AddedQuizzes+c.RemovedQuizzes > 0
	return c, changed
}

func bump(c *dto.VersionChanges, kind string, added bool) {
	switch {
	case kind == "video" && added:
		c.AddedVideos++
	case kind == "video":
		c.RemovedVideos++
	case kind == "task" && added:
		c.AddedTasks++
	case kind == "task":
		c.RemovedTasks++
	case kind == "quiz" && added:
		c.AddedQuizzes++
	case kind == "quiz":
		c.RemovedQuizzes++
	}
}

// Build freezes the working copy as the next version. New enrollments get it automatically;
// existing students stay where they are until moved.
func (s *CourseVersionService) Build(ctx context.Context, actor *auth.Principal, courseID uuid.UUID, note string) (dto.CourseVersion, error) {
	sum, err := s.Summary(ctx, actor, courseID)
	if err != nil {
		return dto.CourseVersion{}, err
	}
	if !sum.HasChanges {
		if len(sum.Versions) == 0 {
			return dto.CourseVersion{}, apperr.Conflict("add a lesson before building the course")
		}
		return dto.CourseVersion{}, apperr.Conflict(fmt.Sprintf("nothing changed since v%d", sum.Versions[0].Number))
	}
	id, err := s.Q.BuildCourseVersion(ctx, repository.BuildCourseVersionParams{CourseID: courseID, Note: note, CreatedBy: &actor.ID})
	if err != nil {
		return dto.CourseVersion{}, dbErr(err, "version")
	}
	after, err := s.Summary(ctx, actor, courseID)
	if err != nil {
		return dto.CourseVersion{}, err
	}
	v := after.Versions[0]
	s.audit.Log(ctx, actor, "build_version", "course", courseID, map[string]any{"version": v.Number, "version_id": id, "note": note})
	return v, nil
}

// Students lists everyone enrolled in the course with the version they are on.
func (s *CourseVersionService) Students(ctx context.Context, actor *auth.Principal, courseID uuid.UUID) ([]dto.VersionStudent, error) {
	if _, err := s.courses.load(ctx, actor, courseID); err != nil {
		return nil, err
	}
	rows, err := s.Q.ListVersionStudents(ctx, courseID)
	if err != nil {
		return nil, dbErr(err, "students")
	}
	out := make([]dto.VersionStudent, 0, len(rows))
	for _, r := range rows {
		vs := dto.VersionStudent{EnrollmentID: r.EnrollmentID, StudentID: r.StudentID, Name: r.Name, Email: r.Email, StudentCode: str(r.StudentCode),
			BatchID: r.BatchID, BatchName: str(r.BatchName), VersionID: r.VersionID, ProgressPct: pct(r.ApprovedTasks, r.TotalTasks)}
		if r.VersionNumber != nil {
			vs.VersionNumber = *r.VersionNumber
		}
		out = append(out, vs)
	}
	return out, nil
}

// Move puts the chosen enrollments of this course on a version. Their submissions stay; items
// that are new in that version show as to-do.
func (s *CourseVersionService) Move(ctx context.Context, actor *auth.Principal, courseID, versionID uuid.UUID, enrollmentIDs []uuid.UUID) (int, error) {
	if _, err := s.courses.load(ctx, actor, courseID); err != nil {
		return 0, err
	}
	if len(enrollmentIDs) == 0 {
		return 0, apperr.Invalid("pick at least one student")
	}
	moved, err := s.Q.MoveEnrollmentsToVersion(ctx, repository.MoveEnrollmentsToVersionParams{CourseID: courseID, VersionID: &versionID, EnrollmentIds: enrollmentIDs})
	if err != nil {
		return 0, dbErr(err, "enrollments")
	}
	if len(moved) == 0 {
		return 0, apperr.NotFound("version")
	}
	s.audit.Log(ctx, actor, "move_version", "course", courseID, map[string]any{"version_id": versionID, "students": len(moved)})
	return len(moved), nil
}
