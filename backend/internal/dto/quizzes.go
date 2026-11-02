package dto

import (
	"time"

	"github.com/google/uuid"
)

type QuizOption struct {
	ID        uuid.UUID `json:"id"`
	Body      string    `json:"body"`
	IsCorrect bool      `json:"is_correct"`
}

type QuizQuestion struct {
	ID          uuid.UUID    `json:"id"`
	Position    int32        `json:"position"`
	Body        string       `json:"body"`
	Multi       bool         `json:"multi" doc:"More than one correct option"`
	Points      int32        `json:"points"`
	Explanation string       `json:"explanation"`
	Options     []QuizOption `json:"options"`
}

type Quiz struct {
	ID               uuid.UUID      `json:"id"`
	VideoID          uuid.UUID      `json:"video_id"`
	Title            string         `json:"title"`
	Description      string         `json:"description"`
	PassPct          int32          `json:"pass_pct"`
	TimeLimitMinutes int32          `json:"time_limit_minutes"`
	MaxAttempts      int32          `json:"max_attempts" doc:"0 = unlimited"`
	QuestionCount    int32          `json:"question_count"`
	AttemptCount     int32          `json:"attempt_count"`
	Questions        []QuizQuestion `json:"questions"`
}

type QuizOptionInput struct {
	Body      string `json:"body" minLength:"1" maxLength:"1000"`
	IsCorrect bool   `json:"is_correct,omitempty"`
}

type QuizQuestionInput struct {
	Body        string            `json:"body" minLength:"1" maxLength:"5000"`
	Multi       bool              `json:"multi,omitempty"`
	Points      int32             `json:"points,omitempty" minimum:"0" maximum:"100"`
	Explanation string            `json:"explanation,omitempty" maxLength:"5000"`
	Options     []QuizOptionInput `json:"options" minItems:"2" maxItems:"10"`
}

type QuizInput struct {
	Title            string              `json:"title" minLength:"2" maxLength:"200"`
	Description      string              `json:"description,omitempty" maxLength:"5000"`
	PassPct          int32               `json:"pass_pct" minimum:"0" maximum:"100"`
	TimeLimitMinutes int32               `json:"time_limit_minutes,omitempty" minimum:"0" maximum:"600"`
	MaxAttempts      int32               `json:"max_attempts,omitempty" minimum:"0" maximum:"100"`
	Questions        []QuizQuestionInput `json:"questions" minItems:"1" maxItems:"200"`
}

type QuizAttemptRow struct {
	ID           uuid.UUID  `json:"id"`
	StudentID    uuid.UUID  `json:"student_id"`
	StudentName  string     `json:"student_name"`
	StudentEmail string     `json:"student_email"`
	Score        int32      `json:"score"`
	MaxScore     int32      `json:"max_score"`
	Pct          int        `json:"pct"`
	Passed       bool       `json:"passed"`
	StartedAt    time.Time  `json:"started_at"`
	SubmittedAt  *time.Time `json:"submitted_at"`
}

type MyQuiz struct {
	ID               uuid.UUID `json:"id"`
	VideoID          uuid.UUID `json:"video_id"`
	Title            string    `json:"title"`
	Description      string    `json:"description"`
	PassPct          int32     `json:"pass_pct"`
	TimeLimitMinutes int32     `json:"time_limit_minutes"`
	MaxAttempts      int32     `json:"max_attempts"`
	QuestionCount    int32     `json:"question_count"`
	BestScore        int32     `json:"best_score"`
	BestMax          int32     `json:"best_max"`
	Passed           bool      `json:"passed"`
	AttemptsUsed     int32     `json:"attempts_used"`
	CanStart         bool      `json:"can_start"`
}

type PlayOption struct {
	ID   uuid.UUID `json:"id"`
	Body string    `json:"body"`
}

type PlayQuestion struct {
	ID      uuid.UUID    `json:"id"`
	Body    string       `json:"body"`
	Multi   bool         `json:"multi"`
	Points  int32        `json:"points"`
	Options []PlayOption `json:"options"`
}

type QuizPlay struct {
	AttemptID        uuid.UUID      `json:"attempt_id"`
	QuizID           uuid.UUID      `json:"quiz_id"`
	Title            string         `json:"title"`
	Description      string         `json:"description"`
	TimeLimitMinutes int32          `json:"time_limit_minutes"`
	StartedAt        time.Time      `json:"started_at"`
	Deadline         *time.Time     `json:"deadline"`
	Questions        []PlayQuestion `json:"questions"`
}

type QuizAnswer struct {
	QuestionID uuid.UUID   `json:"question_id"`
	OptionIDs  []uuid.UUID `json:"option_ids" maxItems:"10"`
}

type QuizSubmitInput struct {
	Answers []QuizAnswer `json:"answers" maxItems:"200"`
}

type QuestionReview struct {
	QuestionID       uuid.UUID   `json:"question_id"`
	Body             string      `json:"body"`
	Correct          bool        `json:"correct"`
	Chosen           []uuid.UUID `json:"chosen"`
	CorrectOptionIDs []uuid.UUID `json:"correct_option_ids"`
	Explanation      string      `json:"explanation"`
	Points           int32       `json:"points"`
	Earned           int32       `json:"earned"`
}

type QuizResult struct {
	AttemptID uuid.UUID        `json:"attempt_id"`
	Score     int32            `json:"score"`
	MaxScore  int32            `json:"max_score"`
	Pct       int              `json:"pct"`
	Passed    bool             `json:"passed"`
	PassPct   int32            `json:"pass_pct"`
	Review    []QuestionReview `json:"review"`
}
