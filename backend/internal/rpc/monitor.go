package rpc

import (
	"context"
	"errors"
	"time"

	"connectrpc.com/connect"
	"github.com/google/uuid"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/platform/monitor"
)

// monitorInterceptor times every RPC for the admin Server page. It is the outermost interceptor,
// so it sees the final result (access denials and mapped service errors included). Realtime
// streams are counted as open streams, not timed.
type monitorInterceptor struct{ rec *monitor.Recorder }

func (m monitorInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		start := time.Now()
		res, err := next(ctx, req)
		r := monitor.Request{At: start, Procedure: req.Spec().Procedure, Status: 200, Ms: float64(time.Since(start).Microseconds()) / 1000, IP: auth.MetaFrom(ctx).IP}
		if err != nil {
			code := connect.CodeOf(err)
			var ce *connect.Error
			if !errors.As(err, &ce) {
				code = connect.CodeInternal // the error interceptor reports plain errors as internal
			}
			r.Status, r.Code = httpStatus(code), code.String()
		}
		r.UserID, r.Staff = who(ctx)
		m.rec.Record(r)
		return res, err
	}
}

func (m monitorInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (m monitorInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		id, staff := who(ctx)
		done := m.rec.StreamOpened(id, staff, auth.MetaFrom(ctx).IP)
		defer done()
		return next(ctx, conn)
	}
}

func who(ctx context.Context) (*uuid.UUID, bool) {
	p := auth.FromContext(ctx)
	if p == nil {
		return nil, false
	}
	id := p.ID
	return &id, p.IsStaff()
}

// httpStatus maps a gRPC code to the HTTP status the Connect protocol answers with.
func httpStatus(c connect.Code) int {
	switch c {
	case connect.CodeCanceled:
		return 499
	case connect.CodeInvalidArgument, connect.CodeFailedPrecondition, connect.CodeOutOfRange:
		return 400
	case connect.CodeUnauthenticated:
		return 401
	case connect.CodePermissionDenied:
		return 403
	case connect.CodeNotFound:
		return 404
	case connect.CodeAlreadyExists, connect.CodeAborted:
		return 409
	case connect.CodeResourceExhausted:
		return 429
	case connect.CodeUnimplemented:
		return 501
	case connect.CodeUnavailable:
		return 503
	case connect.CodeDeadlineExceeded:
		return 504
	default: // Unknown, Internal, DataLoss
		return 500
	}
}
