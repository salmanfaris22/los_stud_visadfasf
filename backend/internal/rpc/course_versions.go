package rpc

import (
	"context"

	"connectrpc.com/connect"
	"github.com/google/uuid"
	"google.golang.org/protobuf/types/known/timestamppb"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
)

// courseVersionServer implements lms.v1.CourseVersionService.
type courseVersionServer struct{ *server }

func (c courseVersionServer) GetVersionSummary(ctx context.Context, req *connect.Request[lmsv1.GetVersionSummaryRequest]) (*connect.Response[lmsv1.GetVersionSummaryResponse], error) {
	sum, err := c.s.Versions.Summary(ctx, auth.FromContext(ctx), uuid.MustParse(req.Msg.GetCourseId()))
	if err != nil {
		return nil, err
	}
	out := &lmsv1.GetVersionSummaryResponse{HasChanges: sum.HasChanges, Changes: &lmsv1.VersionChanges{
		AddedVideos: sum.Changes.AddedVideos, RemovedVideos: sum.Changes.RemovedVideos,
		AddedTasks: sum.Changes.AddedTasks, RemovedTasks: sum.Changes.RemovedTasks,
		AddedQuizzes: sum.Changes.AddedQuizzes, RemovedQuizzes: sum.Changes.RemovedQuizzes,
		Reordered: sum.Changes.Reordered,
	}}
	for _, v := range sum.Versions {
		out.Versions = append(out.Versions, versionToPB(v))
	}
	return connect.NewResponse(out), nil
}

func (c courseVersionServer) BuildVersion(ctx context.Context, req *connect.Request[lmsv1.BuildVersionRequest]) (*connect.Response[lmsv1.BuildVersionResponse], error) {
	v, err := c.s.Versions.Build(ctx, auth.FromContext(ctx), uuid.MustParse(req.Msg.GetCourseId()), req.Msg.GetNote())
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.BuildVersionResponse{Version: versionToPB(v)}), nil
}

func (c courseVersionServer) ListVersionStudents(ctx context.Context, req *connect.Request[lmsv1.ListVersionStudentsRequest]) (*connect.Response[lmsv1.ListVersionStudentsResponse], error) {
	rows, err := c.s.Versions.Students(ctx, auth.FromContext(ctx), uuid.MustParse(req.Msg.GetCourseId()))
	if err != nil {
		return nil, err
	}
	out := &lmsv1.ListVersionStudentsResponse{Students: make([]*lmsv1.VersionStudent, 0, len(rows))}
	for _, r := range rows {
		out.Students = append(out.Students, &lmsv1.VersionStudent{
			EnrollmentId: r.EnrollmentID.String(), StudentId: r.StudentID.String(), Name: r.Name, Email: r.Email, StudentCode: r.StudentCode,
			BatchId: idString(r.BatchID), BatchName: r.BatchName, VersionId: idString(r.VersionID), VersionNumber: r.VersionNumber,
			ProgressPct: int32(r.ProgressPct),
		})
	}
	return connect.NewResponse(out), nil
}

func (c courseVersionServer) MoveStudents(ctx context.Context, req *connect.Request[lmsv1.MoveStudentsRequest]) (*connect.Response[lmsv1.MoveStudentsResponse], error) {
	ids := make([]uuid.UUID, len(req.Msg.GetEnrollmentIds()))
	for i, s := range req.Msg.GetEnrollmentIds() {
		ids[i] = uuid.MustParse(s) // protovalidate already checked every id is a UUID
	}
	n, err := c.s.Versions.Move(ctx, auth.FromContext(ctx), uuid.MustParse(req.Msg.GetCourseId()), uuid.MustParse(req.Msg.GetVersionId()), ids)
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.MoveStudentsResponse{Moved: int32(n)}), nil
}

func versionToPB(v dto.CourseVersion) *lmsv1.CourseVersion {
	return &lmsv1.CourseVersion{Id: v.ID.String(), Number: v.Number, Note: v.Note, CreatedAt: timestamppb.New(v.CreatedAt), CreatedByName: v.CreatedByName,
		StudentCount: v.StudentCount, VideoCount: v.VideoCount, TaskCount: v.TaskCount, QuizCount: v.QuizCount}
}

func idString(id *uuid.UUID) string {
	if id == nil {
		return ""
	}
	return id.String()
}
