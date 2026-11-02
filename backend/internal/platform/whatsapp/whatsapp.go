// Package whatsapp is a small client for the Meta WhatsApp Cloud API (Graph API) plus the
// webhook payload types and signature check. It also fetches Meta lead-ad submissions.
package whatsapp

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"strings"
	"time"
)

// DefaultBase is the Graph API root used in production.
const DefaultBase = "https://graph.facebook.com/v21.0"

// Creds identify the business phone number and the system-user token.
type Creds struct {
	Token         string
	PhoneNumberID string
	WABAID        string
}

type Client struct {
	base string
	http *http.Client
}

func New(base string) *Client {
	if base == "" {
		base = DefaultBase
	}
	return &Client{base: strings.TrimRight(base, "/"), http: &http.Client{Timeout: 30 * time.Second}}
}

// APIError is an error answered by the Graph API.
type APIError struct {
	Status  int
	Code    int    `json:"code"`
	Message string `json:"message"`
	Details string
}

func (e *APIError) Error() string {
	msg := e.Message
	if e.Details != "" {
		msg += ": " + e.Details
	}
	return fmt.Sprintf("whatsapp api (%d/%d): %s", e.Status, e.Code, msg)
}

// IsWindowClosed reports Meta's "re-engagement" error: the 24-hour reply window has ended.
func IsWindowClosed(err error) bool {
	ae, ok := err.(*APIError)
	return ok && ae.Code == 131047
}

func (c *Client) do(ctx context.Context, cr Creds, method, path string, body io.Reader, contentType string, out any) error {
	target := c.base + path
	if strings.HasPrefix(path, "https://") || strings.HasPrefix(path, "http://") {
		target = path // paging links from Meta are absolute
	}
	req, err := http.NewRequestWithContext(ctx, method, target, body)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+cr.Token)
	if contentType != "" {
		req.Header.Set("Content-Type", contentType)
	}
	res, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4<<20))
	if res.StatusCode >= 300 {
		var e struct {
			Error struct {
				Code      int    `json:"code"`
				Message   string `json:"message"`
				ErrorData struct {
					Details string `json:"details"`
				} `json:"error_data"`
			} `json:"error"`
		}
		_ = json.Unmarshal(raw, &e)
		return &APIError{Status: res.StatusCode, Code: e.Error.Code, Message: orDefault(e.Error.Message, res.Status), Details: e.Error.ErrorData.Details}
	}
	if out != nil {
		return json.Unmarshal(raw, out)
	}
	return nil
}

func orDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func (c *Client) postJSON(ctx context.Context, cr Creds, path string, payload any, out any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	return c.do(ctx, cr, http.MethodPost, path, bytes.NewReader(raw), "application/json", out)
}

type sendResponse struct {
	Messages []struct {
		ID string `json:"id"`
	} `json:"messages"`
}

func (c *Client) send(ctx context.Context, cr Creds, payload map[string]any) (string, error) {
	payload["messaging_product"] = "whatsapp"
	payload["recipient_type"] = "individual"
	var res sendResponse
	if err := c.postJSON(ctx, cr, "/"+cr.PhoneNumberID+"/messages", payload, &res); err != nil {
		return "", err
	}
	if len(res.Messages) == 0 {
		return "", fmt.Errorf("whatsapp api: no message id returned")
	}
	return res.Messages[0].ID, nil
}

// SendText sends a free-form message (only inside the 24-hour window).
func (c *Client) SendText(ctx context.Context, cr Creds, to, body string) (string, error) {
	return c.send(ctx, cr, map[string]any{"to": to, "type": "text", "text": map[string]any{"body": body, "preview_url": true}})
}

// SendTemplate sends an approved template; params fill {{1}}, {{2}}… in the body.
func (c *Client) SendTemplate(ctx context.Context, cr Creds, to, name, lang string, params []string) (string, error) {
	tpl := map[string]any{"name": name, "language": map[string]string{"code": lang}}
	if len(params) > 0 {
		ps := make([]map[string]string, len(params))
		for i, p := range params {
			ps[i] = map[string]string{"type": "text", "text": p}
		}
		tpl["components"] = []map[string]any{{"type": "body", "parameters": ps}}
	}
	return c.send(ctx, cr, map[string]any{"to": to, "type": "template", "template": tpl})
}

// SendMedia sends an uploaded media id as image, document, audio or video.
func (c *Client) SendMedia(ctx context.Context, cr Creds, to, kind, mediaID, caption, filename string) (string, error) {
	m := map[string]any{"id": mediaID}
	if caption != "" && kind != "audio" {
		m["caption"] = caption
	}
	if kind == "document" && filename != "" {
		m["filename"] = filename
	}
	return c.send(ctx, cr, map[string]any{"to": to, "type": kind, kind: m})
}

// MarkRead shows blue ticks for a received message.
func (c *Client) MarkRead(ctx context.Context, cr Creds, messageID string) error {
	return c.postJSON(ctx, cr, "/"+cr.PhoneNumberID+"/messages",
		map[string]any{"messaging_product": "whatsapp", "status": "read", "message_id": messageID}, nil)
}

// UploadMedia uploads a file to Meta and returns its media id.
func (c *Client) UploadMedia(ctx context.Context, cr Creds, r io.Reader, mime, filename string) (string, error) {
	var buf bytes.Buffer
	w := multipart.NewWriter(&buf)
	_ = w.WriteField("messaging_product", "whatsapp")
	_ = w.WriteField("type", mime)
	h := make(textproto.MIMEHeader)
	h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%q`, filename))
	h.Set("Content-Type", mime)
	part, err := w.CreatePart(h)
	if err != nil {
		return "", err
	}
	if _, err := io.Copy(part, io.LimitReader(r, 100<<20)); err != nil {
		return "", err
	}
	if err := w.Close(); err != nil {
		return "", err
	}
	var res struct {
		ID string `json:"id"`
	}
	if err := c.do(ctx, cr, http.MethodPost, "/"+cr.PhoneNumberID+"/media", &buf, w.FormDataContentType(), &res); err != nil {
		return "", err
	}
	return res.ID, nil
}

// MediaInfo is where a received media file can be downloaded (the URL lasts a few minutes).
type MediaInfo struct {
	URL      string `json:"url"`
	MimeType string `json:"mime_type"`
	FileSize int64  `json:"file_size"`
}

func (c *Client) Media(ctx context.Context, cr Creds, mediaID string) (MediaInfo, error) {
	var m MediaInfo
	err := c.do(ctx, cr, http.MethodGet, "/"+url.PathEscape(mediaID), nil, "", &m)
	return m, err
}

// Download fetches a media URL (it needs the bearer token). The caller closes the body.
func (c *Client) Download(ctx context.Context, cr Creds, mediaURL string) (io.ReadCloser, int64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+cr.Token)
	res, err := c.http.Do(req)
	if err != nil {
		return nil, 0, err
	}
	if res.StatusCode >= 300 {
		res.Body.Close()
		return nil, 0, fmt.Errorf("whatsapp media download: %s", res.Status)
	}
	return res.Body, res.ContentLength, nil
}

// Template is a message template as listed by Meta.
type Template struct {
	Name       string `json:"name"`
	Language   string `json:"language"`
	Category   string `json:"category"`
	Status     string `json:"status"`
	Components []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"components"`
}

// Body returns the template's body text.
func (t Template) Body() string {
	for _, c := range t.Components {
		if c.Type == "BODY" {
			return c.Text
		}
	}
	return ""
}

// Templates lists every message template of the WhatsApp Business Account (all pages).
func (c *Client) Templates(ctx context.Context, cr Creds) ([]Template, error) {
	var out []Template
	path := "/" + cr.WABAID + "/message_templates?limit=200&fields=name,language,category,status,components"
	for i := 0; path != "" && i < 20; i++ {
		var page struct {
			Data   []Template `json:"data"`
			Paging struct {
				Next string `json:"next"`
			} `json:"paging"`
		}
		if err := c.do(ctx, cr, http.MethodGet, path, nil, "", &page); err != nil {
			return nil, err
		}
		out = append(out, page.Data...)
		path = ""
		if c.sameHost(page.Paging.Next) { // never send the token anywhere but the Graph API
			path = page.Paging.Next
		}
	}
	return out, nil
}

func (c *Client) sameHost(link string) bool {
	if link == "" {
		return false
	}
	a, err1 := url.Parse(link)
	b, err2 := url.Parse(c.base)
	return err1 == nil && err2 == nil && a.Scheme == b.Scheme && a.Host == b.Host
}

// LeadgenLead fetches a Meta lead-ad submission and flattens its answers (field name → value).
func (c *Client) LeadgenLead(ctx context.Context, cr Creds, leadgenID string) (map[string]string, error) {
	var res struct {
		FieldData []struct {
			Name   string   `json:"name"`
			Values []string `json:"values"`
		} `json:"field_data"`
	}
	if err := c.do(ctx, cr, http.MethodGet, "/"+url.PathEscape(leadgenID)+"?fields=field_data,created_time,ad_name,form_id", nil, "", &res); err != nil {
		return nil, err
	}
	out := map[string]string{}
	for _, f := range res.FieldData {
		if len(f.Values) > 0 {
			out[strings.ToLower(f.Name)] = strings.Join(f.Values, ", ")
		}
	}
	return out, nil
}

// VerifySignature checks Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the raw body).
func VerifySignature(appSecret string, body []byte, header string) bool {
	if appSecret == "" || !strings.HasPrefix(header, "sha256=") {
		return false
	}
	want, err := hex.DecodeString(strings.TrimPrefix(header, "sha256="))
	if err != nil {
		return false
	}
	mac := hmac.New(sha256.New, []byte(appSecret))
	mac.Write(body)
	return hmac.Equal(mac.Sum(nil), want)
}

// Sign builds the X-Hub-Signature-256 header value for a body (used by tests and tools).
func Sign(appSecret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(appSecret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}
