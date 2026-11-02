package apperr

import (
	"errors"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestDBMapping(t *testing.T) {
	cases := []struct {
		err  error
		want Kind
	}{
		{pgx.ErrNoRows, KindNotFound},
		{&pgconn.PgError{Code: "23505"}, KindConflict},
		{&pgconn.PgError{Code: "23503"}, KindConflict},
		{&pgconn.PgError{Code: "23514"}, KindInvalid},
		{errors.New("boom"), KindInternal},
		{Forbidden("no"), KindForbidden},
	}
	for _, c := range cases {
		if got := KindOf(DB(c.err, "thing")); got != c.want {
			t.Errorf("DB(%v) kind = %v, want %v", c.err, got, c.want)
		}
	}
	if DB(nil, "x") != nil {
		t.Error("nil must stay nil")
	}
	if NotFound("course").Error() != "course not found" {
		t.Error("message format changed")
	}
}
