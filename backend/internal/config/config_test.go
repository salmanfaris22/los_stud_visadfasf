package config

import "testing"

func TestGetIgnoresCommentOnlyValue(t *testing.T) {
	cases := map[string]string{
		"# optional public bucket / CDN for thumbnails": "fallback", // `KEY=   # note` in .env
		"   ":                     "fallback",
		"":                        "fallback",
		"https://cdn.example.com": "https://cdn.example.com",
		"  value  ":               "value",
	}
	for in, want := range cases {
		t.Setenv("LMS_TEST_KEY", in)
		if got := get("LMS_TEST_KEY", "fallback"); got != want {
			t.Errorf("get(%q) = %q, want %q", in, got, want)
		}
	}
}
