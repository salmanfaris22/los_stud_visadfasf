package service

import "testing"

func TestParseVideoRef(t *testing.T) {
	cases := []struct {
		provider, in, want string
		wantErr            bool
	}{
		{"youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10s", "dQw4w9WgXcQ", false},
		{"youtube", "https://youtu.be/dQw4w9WgXcQ?si=abc", "dQw4w9WgXcQ", false},
		{"youtube", "youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"youtube", "https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"youtube", "dQw4w9WgXcQ", "dQw4w9WgXcQ", false},
		{"youtube", "https://vimeo.com/76979871", "", true},
		{"vimeo", "https://vimeo.com/76979871", "76979871", false},
		{"vimeo", "https://vimeo.com/76979871/abcdef1234", "76979871:abcdef1234", false},
		{"vimeo", "https://player.vimeo.com/video/76979871?h=abcdef1234&badge=0", "76979871:abcdef1234", false},
		{"vimeo", "https://vimeo.com/channels/staffpicks/76979871", "76979871", false},
		{"vimeo", "https://youtube.com/watch?v=dQw4w9WgXcQ", "", true},
		{"bunny", "https://iframe.mediadelivery.net/embed/12345/0b6f7a5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "12345/0b6f7a5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", false},
		{"bunny", "https://iframe.mediadelivery.net/play/12345/0B6F7A5E-1C2D-4E5F-8A9B-0C1D2E3F4A5B", "12345/0b6f7a5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", false},
		{"bunny", "12345/0b6f7a5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", "12345/0b6f7a5e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", false},
		{"bunny", "https://example.com/video.mp4", "", true},
		{"cloudflare", "https://customer-abc123.cloudflarestream.com/5d5bc37ffcf54c9b82e996823bffbb81/iframe", "5d5bc37ffcf54c9b82e996823bffbb81", false},
		{"cloudflare", "5d5bc37ffcf54c9b82e996823bffbb81", "5d5bc37ffcf54c9b82e996823bffbb81", false},
		{"other", "x", "", true},
	}
	for _, c := range cases {
		got, err := ParseVideoRef(c.provider, c.in)
		if (err != nil) != c.wantErr || got != c.want {
			t.Errorf("ParseVideoRef(%s, %q) = %q, %v; want %q (err=%v)", c.provider, c.in, got, err, c.want, c.wantErr)
		}
	}
}

func TestEmbedURL(t *testing.T) {
	if got := EmbedURL("vimeo", "76979871:abc123"); got != "https://player.vimeo.com/video/76979871?byline=0&dnt=1&h=abc123&portrait=0&title=0" {
		t.Errorf("vimeo embed = %s", got)
	}
	if got := EmbedURL("youtube", "dQw4w9WgXcQ"); got != "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1" {
		t.Errorf("youtube embed = %s", got)
	}
}
