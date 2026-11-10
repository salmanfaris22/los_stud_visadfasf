package service

import (
	"context"
	"encoding/json"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
	"github.com/lms/backend/internal/repository"
)

// QuizService manages MCQ quizzes under videos and scores student attempts.
type QuizService struct{ base }

// quizGrace is extra time allowed after a timed quiz deadline (network delays).
const quizGrace = 30 * time.Second

func (s *QuizService) videoCourse(ctx context.Context, videoID uuid.UUID) (uuid.UUID, error) {
	v, err := s.Q.GetVideo(ctx, videoID)
	if err != nil {
		return uuid.Nil, dbErr(err, "video")
	}
	return v.CourseID, nil
}

func (s *QuizService) ListForVideo(ctx context.Context, actor *auth.Principal, videoID uuid.UUID) ([]dto.Quiz, error) {
	cid, err := s.videoCourse(ctx, videoID)
	if err != nil {
		return nil, err
	}
	if err := s.access.EnsureCourse(ctx, actor, cid); err != nil {
		return nil, err
	}
	rows, err := s.Q.ListVideoQuizzes(ctx, videoID)
	if err != nil {
		return nil, dbErr(err, "quizzes")
	}
	out := make([]dto.Quiz, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.Quiz{ID: r.ID, VideoID: r.VideoID, Title: r.Title, Description: r.Description, PassPct: r.PassPct, TimeLimitMinutes: r.TimeLimitMinutes,
			MaxAttempts: r.MaxAttempts, QuestionCount: r.QuestionCount, AttemptCount: r.AttemptCount, Questions: []dto.QuizQuestion{}})
	}
	return out, nil
}

// questions loads questions with options (including correct flags).
func (s *QuizService) questions(ctx context.Context, quizID uuid.UUID) ([]dto.QuizQuestion, error) {
	qs, err := s.Q.ListQuizQuestions(ctx, quizID)
	if err != nil {
		return nil, dbErr(err, "questions")
	}
	opts, err := s.Q.ListQuizOptions(ctx, quizID)
	if err != nil {
		return nil, dbErr(err, "options")
	}
	byQ := map[uuid.UUID][]dto.QuizOption{}
	for _, o := range opts {
		byQ[o.QuestionID] = append(byQ[o.QuestionID], dto.QuizOption{ID: o.ID, Body: o.Body, IsCorrect: o.IsCorrect})
	}
	out := make([]dto.QuizQuestion, 0, len(qs))
	for _, q := range qs {
		o := byQ[q.ID]
		if o == nil {
			o = []dto.QuizOption{}
		}
		out = append(out, dto.QuizQuestion{ID: q.ID, Position: q.Position, Body: q.Body, Multi: q.Multi, Points: q.Points, Explanation: q.Explanation, Options: o})
	}
	return out, nil
}

func (s *QuizService) load(ctx context.Context, id uuid.UUID) (repository.GetQuizRow, error) {
	q, err := s.Q.GetQuiz(ctx, id)
	return q, dbErr(err, "quiz")
}

func (s *QuizService) Get(ctx context.Context, actor *auth.Principal, id uuid.UUID) (dto.Quiz, error) {
	q, err := s.load(ctx, id)
	if err != nil {
		return dto.Quiz{}, err
	}
	if err := s.access.EnsureCourse(ctx, actor, q.CourseID); err != nil {
		return dto.Quiz{}, err
	}
	qs, err := s.questions(ctx, id)
	if err != nil {
		return dto.Quiz{}, err
	}
	return dto.Quiz{ID: q.ID, VideoID: q.VideoID, Title: q.Title, Description: q.Description, PassPct: q.PassPct, TimeLimitMinutes: q.TimeLimitMinutes,
		MaxAttempts: q.MaxAttempts, QuestionCount: int32(len(qs)), Questions: qs}, nil
}

// ValidateQuiz checks each question has options and a consistent number of correct answers.
func ValidateQuiz(in dto.QuizInput) error {
	for i, q := range in.Questions {
		correct := 0
		for _, o := range q.Options {
			if o.IsCorrect {
				correct++
			}
		}
		switch {
		case correct == 0:
			return apperr.Invalid("question %d needs at least one correct option", i+1)
		case !q.Multi && correct > 1:
			return apperr.Invalid("question %d is single-choice but has %d correct options", i+1, correct)
		}
	}
	return nil
}

func saveQuestions(ctx context.Context, q *repository.Queries, quizID uuid.UUID, qs []dto.QuizQuestionInput) error {
	if err := q.ClearQuizQuestions(ctx, quizID); err != nil {
		return err
	}
	for i, qi := range qs {
		points := qi.Points
		if points == 0 {
			points = 1
		}
		row, err := q.CreateQuizQuestion(ctx, repository.CreateQuizQuestionParams{QuizID: quizID, Position: int32(i), Body: strings.TrimSpace(qi.Body),
			Multi: qi.Multi, Points: points, Explanation: qi.Explanation})
		if err != nil {
			return err
		}
		for j, o := range qi.Options {
			if _, err := q.CreateQuizOption(ctx, repository.CreateQuizOptionParams{QuestionID: row.ID, Position: int32(j), Body: strings.TrimSpace(o.Body), IsCorrect: o.IsCorrect}); err != nil {
				return err
			}
		}
	}
	return nil
}

func (s *QuizService) Create(ctx context.Context, actor *auth.Principal, videoID uuid.UUID, in dto.QuizInput) (dto.Quiz, error) {
	cid, err := s.videoCourse(ctx, videoID)
	if err != nil {
		return dto.Quiz{}, err
	}
	if err := s.access.EnsureCourse(ctx, actor, cid); err != nil {
		return dto.Quiz{}, err
	}
	if err := ValidateQuiz(in); err != nil {
		return dto.Quiz{}, err
	}
	var quiz repository.Quiz
	err = s.tx(ctx, func(q *repository.Queries) error {
		if quiz, err = q.CreateQuiz(ctx, repository.CreateQuizParams{VideoID: videoID, Title: strings.TrimSpace(in.Title), Description: in.Description,
			PassPct: in.PassPct, TimeLimitMinutes: in.TimeLimitMinutes, MaxAttempts: in.MaxAttempts}); err != nil {
			return err
		}
		return saveQuestions(ctx, q, quiz.ID, in.Questions)
	})
	if err != nil {
		return dto.Quiz{}, dbErr(err, "quiz")
	}
	s.audit.Log(ctx, actor, "create", "quiz", quiz.ID, map[string]any{"title": quiz.Title, "questions": len(in.Questions)})
	return s.Get(ctx, actor, quiz.ID)
}

func (s *QuizService) Update(ctx context.Context, actor *auth.Principal, id uuid.UUID, in dto.QuizInput) (dto.Quiz, error) {
	cur, err := s.load(ctx, id)
	if err != nil {
		return dto.Quiz{}, err
	}
	if err := s.access.EnsureCourse(ctx, actor, cur.CourseID); err != nil {
		return dto.Quiz{}, err
	}
	if err := ValidateQuiz(in); err != nil {
		return dto.Quiz{}, err
	}
	err = s.tx(ctx, func(q *repository.Queries) error {
		if _, err := q.UpdateQuiz(ctx, repository.UpdateQuizParams{ID: id, Title: strings.TrimSpace(in.Title), Description: in.Description, PassPct: in.PassPct,
			TimeLimitMinutes: in.TimeLimitMinutes, MaxAttempts: in.MaxAttempts}); err != nil {
			return err
		}
		return saveQuestions(ctx, q, id, in.Questions)
	})
	if err != nil {
		return dto.Quiz{}, dbErr(err, "quiz")
	}
	s.audit.Log(ctx, actor, "update", "quiz", id, map[string]any{"title": in.Title, "questions": len(in.Questions)})
	return s.Get(ctx, actor, id)
}

func (s *QuizService) Delete(ctx context.Context, actor *auth.Principal, id uuid.UUID) error {
	cur, err := s.load(ctx, id)
	if err != nil {
		return err
	}
	if err := s.access.EnsureCourse(ctx, actor, cur.CourseID); err != nil {
		return err
	}
	if err := s.removeItem(ctx, "quiz", id, s.Q.ArchiveQuiz, s.Q.DeleteQuiz); err != nil {
		return dbErr(err, "quiz")
	}
	s.audit.Log(ctx, actor, "delete", "quiz", id, map[string]string{"title": cur.Title})
	return nil
}

func (s *QuizService) Attempts(ctx context.Context, actor *auth.Principal, id uuid.UUID) ([]dto.QuizAttemptRow, error) {
	cur, err := s.load(ctx, id)
	if err != nil {
		return nil, err
	}
	if err := s.access.EnsureCourse(ctx, actor, cur.CourseID); err != nil {
		return nil, err
	}
	rows, err := s.Q.ListQuizAttemptsAdmin(ctx, id)
	if err != nil {
		return nil, dbErr(err, "attempts")
	}
	out := make([]dto.QuizAttemptRow, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.QuizAttemptRow{ID: r.ID, StudentID: r.StudentID, StudentName: r.StudentName, StudentEmail: r.StudentEmail, Score: r.Score,
			MaxScore: r.MaxScore, Pct: pct(r.Score, r.MaxScore), Passed: r.Passed, StartedAt: r.StartedAt, SubmittedAt: r.SubmittedAt})
	}
	return out, nil
}

// ── student side ──

func (s *QuizService) MyForVideo(ctx context.Context, student *auth.Principal, videoID uuid.UUID) ([]dto.MyQuiz, error) {
	cid, err := s.videoCourse(ctx, videoID)
	if err != nil {
		return nil, err
	}
	if err := s.access.EnsureHasItem(ctx, student, cid, "video", videoID); err != nil {
		return nil, err
	}
	rows, err := s.Q.MyVideoQuizzes(ctx, repository.MyVideoQuizzesParams{StudentID: student.ID, VideoID: videoID})
	if err != nil {
		return nil, dbErr(err, "quizzes")
	}
	out := make([]dto.MyQuiz, 0, len(rows))
	for _, r := range rows {
		out = append(out, dto.MyQuiz{ID: r.ID, VideoID: r.VideoID, Title: r.Title, Description: r.Description, PassPct: r.PassPct, TimeLimitMinutes: r.TimeLimitMinutes,
			MaxAttempts: r.MaxAttempts, QuestionCount: r.QuestionCount, BestScore: r.BestScore, BestMax: r.BestMax, Passed: r.Passed, AttemptsUsed: r.AttemptsUsed,
			CanStart: r.QuestionCount > 0 && (r.MaxAttempts == 0 || r.AttemptsUsed < r.MaxAttempts)})
	}
	return out, nil
}

func deadline(q repository.GetQuizRow, started time.Time) *time.Time {
	if q.TimeLimitMinutes <= 0 {
		return nil
	}
	d := started.Add(time.Duration(q.TimeLimitMinutes) * time.Minute)
	return &d
}

// Start opens (or resumes) an attempt and returns questions without the answers.
func (s *QuizService) Start(ctx context.Context, student *auth.Principal, quizID uuid.UUID) (dto.QuizPlay, error) {
	q, err := s.load(ctx, quizID)
	if err != nil {
		return dto.QuizPlay{}, err
	}
	if err := s.access.EnsureHasItem(ctx, student, q.CourseID, "quiz", quizID); err != nil {
		return dto.QuizPlay{}, err
	}
	attempt, err := s.Q.OpenQuizAttempt(ctx, repository.OpenQuizAttemptParams{QuizID: quizID, StudentID: student.ID})
	if err != nil || (deadline(q, attempt.StartedAt) != nil && time.Now().After(deadline(q, attempt.StartedAt).Add(quizGrace))) {
		used, err := s.Q.CountQuizAttempts(ctx, repository.CountQuizAttemptsParams{QuizID: quizID, StudentID: student.ID})
		if err != nil {
			return dto.QuizPlay{}, dbErr(err, "attempts")
		}
		if q.MaxAttempts > 0 && used >= q.MaxAttempts {
			return dto.QuizPlay{}, apperr.Conflict("you have used all attempts for this quiz")
		}
		if attempt, err = s.Q.CreateQuizAttempt(ctx, repository.CreateQuizAttemptParams{QuizID: quizID, StudentID: student.ID}); err != nil {
			return dto.QuizPlay{}, dbErr(err, "attempt")
		}
	}
	qs, err := s.questions(ctx, quizID)
	if err != nil {
		return dto.QuizPlay{}, err
	}
	play := dto.QuizPlay{AttemptID: attempt.ID, QuizID: quizID, Title: q.Title, Description: q.Description, TimeLimitMinutes: q.TimeLimitMinutes,
		StartedAt: attempt.StartedAt, Deadline: deadline(q, attempt.StartedAt), Questions: make([]dto.PlayQuestion, 0, len(qs))}
	for _, qq := range qs {
		pq := dto.PlayQuestion{ID: qq.ID, Body: qq.Body, Multi: qq.Multi, Points: qq.Points, Options: make([]dto.PlayOption, 0, len(qq.Options))}
		for _, o := range qq.Options {
			pq.Options = append(pq.Options, dto.PlayOption{ID: o.ID, Body: o.Body})
		}
		play.Questions = append(play.Questions, pq)
	}
	return play, nil
}

// ScoreQuiz grades answers: a question earns its points only when the chosen set equals the correct set.
func ScoreQuiz(questions []dto.QuizQuestion, answers map[uuid.UUID][]uuid.UUID) (score, max int32, review []dto.QuestionReview) {
	review = make([]dto.QuestionReview, 0, len(questions))
	for _, q := range questions {
		correct := []uuid.UUID{}
		valid := map[uuid.UUID]bool{}
		for _, o := range q.Options {
			valid[o.ID] = true
			if o.IsCorrect {
				correct = append(correct, o.ID)
			}
		}
		chosen := []uuid.UUID{}
		seen := map[uuid.UUID]bool{}
		for _, id := range answers[q.ID] {
			if valid[id] && !seen[id] {
				seen[id] = true
				chosen = append(chosen, id)
			}
		}
		ok := sameSet(chosen, correct)
		earned := int32(0)
		if ok {
			earned = q.Points
		}
		score += earned
		max += q.Points
		review = append(review, dto.QuestionReview{QuestionID: q.ID, Body: q.Body, Correct: ok, Chosen: chosen, CorrectOptionIDs: correct,
			Explanation: q.Explanation, Points: q.Points, Earned: earned})
	}
	return score, max, review
}

func sameSet(a, b []uuid.UUID) bool {
	if len(a) != len(b) {
		return false
	}
	as := append([]uuid.UUID(nil), a...)
	bs := append([]uuid.UUID(nil), b...)
	sort.Slice(as, func(i, j int) bool { return as[i].String() < as[j].String() })
	sort.Slice(bs, func(i, j int) bool { return bs[i].String() < bs[j].String() })
	for i := range as {
		if as[i] != bs[i] {
			return false
		}
	}
	return true
}

func (s *QuizService) Submit(ctx context.Context, student *auth.Principal, attemptID uuid.UUID, in dto.QuizSubmitInput) (dto.QuizResult, error) {
	att, err := s.Q.GetQuizAttempt(ctx, attemptID)
	if err != nil || att.StudentID != student.ID {
		return dto.QuizResult{}, apperr.NotFound("attempt")
	}
	if att.SubmittedAt != nil {
		return dto.QuizResult{}, apperr.Conflict("this attempt was already submitted")
	}
	q, err := s.load(ctx, att.QuizID)
	if err != nil {
		return dto.QuizResult{}, err
	}
	qs, err := s.questions(ctx, q.ID)
	if err != nil {
		return dto.QuizResult{}, err
	}
	answers := map[uuid.UUID][]uuid.UUID{}
	if d := deadline(q, att.StartedAt); d == nil || time.Now().Before(d.Add(quizGrace)) {
		for _, a := range in.Answers {
			answers[a.QuestionID] = a.OptionIDs
		}
	} // after the deadline the attempt is scored as empty
	score, max, review := ScoreQuiz(qs, answers)
	passed := max > 0 && score*100 >= q.PassPct*max
	raw, _ := json.Marshal(answers)
	if _, err := s.Q.SubmitQuizAttempt(ctx, repository.SubmitQuizAttemptParams{ID: attemptID, Score: score, MaxScore: max, Passed: passed, Answers: raw}); err != nil {
		return dto.QuizResult{}, dbErr(err, "attempt")
	}
	return dto.QuizResult{AttemptID: attemptID, Score: score, MaxScore: max, Pct: pct(score, max), Passed: passed, PassPct: q.PassPct, Review: review}, nil
}
