package whatsapp

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Payload is a Meta webhook delivery (WhatsApp messages/statuses or Page lead-ads).
type Payload struct {
	Object string  `json:"object"`
	Entry  []Entry `json:"entry"`
}

type Entry struct {
	ID      string   `json:"id"`
	Changes []Change `json:"changes"`
}

type Change struct {
	Field string          `json:"field"`
	Value json.RawMessage `json:"value"`
}

type Media struct {
	ID       string `json:"id"`
	MimeType string `json:"mime_type"`
	Caption  string `json:"caption"`
	Filename string `json:"filename"`
}

type Message struct {
	From      string `json:"from"`
	ID        string `json:"id"`
	Timestamp string `json:"timestamp"`
	Type      string `json:"type"`
	Text      *struct {
		Body string `json:"body"`
	} `json:"text"`
	Image    *Media `json:"image"`
	Document *Media `json:"document"`
	Audio    *Media `json:"audio"`
	Video    *Media `json:"video"`
	Sticker  *Media `json:"sticker"`
	Button   *struct {
		Text string `json:"text"`
	} `json:"button"`
	Interactive *struct {
		ButtonReply *struct {
			Title string `json:"title"`
		} `json:"button_reply"`
		ListReply *struct {
			Title string `json:"title"`
		} `json:"list_reply"`
	} `json:"interactive"`
	Location *struct {
		Latitude  float64 `json:"latitude"`
		Longitude float64 `json:"longitude"`
		Name      string  `json:"name"`
		Address   string  `json:"address"`
	} `json:"location"`
	Reaction *struct {
		Emoji string `json:"emoji"`
	} `json:"reaction"`
	Referral *struct {
		SourceURL  string `json:"source_url"`
		Headline   string `json:"headline"`
		SourceType string `json:"source_type"`
		SourceID   string `json:"source_id"`
	} `json:"referral"`
}

// When returns the message time (now if missing).
func (m Message) When() time.Time {
	if n, err := strconv.ParseInt(m.Timestamp, 10, 64); err == nil && n > 0 {
		return time.Unix(n, 0)
	}
	return time.Now()
}

// Content returns the message kind, readable text and any media to download.
func (m Message) Content() (kind, body string, media *Media) {
	kind = m.Type
	switch {
	case m.Text != nil:
		return "text", m.Text.Body, nil
	case m.Image != nil:
		return "image", m.Image.Caption, m.Image
	case m.Document != nil:
		return "document", orDefault(m.Document.Caption, m.Document.Filename), m.Document
	case m.Audio != nil:
		return "audio", "", m.Audio
	case m.Video != nil:
		return "video", m.Video.Caption, m.Video
	case m.Sticker != nil:
		return "sticker", "", m.Sticker
	case m.Button != nil:
		return "button", m.Button.Text, nil
	case m.Interactive != nil && m.Interactive.ButtonReply != nil:
		return "interactive", m.Interactive.ButtonReply.Title, nil
	case m.Interactive != nil && m.Interactive.ListReply != nil:
		return "interactive", m.Interactive.ListReply.Title, nil
	case m.Location != nil:
		l := m.Location
		return "location", strings.TrimSpace(fmt.Sprintf("%s %s https://maps.google.com/?q=%f,%f", l.Name, l.Address, l.Latitude, l.Longitude)), nil
	case m.Reaction != nil:
		return "reaction", m.Reaction.Emoji, nil
	}
	if kind == "" {
		kind = "unsupported"
	}
	return kind, "", nil
}

type Contact struct {
	WaID    string `json:"wa_id"`
	Profile struct {
		Name string `json:"name"`
	} `json:"profile"`
}

type Status struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	RecipientID string `json:"recipient_id"`
	Errors      []struct {
		Code    int    `json:"code"`
		Title   string `json:"title"`
		Message string `json:"message"`
	} `json:"errors"`
}

// ErrorText returns a readable failure reason.
func (s Status) ErrorText() string {
	if len(s.Errors) == 0 {
		return ""
	}
	e := s.Errors[0]
	return strings.TrimSpace(fmt.Sprintf("%s %s (%d)", e.Title, e.Message, e.Code))
}

// MessagesValue is the value of a "messages" change.
type MessagesValue struct {
	Metadata struct {
		PhoneNumberID string `json:"phone_number_id"`
	} `json:"metadata"`
	Contacts []Contact `json:"contacts"`
	Messages []Message `json:"messages"`
	Statuses []Status  `json:"statuses"`
}

// ProfileName returns the WhatsApp profile name sent with a message.
func (v MessagesValue) ProfileName(waID string) string {
	for _, c := range v.Contacts {
		if c.WaID == waID {
			return c.Profile.Name
		}
	}
	return ""
}

// LeadgenValue is the value of a Page "leadgen" change (a lead-ad form was submitted).
type LeadgenValue struct {
	LeadgenID string `json:"leadgen_id"`
	FormID    string `json:"form_id"`
	AdID      string `json:"ad_id"`
	PageID    string `json:"page_id"`
}

// Parse decodes a webhook body.
func Parse(body []byte) (Payload, error) {
	var p Payload
	err := json.Unmarshal(body, &p)
	return p, err
}
