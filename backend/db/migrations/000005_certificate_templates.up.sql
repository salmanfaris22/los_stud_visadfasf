-- Certificate templates: a background design plus positioned fields (student name, course, year, QR...).
-- Field positions are millimetres from the top-left of an A4 landscape page (297 x 210).

CREATE TABLE certificate_templates (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name           text NOT NULL,
    background_url text NOT NULL DEFAULT '',
    fields         jsonb NOT NULL DEFAULT '[]',
    is_default     boolean NOT NULL DEFAULT false,
    created_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
-- At most one default template.
CREATE UNIQUE INDEX certificate_templates_default_idx ON certificate_templates (is_default) WHERE is_default;

ALTER TABLE courses
    ADD COLUMN certificate_enabled     boolean NOT NULL DEFAULT true,
    ADD COLUMN certificate_template_id uuid REFERENCES certificate_templates (id) ON DELETE SET NULL,
    ADD COLUMN certificate_text        text NOT NULL DEFAULT '';

-- The template a certificate was issued with (kept when the course later switches template).
ALTER TABLE certificates ADD COLUMN template_id uuid REFERENCES certificate_templates (id) ON DELETE SET NULL;

-- Built-in template: the MS Ai School navy & gold design (art is embedded in the API binary).
INSERT INTO certificate_templates (name, background_url, is_default, fields) VALUES (
  'MS Ai School – Navy & Gold',
  '/api/v1/certificate-art/ms-navy-gold.jpg',
  true,
  '[
    {"id": "name", "kind": "text", "label": "Student name", "text": "{student}", "x": 18.92, "y": 98.59, "w": 157.4, "font": "script", "size": 64.4, "color": "#e3c06c", "align": "left", "line_height": 1.2, "fit": true},
    {"id": "description", "kind": "text", "label": "Description", "text": "For successfully completing the **{course}** course at MS AI School. {course_text}", "x": 19.32, "y": 133.69, "w": 159.36, "font": "sans", "size": 11.18, "color": "#eef1f8", "align": "left", "line_height": 1.717},
    {"id": "seal_year", "kind": "text", "label": "Seal year", "text": "{year}", "x": 248.32, "y": 24.11, "w": 23.9, "font": "sans-bold", "size": 22.02, "color": "#e8c56c", "align": "center", "line_height": 1.2, "fit": true},
    {"id": "ribbon", "kind": "text", "label": "Ribbon", "text": "COMPLETED – {year}", "x": 19.32, "y": 184.55, "w": 63.74, "font": "sans-bold", "size": 11.58, "color": "#0d1e53", "align": "left", "spacing": 0.5, "line_height": 1.2, "uppercase": true, "fit": true},
    {"id": "signature", "kind": "image", "label": "Signature", "src": "/api/v1/certificate-art/ms-signature.png", "x": 215.13, "y": 158.36, "w": 55.78},
    {"id": "signer_name", "kind": "text", "label": "Signer name", "text": "ASNAD", "x": 213.35, "y": 183.07, "w": 60.75, "font": "sans-semibold", "size": 10.73, "color": "#ffffff", "align": "center", "spacing": 0.72, "line_height": 1.2, "uppercase": true},
    {"id": "signer_role", "kind": "text", "label": "Signer role", "text": "Founder & CEO, MS AI School", "x": 213.35, "y": 188.68, "w": 60.75, "font": "sans", "size": 9.03, "color": "#e6ebf5", "align": "center", "spacing": 0.22, "line_height": 1.2},
    {"id": "qr", "kind": "qr", "label": "QR code", "x": 93.62, "y": 179.68, "w": 14.94, "color": "#0d1e53"},
    {"id": "id_label", "kind": "text", "label": "ID label", "text": "CERTIFICATE ID", "x": 111.55, "y": 182.37, "w": 51.79, "font": "sans-semibold", "size": 5.65, "color": "#e3c06c", "align": "left", "spacing": 0.4, "line_height": 1.2, "uppercase": true},
    {"id": "code", "kind": "text", "label": "Certificate ID", "text": "{code}", "x": 111.55, "y": 185.89, "w": 51.79, "font": "sans-semibold", "size": 9.03, "color": "#ffffff", "align": "left", "spacing": 0.2, "line_height": 1.2},
    {"id": "verify_hint", "kind": "text", "label": "Verify hint", "text": "Scan the QR code to verify", "x": 111.55, "y": 191.02, "w": 51.79, "font": "sans", "size": 5.93, "color": "#aab6d3", "align": "left", "line_height": 1.2}
  ]'::jsonb
);
