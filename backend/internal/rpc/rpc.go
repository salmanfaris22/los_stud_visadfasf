// Package rpc is the gRPC API layer: Connect handlers for the services in proto/lms/v1.
// One HTTP port serves gRPC, gRPC-Web and the Connect protocol (JSON or binary).
//
// Each adapter converts protobuf messages to the dto types the services take, calls the
// service and converts the result back. No business rules live here. Access rules,
// validation and error mapping are interceptors (see interceptors.go). Every RPC must
// declare an access rule in its .proto, or Handler refuses to start.
package rpc

import (
	"net/http"

	"buf.build/go/protovalidate"
	"connectrpc.com/connect"
	"connectrpc.com/grpchealth"
	"connectrpc.com/grpcreflect"

	"github.com/lms/backend/gen/lms/v1/lmsv1connect"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/service"
)

// server holds what every adapter needs.
type server struct {
	s       *service.Services
	cfg     *config.Config
	tokens  *auth.Tokens
	cookies auth.CookieFactory
}

// mount registers one generated service handler.
type mount struct {
	name    string
	handler func(opts ...connect.HandlerOption) (string, http.Handler)
}

func (srv *server) mounts() []mount {
	return []mount{
		{lmsv1connect.AuthServiceName, func(o ...connect.HandlerOption) (string, http.Handler) {
			return lmsv1connect.NewAuthServiceHandler(authServer{srv}, o...)
		}},
	}
}

// ServiceNames lists every gRPC service the API serves (used by reflection, health and tests).
func ServiceNames() []string {
	ms := (&server{}).mounts()
	names := make([]string, len(ms))
	for i, m := range ms {
		names[i] = m.name
	}
	return names
}

// Handler serves every procedure (at /<package>.<Service>/<Method>), gRPC reflection and
// gRPC health. It fails when an RPC has no valid access rule.
func Handler(s *service.Services, d *service.Deps) (http.Handler, error) {
	srv := &server{s: s, cfg: d.Cfg, tokens: d.Tokens, cookies: d.Cookies}
	names := ServiceNames()
	rules, err := AccessRules(names)
	if err != nil {
		return nil, err
	}
	validator, err := protovalidate.New()
	if err != nil {
		return nil, err
	}
	opts := []connect.HandlerOption{
		// Outermost first: errors see everything, access runs before validation.
		connect.WithInterceptors(errorInterceptor{}, &accessInterceptor{rules: rules, redis: d.Redis}, validateInterceptor{v: validator}),
		connect.WithRecover(recoverPanic),
	}
	mux := http.NewServeMux()
	for _, m := range srv.mounts() {
		mux.Handle(m.handler(opts...))
	}
	reflector := grpcreflect.NewStaticReflector(names...)
	mux.Handle(grpcreflect.NewHandlerV1(reflector))
	mux.Handle(grpcreflect.NewHandlerV1Alpha(reflector))
	mux.Handle(grpchealth.NewHandler(grpchealth.NewStaticChecker(names...)))
	return mux, nil
}
