package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTokensIssueParse(t *testing.T) {
	tk := NewTokens([]byte("0123456789abcdef0123456789abcdef"), time.Minute)
	id := uuid.New()
	raw, err := tk.Issue(id, KindStaff, AppAdmin)
	if err != nil {
		t.Fatal(err)
	}
	c, err := tk.Parse(raw)
	if err != nil || c.Subject != id.String() || c.App != AppAdmin || c.Kind != KindStaff {
		t.Fatalf("parse mismatch: %+v %v", c, err)
	}
	other := NewTokens([]byte("ffffffffffffffffffffffffffffffff"), time.Minute)
	if _, err := other.Parse(raw); err == nil {
		t.Error("token signed with another secret accepted")
	}
	expired := NewTokens([]byte("0123456789abcdef0123456789abcdef"), -time.Minute)
	old, _ := expired.Issue(id, KindStaff, AppAdmin)
	if _, err := tk.Parse(old); err == nil {
		t.Error("expired token accepted")
	}
}

func TestPrincipalPermissions(t *testing.T) {
	p := &Principal{ID: uuid.New(), Kind: KindStaff, Perms: map[string]bool{"courses:view": true}}
	if !p.Can("courses", "view") || p.Can("courses", "delete") {
		t.Error("permission check wrong")
	}
	if p.MentorScope() != nil {
		t.Error("unscoped user must have nil scope")
	}
	p.Scoped = true
	if s := p.MentorScope(); s == nil || *s != p.ID {
		t.Error("scoped user must be limited to own id")
	}
	super := &Principal{Super: true, Scoped: true}
	if !super.Can("settings", "delete") || super.MentorScope() != nil {
		t.Error("super admin must have everything and no scope")
	}
	if n := len(super.PermissionList()); n != len(Modules)*len(Actions) {
		t.Errorf("super admin permission list has %d entries", n)
	}
	var nilP *Principal
	if nilP.Can("courses", "view") {
		t.Error("nil principal must have no permissions")
	}
}

func TestCatalog(t *testing.T) {
	if !ValidModule("students") || ValidModule("nope") || !ValidAction("delete") || ValidAction("approve") {
		t.Error("catalog validation wrong")
	}
	for m := range MentorDefaults {
		if !ValidModule(m) {
			t.Errorf("mentor default module %q not in catalog", m)
		}
	}
	if KindForApp(AppAdmin) != KindStaff || KindForApp(AppStudent) != KindStudent {
		t.Error("portal kind mapping wrong")
	}
}
