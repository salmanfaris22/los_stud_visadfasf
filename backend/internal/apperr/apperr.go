// Package apperr defines the error types services return. Handlers translate them to
// HTTP status codes, so business logic never depends on the web framework.
package apperr

import (
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

type Kind uint8

const (
	KindInternal Kind = iota
	KindInvalid
	KindUnauthorized
	KindForbidden
	KindNotFound
	KindConflict
	KindRateLimited
	KindUnavailable
)

// Error is a business error with a user-facing message.
type Error struct {
	Kind    Kind
	Message string
	Cause   error
}

func (e *Error) Error() string {
	if e.Cause != nil {
		return e.Message + ": " + e.Cause.Error()
	}
	return e.Message
}

func (e *Error) Unwrap() error { return e.Cause }

func Invalid(format string, a ...any) error {
	return &Error{Kind: KindInvalid, Message: fmt.Sprintf(format, a...)}
}
func Unauthorized(msg string) error { return &Error{Kind: KindUnauthorized, Message: msg} }
func Forbidden(msg string) error    { return &Error{Kind: KindForbidden, Message: msg} }
func NotFound(what string) error    { return &Error{Kind: KindNotFound, Message: what + " not found"} }
func Conflict(msg string) error     { return &Error{Kind: KindConflict, Message: msg} }
func Unavailable(msg string) error  { return &Error{Kind: KindUnavailable, Message: msg} }
func Internal(err error) error      { return &Error{Kind: KindInternal, Message: "something went wrong", Cause: err} }

// KindOf returns the error kind (KindInternal for unknown errors).
func KindOf(err error) Kind {
	var e *Error
	if errors.As(err, &e) {
		return e.Kind
	}
	return KindInternal
}

// DB maps database errors to business errors. `what` names the record, e.g. "course".
func DB(err error, what string) error {
	if err == nil {
		return nil
	}
	var e *Error
	if errors.As(err, &e) {
		return err
	}
	if errors.Is(err, pgx.ErrNoRows) {
		return NotFound(what)
	}
	var pg *pgconn.PgError
	if errors.As(err, &pg) {
		switch pg.Code {
		case "23505":
			return &Error{Kind: KindConflict, Message: what + " already exists", Cause: err}
		case "23503":
			return &Error{Kind: KindConflict, Message: what + " is linked to other records", Cause: err}
		case "23514", "22P02", "22007", "22008", "22001":
			return &Error{Kind: KindInvalid, Message: "invalid value for " + what, Cause: err}
		}
	}
	return Internal(err)
}
