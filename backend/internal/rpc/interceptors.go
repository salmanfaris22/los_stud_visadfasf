package rpc

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"runtime/debug"
	"strconv"
	"strings"
	"time"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/reflect/protoreflect"
	"google.golang.org/protobuf/reflect/protoregistry"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/platform/ratelimit"
)

const internalMessage = "something went wrong, please try again"

// ── access rules ──

// AccessRules reads the lms.v1.access option of every method of the named services, keyed by
// procedure ("/lms.v1.AuthService/Login"). A method without a valid rule is an error.
func AccessRules(services []string) (map[string]*lmsv1.Access, error) {
	rules := map[string]*lmsv1.Access{}
	for _, name := range services {
		d, err := protoregistry.GlobalFiles.FindDescriptorByName(protoreflect.FullName(name))
		if err != nil {
			return nil, fmt.Errorf("rpc: service %s: %w", name, err)
		}
		sd, ok := d.(protoreflect.ServiceDescriptor)
		if !ok {
			return nil, fmt.Errorf("rpc: %s is not a service", name)
		}
		for i := 0; i < sd.Methods().Len(); i++ {
			md := sd.Methods().Get(i)
			procedure := fmt.Sprintf("/%s/%s", sd.FullName(), md.Name())
			rule, _ := proto.GetExtension(md.Options(), lmsv1.E_Access).(*lmsv1.Access)
			if err := checkRule(rule); err != nil {
				return nil, fmt.Errorf("rpc: %s: %w", procedure, err)
			}
			rules[procedure] = rule
		}
	}
	return rules, nil
}

func checkRule(r *lmsv1.Access) error {
	switch v := r.GetRule().(type) {
	case nil:
		return errors.New("missing (lms.v1.access) option")
	case *lmsv1.Access_Public:
		if !v.Public {
			return errors.New("public must be true")
		}
	case *lmsv1.Access_SignedIn:
		if !v.SignedIn {
			return errors.New("signed_in must be true")
		}
	case *lmsv1.Access_Student:
		if !v.Student {
			return errors.New("student must be true")
		}
	case *lmsv1.Access_Staff:
		if !v.Staff {
			return errors.New("staff must be true")
		}
	case *lmsv1.Access_Perm:
		if v.Perm.GetModule() == "" || v.Perm.GetAction() == "" {
			return errors.New("perm needs module and action")
		}
	}
	if rl := r.GetRateLimit(); rl != nil && (rl.GetBucket() == "" || rl.GetLimit() == 0 || rl.GetWindowSeconds() == 0) {
		return errors.New("rate_limit needs bucket, limit and window_seconds")
	}
	return nil
}

// accessInterceptor enforces each procedure's access rule and rate limit. Unknown procedures
// are denied.
type accessInterceptor struct {
	rules   map[string]*lmsv1.Access
	limiter *ratelimit.Limiter
}

func (a *accessInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if err := a.check(ctx, req.Spec().Procedure); err != nil {
			return nil, err
		}
		return next(ctx, req)
	}
}

func (a *accessInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (a *accessInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := a.check(ctx, conn.Spec().Procedure); err != nil {
			return err
		}
		return next(ctx, conn)
	}
}

func (a *accessInterceptor) check(ctx context.Context, procedure string) error {
	rule, ok := a.rules[procedure]
	if !ok {
		return connect.NewError(connect.CodePermissionDenied, errors.New("this action is not allowed"))
	}
	if rl := rule.GetRateLimit(); rl != nil {
		window := time.Duration(rl.GetWindowSeconds()) * time.Second
		if !a.limiter.Allow(rl.GetBucket(), auth.MetaFrom(ctx).IP, int(rl.GetLimit()), window) {
			err := connect.NewError(connect.CodeResourceExhausted, errors.New("too many requests, try again later"))
			err.Meta().Set("Retry-After", strconv.Itoa(int(rl.GetWindowSeconds())))
			return err
		}
	}
	p := auth.FromContext(ctx)
	switch v := rule.GetRule().(type) {
	case *lmsv1.Access_Public:
		return nil
	case *lmsv1.Access_SignedIn:
		if p == nil {
			return signInRequired()
		}
	case *lmsv1.Access_Student:
		if p == nil {
			return signInRequired()
		}
		if !p.IsStudent() {
			return denied("students only")
		}
	case *lmsv1.Access_Staff:
		if p == nil {
			return signInRequired()
		}
		if !p.IsStaff() {
			return denied("staff only")
		}
	case *lmsv1.Access_Perm:
		if p == nil {
			return signInRequired()
		}
		if !p.IsStaff() || !p.Can(v.Perm.GetModule(), v.Perm.GetAction()) {
			return denied(fmt.Sprintf("you need the %s %s permission", v.Perm.GetModule(), v.Perm.GetAction()))
		}
	default:
		return denied("this action is not allowed")
	}
	return nil
}

func signInRequired() error {
	return connect.NewError(connect.CodeUnauthenticated, errors.New("sign in required"))
}

func denied(msg string) error { return connect.NewError(connect.CodePermissionDenied, errors.New(msg)) }

// ── validation ──

// validateInterceptor checks every request message against its protovalidate rules.
type validateInterceptor struct{ v protovalidate.Validator }

func (vi validateInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		if msg, ok := req.Any().(proto.Message); ok {
			if err := vi.v.Validate(msg); err != nil {
				return nil, invalidArgument(err)
			}
		}
		return next(ctx, req)
	}
}

func (vi validateInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (vi validateInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		return next(ctx, &validatingConn{StreamingHandlerConn: conn, v: vi.v})
	}
}

type validatingConn struct {
	connect.StreamingHandlerConn
	v protovalidate.Validator
}

func (c *validatingConn) Receive(m any) error {
	if err := c.StreamingHandlerConn.Receive(m); err != nil {
		return err
	}
	if msg, ok := m.(proto.Message); ok {
		if err := c.v.Validate(msg); err != nil {
			return invalidArgument(err)
		}
	}
	return nil
}

var indexSuffix = regexp.MustCompile(`\[[^\]]*\]`)

// invalidArgument reports the first violation as "field name: message" (the same shape the
// web forms showed before) and attaches all violations as an error detail.
func invalidArgument(err error) error {
	var ve *protovalidate.ValidationError
	if !errors.As(err, &ve) || len(ve.Violations) == 0 {
		return err // a broken rule is a server bug: the error interceptor logs it as internal
	}
	v := ve.Violations[0].Proto
	msg := v.GetMessage()
	if path := protovalidate.FieldPathString(v.GetField()); path != "" {
		parts := strings.Split(indexSuffix.ReplaceAllString(path, ""), ".")
		msg = strings.ReplaceAll(parts[len(parts)-1], "_", " ") + ": " + msg
	}
	cerr := connect.NewError(connect.CodeInvalidArgument, errors.New(msg))
	if detail, derr := connect.NewErrorDetail(ve.ToProto()); derr == nil {
		cerr.AddDetail(detail)
	}
	return cerr
}

// ── errors ──

// errorInterceptor turns service errors (apperr) into Connect codes. Anything unexpected is
// logged and answered with a generic Internal error.
type errorInterceptor struct{}

func (errorInterceptor) WrapUnary(next connect.UnaryFunc) connect.UnaryFunc {
	return func(ctx context.Context, req connect.AnyRequest) (connect.AnyResponse, error) {
		res, err := next(ctx, req)
		if err != nil {
			return nil, toConnectError(ctx, req.Spec().Procedure, err)
		}
		return res, nil
	}
}

func (errorInterceptor) WrapStreamingClient(next connect.StreamingClientFunc) connect.StreamingClientFunc {
	return next
}

func (errorInterceptor) WrapStreamingHandler(next connect.StreamingHandlerFunc) connect.StreamingHandlerFunc {
	return func(ctx context.Context, conn connect.StreamingHandlerConn) error {
		if err := next(ctx, conn); err != nil {
			return toConnectError(ctx, conn.Spec().Procedure, err)
		}
		return nil
	}
}

var codes = map[apperr.Kind]connect.Code{
	apperr.KindInvalid:      connect.CodeInvalidArgument,
	apperr.KindUnauthorized: connect.CodeUnauthenticated,
	apperr.KindForbidden:    connect.CodePermissionDenied,
	apperr.KindNotFound:     connect.CodeNotFound,
	apperr.KindConflict:     connect.CodeAlreadyExists,
	apperr.KindRateLimited:  connect.CodeResourceExhausted,
	apperr.KindUnavailable:  connect.CodeUnavailable,
}

// CodeOf is the Connect code for an apperr kind (Internal for unknown kinds).
func CodeOf(k apperr.Kind) connect.Code {
	if c, ok := codes[k]; ok {
		return c
	}
	return connect.CodeInternal
}

func toConnectError(ctx context.Context, procedure string, err error) error {
	var ce *connect.Error
	if errors.As(err, &ce) {
		return err
	}
	var ae *apperr.Error
	if errors.As(err, &ae) && ae.Kind != apperr.KindInternal {
		return connect.NewError(CodeOf(ae.Kind), errors.New(ae.Message))
	}
	if errors.Is(err, context.Canceled) {
		return connect.NewError(connect.CodeCanceled, errors.New("request cancelled"))
	}
	slog.ErrorContext(ctx, "request failed", "procedure", procedure, "err", err)
	return connect.NewError(connect.CodeInternal, errors.New(internalMessage))
}

func recoverPanic(ctx context.Context, spec connect.Spec, _ http.Header, p any) error {
	slog.ErrorContext(ctx, "panic", "procedure", spec.Procedure, "panic", p, "stack", string(debug.Stack()))
	return connect.NewError(connect.CodeInternal, errors.New(internalMessage))
}
