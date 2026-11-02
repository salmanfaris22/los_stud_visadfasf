package handler

import (
	"context"
	"net/http"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

func (h *Handler) quizRoutes(api huma.API) {
	t, g := "Quizzes", h.g
	huma.Register(api, op("list-video-quizzes", http.MethodGet, "/videos/{id}/quizzes", t, "Quizzes under a video", g.Perm("quizzes", "view")), h.listQuizzes)
	huma.Register(api, op("create-quiz", http.MethodPost, "/videos/{id}/quizzes", t, "Create a quiz with questions", g.Perm("quizzes", "create")), h.createQuiz)
	huma.Register(api, op("get-quiz", http.MethodGet, "/quizzes/{id}", t, "Quiz with questions and answers", g.Perm("quizzes", "view")), h.getQuiz)
	huma.Register(api, op("update-quiz", http.MethodPut, "/quizzes/{id}", t, "Replace a quiz", g.Perm("quizzes", "edit")), h.updateQuiz)
	huma.Register(api, op("delete-quiz", http.MethodDelete, "/quizzes/{id}", t, "Delete a quiz", g.Perm("quizzes", "delete")), h.deleteQuiz)
	huma.Register(api, op("quiz-attempts", http.MethodGet, "/quizzes/{id}/attempts", t, "Submitted attempts", g.Perm("quizzes", "view")), h.quizAttempts)

	huma.Register(api, op("my-video-quizzes", http.MethodGet, "/me/videos/{id}/quizzes", t, "My quizzes for a video", g.Student()), h.myQuizzes)
	huma.Register(api, op("start-quiz", http.MethodPost, "/me/quizzes/{id}/start", t, "Start or resume an attempt", g.Student()), h.startQuiz)
	huma.Register(api, op("submit-quiz", http.MethodPost, "/me/quiz-attempts/{id}/submit", t, "Submit answers and get the result", g.Student()), h.submitQuiz)
}

func (h *Handler) listQuizzes(ctx context.Context, in *idPath) (*Out[[]dto.Quiz], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.ListForVideo(ctx, actor(ctx), id))
}

func (h *Handler) createQuiz(ctx context.Context, in *idBody[dto.QuizInput]) (*Out[dto.Quiz], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Create(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) getQuiz(ctx context.Context, in *idPath) (*Out[dto.Quiz], error) {
	id, err := parseID(in.ID, "quiz")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Get(ctx, actor(ctx), id))
}

func (h *Handler) updateQuiz(ctx context.Context, in *idBody[dto.QuizInput]) (*Out[dto.Quiz], error) {
	id, err := parseID(in.ID, "quiz")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Update(ctx, actor(ctx), id, in.Body))
}

func (h *Handler) deleteQuiz(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "quiz")
	if err != nil {
		return nil, err
	}
	return done(h.s.Quizzes.Delete(ctx, actor(ctx), id))
}

func (h *Handler) quizAttempts(ctx context.Context, in *idPath) (*Out[[]dto.QuizAttemptRow], error) {
	id, err := parseID(in.ID, "quiz")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Attempts(ctx, actor(ctx), id))
}

func (h *Handler) myQuizzes(ctx context.Context, in *idPath) (*Out[[]dto.MyQuiz], error) {
	id, err := parseID(in.ID, "video")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.MyForVideo(ctx, actor(ctx), id))
}

func (h *Handler) startQuiz(ctx context.Context, in *idPath) (*Out[dto.QuizPlay], error) {
	id, err := parseID(in.ID, "quiz")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Start(ctx, actor(ctx), id))
}

func (h *Handler) submitQuiz(ctx context.Context, in *idBody[dto.QuizSubmitInput]) (*Out[dto.QuizResult], error) {
	id, err := parseID(in.ID, "attempt")
	if err != nil {
		return nil, err
	}
	return ok(h.s.Quizzes.Submit(ctx, actor(ctx), id, in.Body))
}
