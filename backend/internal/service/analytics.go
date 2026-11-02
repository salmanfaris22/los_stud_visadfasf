package service

import (
	"context"
	"time"

	"github.com/lms/backend/internal/dto"
)

// AnalyticsService builds the admin dashboard numbers and charts.
type AnalyticsService struct{ base }

func (s *AnalyticsService) Overview(ctx context.Context, days int) (dto.Overview, error) {
	if days <= 0 || days > 365 {
		days = 30
	}
	c, err := s.Q.AnalyticsCounts(ctx)
	if err != nil {
		return dto.Overview{}, dbErr(err, "analytics")
	}
	since := time.Now().AddDate(0, 0, -(days - 1)).Truncate(24 * time.Hour)
	sub, err := s.Q.SubmissionsPerDay(ctx, since)
	if err != nil {
		return dto.Overview{}, dbErr(err, "analytics")
	}
	appr, err := s.Q.ApprovalsPerDay(ctx, since)
	if err != nil {
		return dto.Overview{}, dbErr(err, "analytics")
	}
	courses, err := s.Q.CourseCompletionStats(ctx)
	if err != nil {
		return dto.Overview{}, dbErr(err, "analytics")
	}
	att, err := s.Q.AttendanceStats(ctx)
	if err != nil {
		return dto.Overview{}, dbErr(err, "analytics")
	}
	out := dto.Overview{
		Counts: dto.Counts{Students: c.Students, ActiveStudents: c.ActiveStudents, Staff: c.Staff, PublishedCourses: c.PublishedCourses, ActiveBatches: c.ActiveBatches,
			PendingReviews: c.PendingReviews, ApprovedSubmissions: c.ApprovedSubmissions, ReviewedSubmissions: c.ReviewedSubmissions, UpcomingLive: c.UpcomingLive,
			NewLeads: c.NewLeads, Certificates: c.Certificates},
		ApprovalRate: pct(c.ApprovedSubmissions, c.ReviewedSubmissions),
		Attendance: dto.AttendanceStat{LiveSessions30d: att.LiveSessions30d, LivePresent30d: att.LivePresent30d, OfflinePresent30d: att.OfflinePresent30d,
			OfflineMarked30d: att.OfflineMarked30d, OfflineRatePct: pct(att.OfflinePresent30d, att.OfflineMarked30d)},
		Daily:   make([]dto.DayPoint, 0, days),
		Courses: make([]dto.CourseStat, 0, len(courses)),
	}
	subBy, apprBy := map[string]int32{}, map[string]int32{}
	for _, r := range sub {
		subBy[r.Day.Format(dateLayout)] = r.Total
	}
	for _, r := range appr {
		apprBy[r.Day.Format(dateLayout)] = r.Total
	}
	for i := 0; i < days; i++ {
		d := since.AddDate(0, 0, i).Format(dateLayout)
		out.Daily = append(out.Daily, dto.DayPoint{Day: d, Submitted: subBy[d], Approved: apprBy[d]})
	}
	for _, r := range courses {
		out.Courses = append(out.Courses, dto.CourseStat{ID: r.ID, Title: r.Title, Students: r.Students, AvgProgress: int(r.AvgProgress * 100), Completed: r.Completed})
	}
	return out, nil
}
