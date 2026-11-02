package google

import (
	"testing"
	"time"
)

func TestStateSigning(t *testing.T) {
	secret := []byte("0123456789abcdef0123456789abcdef")
	raw := SignState(secret, State{Purpose: "login", App: "student", Nonce: "n", Exp: time.Now().Add(time.Minute).Unix()})
	st, err := ParseState(secret, raw)
	if err != nil || st.App != "student" || st.Purpose != "login" {
		t.Fatalf("valid state rejected: %v", err)
	}
	if _, err := ParseState([]byte("ffffffffffffffffffffffffffffffff"), raw); err == nil {
		t.Error("state with wrong signature accepted")
	}
	if _, err := ParseState(secret, raw[:len(raw)-2]+"xx"); err == nil {
		t.Error("tampered state accepted")
	}
	old := SignState(secret, State{Purpose: "login", Exp: time.Now().Add(-time.Minute).Unix()})
	if _, err := ParseState(secret, old); err == nil {
		t.Error("expired state accepted")
	}
}

func TestMeetingCode(t *testing.T) {
	if c := MeetingCode("https://meet.google.com/ABC-defg-hij?authuser=0"); c != "abc-defg-hij" {
		t.Errorf("got %q", c)
	}
	if MeetingCode("https://zoom.us/j/123") != "" {
		t.Error("non-meet link must give empty code")
	}
}
