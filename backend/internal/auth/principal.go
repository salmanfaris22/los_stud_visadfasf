// Package auth holds identity primitives shared by every layer: the signed-in Principal,
// request metadata, the permission catalogue and JWT access tokens. It has no DB access.
package auth

import (
	"context"
	"net/http"

	"github.com/google/uuid"
)

const (
	AppAdmin    = "admin"
	AppStudent  = "student"
	KindStaff   = "staff"
	KindStudent = "student"
)

// Principal is the signed-in user for the current request.
type Principal struct {
	ID     uuid.UUID
	Kind   string
	Name   string
	Email  string
	Avatar string
	Super  bool
	Scoped bool // roles limit the user to assigned courses / batches
	Perms  map[string]bool
	App    string

	SalesScope string     // all | team | own (see SalesFilter)
	TeamID     *uuid.UUID // sales team, when the user has a sales profile
}

func (p *Principal) IsStaff() bool   { return p != nil && p.Kind == KindStaff }
func (p *Principal) IsStudent() bool { return p != nil && p.Kind == KindStudent }

// Can reports whether the user holds module:action (super admins always can).
func (p *Principal) Can(module, action string) bool {
	return p != nil && (p.Super || p.Perms[module+":"+action])
}

// MentorScope returns the user id when access is limited to assigned courses/batches,
// or nil when the user can see everything. Pass it straight into list queries.
func (p *Principal) MentorScope() *uuid.UUID {
	if p == nil || p.Super || !p.Scoped {
		return nil
	}
	id := p.ID
	return &id
}

// SalesFilter returns the owner / team limits for sales data (leads, admissions, payments,
// commissions). Both nil means the user sees everything.
func (p *Principal) SalesFilter() (owner, team *uuid.UUID) {
	if p == nil || p.Super || p.SalesScope == SalesAll {
		return nil, nil
	}
	if p.SalesScope == SalesTeam && p.TeamID != nil {
		t := *p.TeamID
		return nil, &t
	}
	id := p.ID
	return &id, nil
}

// SeesAllSales reports whether no sales scope limit applies.
func (p *Principal) SeesAllSales() bool {
	o, t := p.SalesFilter()
	return o == nil && t == nil
}

// PermissionList returns "module:action" strings for the frontend.
func (p *Principal) PermissionList() []string {
	out := []string{}
	if p.Super {
		for _, m := range Modules {
			for _, a := range Actions {
				out = append(out, m.Key+":"+a)
			}
		}
		return out
	}
	for k, ok := range p.Perms {
		if ok {
			out = append(out, k)
		}
	}
	return out
}

type ctxKey int

const (
	principalKey ctxKey = iota
	metaKey
)

func WithPrincipal(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, principalKey, p)
}

// FromContext returns the signed-in user or nil.
func FromContext(ctx context.Context) *Principal {
	p, _ := ctx.Value(principalKey).(*Principal)
	return p
}

// Meta is request metadata captured by the authentication middleware.
type Meta struct {
	App       string
	IP        string
	UserAgent string
	Cookies   []*http.Cookie
}

func (m Meta) Cookie(name string) string {
	for _, c := range m.Cookies {
		if c.Name == name {
			return c.Value
		}
	}
	return ""
}

func WithMeta(ctx context.Context, m Meta) context.Context { return context.WithValue(ctx, metaKey, m) }

func MetaFrom(ctx context.Context) Meta {
	m, _ := ctx.Value(metaKey).(Meta)
	if m.App == "" {
		m.App = AppStudent
	}
	return m
}

// KindForApp maps a portal to the account kind allowed to sign in there.
func KindForApp(app string) string {
	if app == AppAdmin {
		return KindStaff
	}
	return KindStudent
}
