package service

import (
	"testing"

	"github.com/google/uuid"

	"github.com/lms/backend/internal/dto"
)

func TestScoreQuiz(t *testing.T) {
	a, b, c, d := uuid.New(), uuid.New(), uuid.New(), uuid.New()
	q1 := dto.QuizQuestion{ID: uuid.New(), Points: 2, Options: []dto.QuizOption{{ID: a, IsCorrect: true}, {ID: b}}}
	q2 := dto.QuizQuestion{ID: uuid.New(), Points: 3, Multi: true, Options: []dto.QuizOption{{ID: c, IsCorrect: true}, {ID: d, IsCorrect: true}, {ID: uuid.New()}}}
	cases := []struct {
		name    string
		answers map[uuid.UUID][]uuid.UUID
		want    int32
	}{
		{"all correct", map[uuid.UUID][]uuid.UUID{q1.ID: {a}, q2.ID: {d, c}}, 5},
		{"partial multi earns nothing", map[uuid.UUID][]uuid.UUID{q1.ID: {a}, q2.ID: {c}}, 2},
		{"wrong single", map[uuid.UUID][]uuid.UUID{q1.ID: {b}, q2.ID: {c, d}}, 3},
		{"duplicates ignored", map[uuid.UUID][]uuid.UUID{q1.ID: {a, a}, q2.ID: {c, d, d}}, 5},
		{"foreign option ignored", map[uuid.UUID][]uuid.UUID{q1.ID: {a, uuid.New()}}, 2},
		{"empty", nil, 0},
	}
	for _, tc := range cases {
		score, max, review := ScoreQuiz([]dto.QuizQuestion{q1, q2}, tc.answers)
		if score != tc.want || max != 5 || len(review) != 2 {
			t.Errorf("%s: score=%d max=%d review=%d, want score %d", tc.name, score, max, len(review), tc.want)
		}
	}
}

func TestValidateQuiz(t *testing.T) {
	ok := dto.QuizInput{Title: "t", Questions: []dto.QuizQuestionInput{{Body: "q", Options: []dto.QuizOptionInput{{Body: "a", IsCorrect: true}, {Body: "b"}}}}}
	if err := ValidateQuiz(ok); err != nil {
		t.Fatalf("valid quiz rejected: %v", err)
	}
	none := dto.QuizInput{Questions: []dto.QuizQuestionInput{{Body: "q", Options: []dto.QuizOptionInput{{Body: "a"}, {Body: "b"}}}}}
	if ValidateQuiz(none) == nil {
		t.Error("quiz without a correct option accepted")
	}
	two := dto.QuizInput{Questions: []dto.QuizQuestionInput{{Body: "q", Options: []dto.QuizOptionInput{{Body: "a", IsCorrect: true}, {Body: "b", IsCorrect: true}}}}}
	if ValidateQuiz(two) == nil {
		t.Error("single-choice question with two correct options accepted")
	}
}
