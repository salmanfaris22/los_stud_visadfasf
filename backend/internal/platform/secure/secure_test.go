package secure

import (
	"bytes"
	"strings"
	"testing"
)

func TestPasswordHashAndVerify(t *testing.T) {
	h, err := HashPassword("Correct Horse 9!")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(h, "$argon2id$v=19$") {
		t.Fatalf("unexpected hash format %q", h)
	}
	if !VerifyPassword("Correct Horse 9!", h) {
		t.Error("correct password rejected")
	}
	if VerifyPassword("correct horse 9!", h) {
		t.Error("wrong password accepted")
	}
	if VerifyPassword("x", "not-a-hash") {
		t.Error("garbage hash accepted")
	}
	h2, _ := HashPassword("Correct Horse 9!")
	if h == h2 {
		t.Error("hashes must be salted (two hashes of the same password are equal)")
	}
}

func TestEncryptDecrypt(t *testing.T) {
	key := bytes.Repeat([]byte{7}, 32)
	ct, err := Encrypt(key, []byte(`{"access_token":"abc"}`))
	if err != nil {
		t.Fatal(err)
	}
	pt, err := Decrypt(key, ct)
	if err != nil || string(pt) != `{"access_token":"abc"}` {
		t.Fatalf("roundtrip failed: %q %v", pt, err)
	}
	ct[len(ct)-1] ^= 1
	if _, err := Decrypt(key, ct); err == nil {
		t.Error("tampered ciphertext accepted")
	}
	if _, err := Decrypt(bytes.Repeat([]byte{8}, 32), ct); err == nil {
		t.Error("wrong key accepted")
	}
}

func TestTokensAndCodes(t *testing.T) {
	a, b := Token(32), Token(32)
	if a == b || len(a) < 40 {
		t.Errorf("tokens not random/long enough: %q %q", a, b)
	}
	c := Code(8)
	if len(c) != 8 || strings.ContainsAny(c, "01OI") {
		t.Errorf("code %q has wrong length or ambiguous characters", c)
	}
	if HashToken("x") != HashToken("x") || HashToken("x") == HashToken("y") {
		t.Error("HashToken must be deterministic and distinct")
	}
}
