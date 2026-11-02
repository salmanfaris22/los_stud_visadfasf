package service

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
)

// Supported video providers. Admins pick one per video and paste a link or id.
const (
	ProviderYouTube    = "youtube"
	ProviderVimeo      = "vimeo"
	ProviderBunny      = "bunny"
	ProviderCloudflare = "cloudflare"
)

var (
	ytIDRe    = regexp.MustCompile(`^[A-Za-z0-9_-]{11}$`)
	digitsRe  = regexp.MustCompile(`^\d{5,12}$`)
	hashRe    = regexp.MustCompile(`^[0-9a-f]{6,20}$`)
	guidRe    = regexp.MustCompile(`^[0-9a-fA-F-]{36}$`)
	cfUIDRe   = regexp.MustCompile(`^[0-9a-f]{32}$`)
	libraryRe = regexp.MustCompile(`^\d{2,10}$`)
)

// ParseVideoRef normalises a pasted URL (or raw id) into the provider reference we store.
//
//	youtube    -> "dQw4w9WgXcQ"
//	vimeo      -> "76979871" or "76979871:abcdef1234" (unlisted hash)
//	bunny      -> "<libraryId>/<videoGuid>"
//	cloudflare -> "<32-char uid>"
func ParseVideoRef(provider, input string) (string, error) {
	in := strings.TrimSpace(input)
	if in == "" {
		return "", fmt.Errorf("paste the video link")
	}
	switch provider {
	case ProviderYouTube:
		if ytIDRe.MatchString(in) {
			return in, nil
		}
		u, err := parseURL(in)
		if err != nil {
			return "", err
		}
		host := strings.TrimPrefix(u.Hostname(), "www.")
		host = strings.TrimPrefix(host, "m.")
		var id string
		switch host {
		case "youtu.be":
			id = firstSegment(u.Path)
		case "youtube.com", "youtube-nocookie.com", "music.youtube.com":
			if v := u.Query().Get("v"); v != "" {
				id = v
			} else {
				parts := segments(u.Path)
				if len(parts) >= 2 && (parts[0] == "embed" || parts[0] == "shorts" || parts[0] == "live" || parts[0] == "v") {
					id = parts[1]
				}
			}
		}
		if !ytIDRe.MatchString(id) {
			return "", fmt.Errorf("that is not a valid YouTube video link")
		}
		return id, nil

	case ProviderVimeo:
		if digitsRe.MatchString(in) {
			return in, nil
		}
		u, err := parseURL(in)
		if err != nil {
			return "", err
		}
		host := strings.TrimPrefix(u.Hostname(), "www.")
		if host != "vimeo.com" && host != "player.vimeo.com" {
			return "", fmt.Errorf("that is not a Vimeo link")
		}
		parts := segments(u.Path)
		id, hash := "", u.Query().Get("h")
		for i, p := range parts {
			if digitsRe.MatchString(p) {
				id = p
				if hash == "" && i+1 < len(parts) && hashRe.MatchString(parts[i+1]) {
					hash = parts[i+1]
				}
				break
			}
		}
		if id == "" {
			return "", fmt.Errorf("could not find the Vimeo video id in the link")
		}
		if hash != "" {
			return id + ":" + hash, nil
		}
		return id, nil

	case ProviderBunny:
		if lib, guid, ok := strings.Cut(in, "/"); ok && libraryRe.MatchString(lib) && guidRe.MatchString(guid) {
			return lib + "/" + strings.ToLower(guid), nil
		}
		u, err := parseURL(in)
		if err != nil {
			return "", err
		}
		parts := segments(u.Path)
		// iframe.mediadelivery.net/embed/{lib}/{guid} or /play/{lib}/{guid}
		for i := 0; i+2 < len(parts); i++ {
			if (parts[i] == "embed" || parts[i] == "play") && libraryRe.MatchString(parts[i+1]) && guidRe.MatchString(parts[i+2]) {
				return parts[i+1] + "/" + strings.ToLower(parts[i+2]), nil
			}
		}
		return "", fmt.Errorf("use the Bunny Stream embed link (iframe.mediadelivery.net/embed/<library>/<video>)")

	case ProviderCloudflare:
		if cfUIDRe.MatchString(in) {
			return in, nil
		}
		u, err := parseURL(in)
		if err != nil {
			return "", err
		}
		for _, p := range segments(u.Path) {
			if cfUIDRe.MatchString(p) {
				return p, nil
			}
		}
		return "", fmt.Errorf("could not find the Cloudflare Stream video id in the link")
	}
	return "", fmt.Errorf("unknown provider %q", provider)
}

// EmbedURL returns the iframe src for a stored reference.
func EmbedURL(provider, ref string) string {
	switch provider {
	case ProviderYouTube:
		return "https://www.youtube-nocookie.com/embed/" + ref + "?rel=0&modestbranding=1&playsinline=1"
	case ProviderVimeo:
		id, hash, _ := strings.Cut(ref, ":")
		q := url.Values{"dnt": {"1"}, "title": {"0"}, "byline": {"0"}, "portrait": {"0"}}
		if hash != "" {
			q.Set("h", hash)
		}
		return "https://player.vimeo.com/video/" + id + "?" + q.Encode()
	case ProviderBunny:
		return "https://iframe.mediadelivery.net/embed/" + ref + "?autoplay=false&preload=true&responsive=true"
	case ProviderCloudflare:
		return "https://iframe.videodelivery.net/" + ref
	}
	return ""
}

// ThumbnailURL returns a poster image when the provider exposes one without an API call.
func ThumbnailURL(provider, ref string) string {
	switch provider {
	case ProviderYouTube:
		return "https://i.ytimg.com/vi/" + ref + "/hqdefault.jpg"
	case ProviderCloudflare:
		return "https://videodelivery.net/" + ref + "/thumbnails/thumbnail.jpg?height=360"
	case ProviderVimeo:
		id, _, _ := strings.Cut(ref, ":")
		return "https://vumbnail.com/" + id + ".jpg"
	}
	return ""
}

func parseURL(in string) (*url.URL, error) {
	if !strings.Contains(in, "://") {
		in = "https://" + in
	}
	u, err := url.Parse(in)
	if err != nil || u.Host == "" {
		return nil, fmt.Errorf("that does not look like a link")
	}
	return u, nil
}

func segments(p string) []string {
	out := []string{}
	for _, s := range strings.Split(p, "/") {
		if s != "" {
			out = append(out, s)
		}
	}
	return out
}

func firstSegment(p string) string {
	s := segments(p)
	if len(s) == 0 {
		return ""
	}
	return s[0]
}
