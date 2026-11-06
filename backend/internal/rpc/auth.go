package rpc

import (
	"context"
	"net/http"

	"connectrpc.com/connect"

	lmsv1 "github.com/lms/backend/gen/lms/v1"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/dto"
)

// authServer implements lms.v1.AuthService.
type authServer struct{ *server }

func (a authServer) GetProviders(ctx context.Context, _ *connect.Request[lmsv1.GetProvidersRequest]) (*connect.Response[lmsv1.GetProvidersResponse], error) {
	p := a.s.Auth.Providers(ctx)
	return connect.NewResponse(&lmsv1.GetProvidersResponse{Google: p.Google, Signup: p.Signup}), nil
}

func (a authServer) Login(ctx context.Context, req *connect.Request[lmsv1.LoginRequest]) (*connect.Response[lmsv1.LoginResponse], error) {
	sess, err := a.s.Auth.Login(ctx, auth.MetaFrom(ctx).App, dto.LoginInput{Email: req.Msg.GetEmail(), Password: req.Msg.GetPassword()})
	if err != nil {
		return nil, err
	}
	return withCookies(&lmsv1.LoginResponse{Me: meToPB(sess.User)}, a.SessionCookies(sess)...), nil
}

func (a authServer) Register(ctx context.Context, req *connect.Request[lmsv1.RegisterRequest]) (*connect.Response[lmsv1.RegisterResponse], error) {
	m := req.Msg
	sess, err := a.s.Auth.Register(ctx, auth.MetaFrom(ctx).App, dto.RegisterInput{Name: m.GetName(), Email: m.GetEmail(), Phone: m.GetPhone(), Password: m.GetPassword()})
	if err != nil {
		return nil, err
	}
	return withCookies(&lmsv1.RegisterResponse{Me: meToPB(sess.User)}, a.SessionCookies(sess)...), nil
}

func (a authServer) Refresh(ctx context.Context, _ *connect.Request[lmsv1.RefreshRequest]) (*connect.Response[lmsv1.RefreshResponse], error) {
	m := auth.MetaFrom(ctx)
	sess, err := a.s.Auth.Refresh(ctx, m.App, m.Cookie(auth.RefreshCookieName(m.App)))
	if err != nil {
		return nil, err
	}
	return withCookies(&lmsv1.RefreshResponse{Me: meToPB(sess.User)}, a.SessionCookies(sess)...), nil
}

func (a authServer) Logout(ctx context.Context, _ *connect.Request[lmsv1.LogoutRequest]) (*connect.Response[lmsv1.LogoutResponse], error) {
	m := auth.MetaFrom(ctx)
	a.s.Auth.Logout(ctx, m.Cookie(auth.RefreshCookieName(m.App)))
	return withCookies(&lmsv1.LogoutResponse{},
		a.cookies.Make(auth.AccessCookieName(m.App), "", "/", -1),
		a.cookies.Make(auth.RefreshCookieName(m.App), "", auth.RefreshCookiePath, -1),
		a.cookies.Make(auth.RefreshCookieName(m.App), "", auth.LegacyRefreshCookiePath, -1),
	), nil
}

func (a authServer) GetMe(ctx context.Context, _ *connect.Request[lmsv1.GetMeRequest]) (*connect.Response[lmsv1.GetMeResponse], error) {
	me, err := a.s.Auth.Me(ctx, auth.FromContext(ctx))
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.GetMeResponse{Me: meToPB(me)}), nil
}

func (a authServer) UpdateProfile(ctx context.Context, req *connect.Request[lmsv1.UpdateProfileRequest]) (*connect.Response[lmsv1.UpdateProfileResponse], error) {
	m := req.Msg
	me, err := a.s.Auth.UpdateProfile(ctx, auth.FromContext(ctx), dto.ProfileInput{Name: m.GetName(), Phone: m.GetPhone(), AvatarURL: m.GetAvatarUrl(), Bio: m.GetBio()})
	if err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.UpdateProfileResponse{Me: meToPB(me)}), nil
}

func (a authServer) ChangePassword(ctx context.Context, req *connect.Request[lmsv1.ChangePasswordRequest]) (*connect.Response[lmsv1.ChangePasswordResponse], error) {
	in := dto.ChangePasswordInput{CurrentPassword: req.Msg.GetCurrentPassword(), NewPassword: req.Msg.GetNewPassword()}
	if err := a.s.Auth.ChangePassword(ctx, auth.FromContext(ctx), in); err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.ChangePasswordResponse{Message: "password changed"}), nil
}

func (a authServer) ForgotPassword(ctx context.Context, req *connect.Request[lmsv1.ForgotPasswordRequest]) (*connect.Response[lmsv1.ForgotPasswordResponse], error) {
	if err := a.s.Auth.Forgot(ctx, auth.MetaFrom(ctx).App, req.Msg.GetEmail()); err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.ForgotPasswordResponse{Message: "if the email exists, a reset link has been sent"}), nil
}

func (a authServer) ResetPassword(ctx context.Context, req *connect.Request[lmsv1.ResetPasswordRequest]) (*connect.Response[lmsv1.ResetPasswordResponse], error) {
	if err := a.s.Auth.Reset(ctx, dto.ResetInput{Token: req.Msg.GetToken(), Password: req.Msg.GetPassword()}); err != nil {
		return nil, err
	}
	return connect.NewResponse(&lmsv1.ResetPasswordResponse{Message: "password updated, sign in with the new password"}), nil
}

// SessionCookies turns a session into the access + refresh cookies.
func (srv *server) SessionCookies(s dto.Session) []http.Cookie {
	return srv.cookies.Session(s.App, s.AccessToken, s.RefreshToken, srv.tokens.TTL(), srv.cfg.RefreshTTL)
}

func withCookies[T any](msg *T, cookies ...http.Cookie) *connect.Response[T] {
	res := connect.NewResponse(msg)
	for _, c := range cookies {
		res.Header().Add("Set-Cookie", c.String())
	}
	return res
}

func meToPB(m dto.Me) *lmsv1.Me {
	return &lmsv1.Me{
		Id: m.ID.String(), Kind: m.Kind, Name: m.Name, Email: m.Email, Phone: m.Phone, AvatarUrl: m.AvatarURL, Bio: m.Bio,
		StudentCode: m.StudentCode, IsSuperAdmin: m.IsSuperAdmin, Scoped: m.Scoped, SalesScope: m.SalesScope,
		Permissions: m.Permissions, App: m.App,
	}
}
