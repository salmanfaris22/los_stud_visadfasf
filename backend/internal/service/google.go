package service

import (
	"context"
	"encoding/json"
	"net/http"

	"golang.org/x/oauth2"

	"github.com/lms/backend/internal/apperr"
	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/platform/secure"
	"github.com/lms/backend/internal/repository"
)

const orgTokenOwner = "org"

// orgGoogle returns an HTTP client authorised as the connected institute Google account.
// Call done() afterwards so refreshed tokens are saved (encrypted).
func (b base) orgGoogle(ctx context.Context) (hc *http.Client, email string, done func(), err error) {
	row, err := b.Q.GetGoogleToken(ctx, orgTokenOwner)
	if err != nil {
		return nil, "", nil, apperr.Invalid("Google account not connected (Settings → Google)")
	}
	plain, err := secure.Decrypt(b.Cfg.EncryptionKey, row.TokenEnc)
	if err != nil {
		return nil, "", nil, apperr.Internal(err)
	}
	var tok oauth2.Token
	if err := json.Unmarshal(plain, &tok); err != nil {
		return nil, "", nil, apperr.Internal(err)
	}
	ts := b.Google.OrgConfig(b.settings.Get(ctx).Google.WorkspaceEnabled).TokenSource(ctx, &tok)
	done = func() {
		if nt, err := ts.Token(); err == nil && nt.AccessToken != tok.AccessToken {
			_ = b.saveOrgToken(context.Background(), nt, row.Email, row.Scopes)
		}
	}
	return oauth2.NewClient(ctx, ts), row.Email, done, nil
}

func (b base) saveOrgToken(ctx context.Context, tok *oauth2.Token, email, scopes string) error {
	raw, err := json.Marshal(tok)
	if err != nil {
		return err
	}
	enc, err := secure.Encrypt(b.Cfg.EncryptionKey, raw)
	if err != nil {
		return err
	}
	return b.Q.UpsertGoogleToken(ctx, repository.UpsertGoogleTokenParams{Owner: orgTokenOwner, Email: email, TokenEnc: enc, Scopes: scopes})
}

// GoogleConnectURL starts connecting the institute Google account (Settings page).
func (s *SettingsService) GoogleConnectURL(ctx context.Context, secret []byte, st google.State) (string, error) {
	if !s.deps.Google.Enabled() {
		return "", apperr.Unavailable("set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET on the server first")
	}
	cfg := s.deps.Google.OrgConfig(s.Get(ctx).Google.WorkspaceEnabled)
	return cfg.AuthCodeURL(google.SignState(secret, st), oauth2.AccessTypeOffline, oauth2.SetAuthURLParam("prompt", "consent")), nil
}

// GoogleConnectFinish exchanges the code and stores the encrypted token.
func (s *SettingsService) GoogleConnectFinish(ctx context.Context, actor *auth.Principal, code string) error {
	cfg := s.deps.Google.OrgConfig(s.Get(ctx).Google.WorkspaceEnabled)
	tok, err := cfg.Exchange(ctx, code)
	if err != nil {
		return apperr.Invalid("Google did not accept the connection, try again")
	}
	info, err := google.FetchUserInfo(ctx, cfg.Client(ctx, tok))
	if err != nil {
		return apperr.Invalid("could not read the Google account")
	}
	b := base{Deps: s.deps, settings: s}
	scopes := ""
	for i, sc := range cfg.Scopes {
		if i > 0 {
			scopes += " "
		}
		scopes += sc
	}
	if err := b.saveOrgToken(ctx, tok, info.Email, scopes); err != nil {
		return dbErr(err, "google token")
	}
	if s.audit != nil {
		s.audit.Log(ctx, actor, "connect", "google", "", map[string]string{"email": info.Email})
	}
	return nil
}

// GoogleDisconnect removes the stored institute token.
func (s *SettingsService) GoogleDisconnect(ctx context.Context, actor *auth.Principal) error {
	if err := s.deps.Q.DeleteGoogleToken(ctx, orgTokenOwner); err != nil {
		return dbErr(err, "google token")
	}
	if s.audit != nil {
		s.audit.Log(ctx, actor, "disconnect", "google", "", nil)
	}
	return nil
}
