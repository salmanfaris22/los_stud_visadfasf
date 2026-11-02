package whatsapp

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSignature(t *testing.T) {
	body := []byte(`{"object":"whatsapp_business_account"}`)
	sig := Sign("s3cret", body)
	if !VerifySignature("s3cret", body, sig) {
		t.Fatal("valid signature rejected")
	}
	if VerifySignature("other", body, sig) {
		t.Fatal("wrong secret accepted")
	}
	if VerifySignature("s3cret", append(body, ' '), sig) {
		t.Fatal("tampered body accepted")
	}
	if VerifySignature("", body, sig) || VerifySignature("s3cret", body, "") || VerifySignature("s3cret", body, "sha256=zz") {
		t.Fatal("bad inputs accepted")
	}
}

const sample = `{"object":"whatsapp_business_account","entry":[{"id":"1","changes":[{"field":"messages","value":{
 "metadata":{"phone_number_id":"PN1"},
 "contacts":[{"profile":{"name":"Asha"},"wa_id":"919876543210"}],
 "messages":[
  {"from":"919876543210","id":"wamid.1","timestamp":"1761700000","type":"text","text":{"body":"Hi, fee for Python?"}},
  {"from":"919876543210","id":"wamid.2","timestamp":"1761700001","type":"image","image":{"id":"M1","mime_type":"image/jpeg","caption":"paid"}},
  {"from":"919876543210","id":"wamid.3","timestamp":"1761700002","type":"interactive","interactive":{"type":"button_reply","button_reply":{"id":"b1","title":"Call me"}}}
 ],
 "statuses":[{"id":"wamid.out","status":"failed","recipient_id":"91","errors":[{"code":131047,"title":"Re-engagement message"}]}]
}}]}]}`

func TestParseWebhook(t *testing.T) {
	p, err := Parse([]byte(sample))
	if err != nil {
		t.Fatal(err)
	}
	var v MessagesValue
	if err := json.Unmarshal(p.Entry[0].Changes[0].Value, &v); err != nil {
		t.Fatal(err)
	}
	if v.ProfileName("919876543210") != "Asha" || len(v.Messages) != 3 {
		t.Fatalf("parsed %+v", v)
	}
	kinds := []string{"text", "image", "interactive"}
	bodies := []string{"Hi, fee for Python?", "paid", "Call me"}
	for i, m := range v.Messages {
		k, b, media := m.Content()
		if k != kinds[i] || b != bodies[i] {
			t.Errorf("message %d = %s %q", i, k, b)
		}
		if (k == "image") != (media != nil) {
			t.Errorf("message %d media %v", i, media)
		}
	}
	if v.Messages[0].When().Unix() != 1761700000 {
		t.Error("timestamp")
	}
	if !strings.Contains(v.Statuses[0].ErrorText(), "131047") {
		t.Errorf("status error %q", v.Statuses[0].ErrorText())
	}
}

func TestClientSendAndErrors(t *testing.T) {
	var got map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer TOKEN" {
			w.WriteHeader(401)
			return
		}
		raw, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(raw, &got)
		if got["to"] == "closed" {
			w.WriteHeader(400)
			_, _ = w.Write([]byte(`{"error":{"code":131047,"message":"Re-engagement message"}}`))
			return
		}
		_, _ = w.Write([]byte(`{"messages":[{"id":"wamid.X"}]}`))
	}))
	defer srv.Close()
	c := New(srv.URL)
	cr := Creds{Token: "TOKEN", PhoneNumberID: "PN1"}
	id, err := c.SendTemplate(context.Background(), cr, "9198", "fee_reminder", "en", []string{"Asha", "₹5,000"})
	if err != nil || id != "wamid.X" {
		t.Fatalf("send template: %v %s", err, id)
	}
	tpl := got["template"].(map[string]any)
	if tpl["name"] != "fee_reminder" || len(tpl["components"].([]any)) != 1 {
		t.Fatalf("template payload %+v", got)
	}
	if _, err := c.SendText(context.Background(), cr, "closed", "hi"); !IsWindowClosed(err) {
		t.Fatalf("want window closed, got %v", err)
	}
	if _, err := c.SendText(context.Background(), Creds{Token: "bad", PhoneNumberID: "PN1"}, "9198", "hi"); err == nil {
		t.Fatal("bad token accepted")
	}
}
