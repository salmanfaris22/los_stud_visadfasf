-- Sales & accounts: teams, CRM (stages, activities, follow-ups, assignment), WhatsApp,
-- admissions with GST-inclusive fees, installments, payments, refunds and commissions.

-- ───────────── Sales scope & teams ─────────────
-- Learning data keeps using roles.scoped (mentor = assigned courses). Sales data uses sales_scope.
ALTER TABLE roles ADD COLUMN sales_scope text NOT NULL DEFAULT 'all' CHECK (sales_scope IN ('all', 'team', 'own'));

CREATE TABLE teams (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE counsellor_profiles (
    user_id          uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    team_id          uuid REFERENCES teams (id) ON DELETE SET NULL,
    commission_bp    int NOT NULL DEFAULT 0 CHECK (commission_bp BETWEEN 0 AND 10000), -- basis points: 850 = 8.5%
    accepts_leads    boolean NOT NULL DEFAULT true,  -- part of automatic distribution
    available        boolean NOT NULL DEFAULT false, -- "Available" toggle in the phone app
    max_open_leads   int NOT NULL DEFAULT 0,         -- 0 = no limit
    last_assigned_at timestamptz,
    last_seen_at     timestamptz,
    updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX counsellor_profiles_team_idx ON counsellor_profiles (team_id);

-- ───────────── CRM ─────────────
CREATE TABLE lead_stages (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL UNIQUE,
    color      text NOT NULL DEFAULT '#6366f1',
    position   int NOT NULL DEFAULT 0,
    kind       text NOT NULL DEFAULT 'open' CHECK (kind IN ('open', 'won', 'lost')),
    is_default boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO lead_stages (name, color, position, kind, is_default) VALUES
    ('New', '#6366f1', 0, 'open', true),
    ('Contacted', '#0ea5e9', 1, 'open', false),
    ('Interested', '#22c55e', 2, 'open', false),
    ('Follow-up', '#f59e0b', 3, 'open', false),
    ('Converted', '#10b981', 4, 'won', false),
    ('Lost', '#ef4444', 5, 'lost', false);

CREATE TABLE lost_reasons (
    id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    label    text NOT NULL UNIQUE,
    position int NOT NULL DEFAULT 0
);
INSERT INTO lost_reasons (label, position) VALUES
    ('Fee too high', 0), ('Joined another institute', 1), ('Not reachable', 2), ('Timing not suitable', 3),
    ('Just enquiring', 4), ('Wrong number', 5);

ALTER TABLE leads
    ADD COLUMN phone_norm         text NOT NULL DEFAULT '',
    ADD COLUMN stage_id           uuid REFERENCES lead_stages (id) ON DELETE SET NULL,
    ADD COLUMN owner_id           uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN team_id            uuid REFERENCES teams (id) ON DELETE SET NULL,
    ADD COLUMN source_ref         text NOT NULL DEFAULT '',
    ADD COLUMN city               text NOT NULL DEFAULT '',
    ADD COLUMN assigned_at        timestamptz,
    ADD COLUMN sla_due_at         timestamptz,
    ADD COLUMN first_contacted_at timestamptz,
    ADD COLUMN last_activity_at   timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN next_follow_up_at  timestamptz,
    ADD COLUMN lost_reason        text NOT NULL DEFAULT '',
    ADD COLUMN student_id         uuid REFERENCES users (id) ON DELETE SET NULL,
    ADD COLUMN reassign_count     int NOT NULL DEFAULT 0,
    ADD COLUMN pullable           boolean NOT NULL DEFAULT true; -- unassigned leads counsellors may take with "Get next lead"

-- Existing leads: map old status to stages, keep notes as activities (below), then drop old columns.
UPDATE leads l SET stage_id = s.id
  FROM lead_stages s
 WHERE s.name = CASE l.status WHEN 'contacted' THEN 'Contacted' WHEN 'converted' THEN 'Converted' WHEN 'lost' THEN 'Lost' ELSE 'New' END;
UPDATE leads SET phone_norm = regexp_replace(phone, '[^0-9]', '', 'g');

CREATE INDEX leads_phone_norm_idx ON leads (phone_norm) WHERE phone_norm <> '';
CREATE INDEX leads_email_lower_idx ON leads (lower(email));
CREATE INDEX leads_owner_stage_idx ON leads (owner_id, stage_id);
CREATE INDEX leads_unassigned_idx ON leads (created_at) WHERE owner_id IS NULL;
CREATE INDEX leads_follow_up_idx ON leads (next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;
CREATE INDEX leads_sla_idx ON leads (sla_due_at) WHERE sla_due_at IS NOT NULL;

CREATE TABLE lead_activities (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    actor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    kind       text NOT NULL CHECK (kind IN ('created', 'enquiry', 'note', 'stage', 'assigned', 'call', 'whatsapp_in', 'whatsapp_out', 'follow_up', 'converted', 'payment', 'system')),
    body       text NOT NULL DEFAULT '',
    data       jsonb NOT NULL DEFAULT '{}',
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_activities_lead_idx ON lead_activities (lead_id, created_at DESC);

INSERT INTO lead_activities (lead_id, kind, body, created_at)
SELECT id, 'note', notes, updated_at FROM leads WHERE notes <> '';
ALTER TABLE leads DROP COLUMN status, DROP COLUMN notes;

CREATE TABLE lead_follow_ups (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id    uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    owner_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    due_at     timestamptz NOT NULL,
    note       text NOT NULL DEFAULT '',
    done_at    timestamptz,
    reminded   boolean NOT NULL DEFAULT false,
    created_by uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_follow_ups_due_idx ON lead_follow_ups (owner_id, due_at) WHERE done_at IS NULL;

CREATE TABLE call_logs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_id          uuid NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
    user_id          uuid REFERENCES users (id) ON DELETE SET NULL,
    phone            text NOT NULL DEFAULT '',
    direction        text NOT NULL DEFAULT 'outgoing' CHECK (direction IN ('outgoing', 'incoming', 'missed')),
    started_at       timestamptz NOT NULL DEFAULT now(),
    duration_seconds int NOT NULL DEFAULT 0,
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX call_logs_lead_idx ON call_logs (lead_id, started_at DESC);
CREATE INDEX call_logs_user_idx ON call_logs (user_id, started_at DESC);

CREATE TABLE assignment_rules (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    source     text NOT NULL DEFAULT '', -- '' = any source
    course_id  uuid REFERENCES courses (id) ON DELETE CASCADE,
    team_id    uuid REFERENCES teams (id) ON DELETE SET NULL, -- NULL = every counsellor
    strategy   text NOT NULL CHECK (strategy IN ('round_robin', 'least_busy', 'fifo', 'manual')),
    priority   int NOT NULL DEFAULT 0,
    active     boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO assignment_rules (name, strategy, priority) VALUES ('Default: round-robin', 'round_robin', 1000);

-- ───────────── WhatsApp (Meta Cloud API) ─────────────
CREATE TABLE wa_contacts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    wa_id           text NOT NULL UNIQUE, -- phone in international format, digits only
    profile_name    text NOT NULL DEFAULT '',
    lead_id         uuid REFERENCES leads (id) ON DELETE SET NULL,
    student_id      uuid REFERENCES users (id) ON DELETE SET NULL,
    last_inbound_at timestamptz, -- free-form replies allowed for 24 h after this
    last_message_at timestamptz,
    unread          int NOT NULL DEFAULT 0,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_contacts_recent_idx ON wa_contacts (last_message_at DESC NULLS LAST);
CREATE INDEX wa_contacts_lead_idx ON wa_contacts (lead_id);

CREATE TABLE wa_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id      uuid NOT NULL REFERENCES wa_contacts (id) ON DELETE CASCADE,
    direction       text NOT NULL CHECK (direction IN ('in', 'out')),
    wa_message_id   text UNIQUE,
    kind            text NOT NULL DEFAULT 'text',
    body            text NOT NULL DEFAULT '',
    media_id        text NOT NULL DEFAULT '', -- Meta media id
    media_key       text NOT NULL DEFAULT '', -- copy in our storage
    media_mime      text NOT NULL DEFAULT '',
    media_name      text NOT NULL DEFAULT '',
    template_name   text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'received' CHECK (status IN ('received', 'queued', 'sent', 'delivered', 'read', 'failed')),
    error           text NOT NULL DEFAULT '',
    sent_by         uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wa_messages_contact_idx ON wa_messages (contact_id, created_at);

CREATE TABLE wa_templates (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    language   text NOT NULL DEFAULT 'en',
    category   text NOT NULL DEFAULT '',
    status     text NOT NULL DEFAULT '',
    body       text NOT NULL DEFAULT '',
    variables  int NOT NULL DEFAULT 0,
    synced_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, language)
);

CREATE TABLE wa_quick_replies (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    shortcut   text NOT NULL UNIQUE,
    body       text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE wa_broadcasts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name          text NOT NULL,
    template_name text NOT NULL,
    language      text NOT NULL DEFAULT 'en',
    variables     jsonb NOT NULL DEFAULT '[]',
    audience      jsonb NOT NULL DEFAULT '{}',
    status        text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sending', 'done', 'failed')),
    total         int NOT NULL DEFAULT 0,
    sent          int NOT NULL DEFAULT 0,
    failed        int NOT NULL DEFAULT 0,
    created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now(),
    finished_at   timestamptz
);

CREATE TABLE wa_broadcast_recipients (
    broadcast_id uuid NOT NULL REFERENCES wa_broadcasts (id) ON DELETE CASCADE,
    wa_id        text NOT NULL,
    name         text NOT NULL DEFAULT '',
    status       text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'sent', 'failed')),
    error        text NOT NULL DEFAULT '',
    PRIMARY KEY (broadcast_id, wa_id)
);

-- ───────────── Accounts ─────────────
-- Money is stored in paise (bigint) and percentages in basis points (1800 = 18%).
ALTER TABLE courses
    ADD COLUMN fee_paise bigint NOT NULL DEFAULT 0 CHECK (fee_paise >= 0), -- GST included
    ADD COLUMN gst_bp    int NOT NULL DEFAULT 1800 CHECK (gst_bp BETWEEN 0 AND 10000);

CREATE SEQUENCE admission_no_seq START 1001;
CREATE SEQUENCE receipt_no_seq START 1;

CREATE TABLE admissions (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_no    text NOT NULL UNIQUE,
    student_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    lead_id         uuid REFERENCES leads (id) ON DELETE SET NULL,
    counsellor_id   uuid REFERENCES users (id) ON DELETE SET NULL,
    status          text NOT NULL DEFAULT 'pending_approval' CHECK (status IN ('pending_approval', 'active', 'completed', 'cancelled')),
    gross_paise     bigint NOT NULL DEFAULT 0, -- sum of course fees (GST included)
    discount_paise  bigint NOT NULL DEFAULT 0,
    net_paise       bigint NOT NULL DEFAULT 0, -- agreed fee, GST included
    taxable_paise   bigint NOT NULL DEFAULT 0,
    gst_paise       bigint NOT NULL DEFAULT 0,
    commission_bp   int NOT NULL DEFAULT 0 CHECK (commission_bp BETWEEN 0 AND 10000),
    notes           text NOT NULL DEFAULT '',
    created_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    approved_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    approved_at     timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    CHECK (discount_paise >= 0 AND net_paise >= 0)
);
CREATE INDEX admissions_student_idx ON admissions (student_id);
CREATE INDEX admissions_counsellor_idx ON admissions (counsellor_id, created_at DESC);
CREATE INDEX admissions_status_idx ON admissions (status, created_at DESC);
ALTER TABLE leads ADD COLUMN admission_id uuid REFERENCES admissions (id) ON DELETE SET NULL;

CREATE TABLE admission_courses (
    admission_id uuid NOT NULL REFERENCES admissions (id) ON DELETE CASCADE,
    course_id    uuid NOT NULL REFERENCES courses (id) ON DELETE RESTRICT,
    batch_id     uuid REFERENCES batches (id) ON DELETE SET NULL,
    fee_paise    bigint NOT NULL DEFAULT 0,
    gst_bp       int NOT NULL DEFAULT 1800,
    PRIMARY KEY (admission_id, course_id)
);

CREATE TABLE installments (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id uuid NOT NULL REFERENCES admissions (id) ON DELETE CASCADE,
    seq          int NOT NULL,
    due_date     date NOT NULL,
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    reminded_at  timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (admission_id, seq)
);
CREATE INDEX installments_due_idx ON installments (due_date);

CREATE TABLE payments (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    receipt_no       text UNIQUE, -- assigned when approved
    admission_id     uuid NOT NULL REFERENCES admissions (id) ON DELETE CASCADE,
    student_id       uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    amount_paise     bigint NOT NULL CHECK (amount_paise > 0),
    method           text NOT NULL DEFAULT 'upi' CHECK (method IN ('upi', 'cash', 'bank', 'card', 'cheque', 'other')),
    reference        text NOT NULL DEFAULT '',
    paid_on          date NOT NULL DEFAULT current_date,
    proof_upload_id  uuid REFERENCES uploads (id) ON DELETE SET NULL,
    status           text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'void')),
    source           text NOT NULL DEFAULT 'admin' CHECK (source IN ('admin', 'app', 'student')),
    submitted_by     uuid REFERENCES users (id) ON DELETE SET NULL,
    approved_by      uuid REFERENCES users (id) ON DELETE SET NULL,
    approved_at      timestamptz,
    rejection_reason text NOT NULL DEFAULT '',
    note             text NOT NULL DEFAULT '',
    created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_admission_idx ON payments (admission_id);
CREATE INDEX payments_status_idx ON payments (status, created_at DESC);
CREATE INDEX payments_approved_idx ON payments (approved_at) WHERE status = 'approved';

CREATE TABLE refunds (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    admission_id uuid NOT NULL REFERENCES admissions (id) ON DELETE CASCADE,
    amount_paise bigint NOT NULL CHECK (amount_paise > 0),
    reason       text NOT NULL DEFAULT '',
    method       text NOT NULL DEFAULT 'bank',
    reference    text NOT NULL DEFAULT '',
    refunded_on  date NOT NULL DEFAULT current_date,
    created_by   uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- ───────────── Commissions ─────────────
CREATE TABLE commission_payouts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    counsellor_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month         date NOT NULL,
    amount_paise  bigint NOT NULL,
    paid_on       date NOT NULL DEFAULT current_date,
    reference     text NOT NULL DEFAULT '',
    note          text NOT NULL DEFAULT '',
    created_by    uuid REFERENCES users (id) ON DELETE SET NULL,
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE commission_entries (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    counsellor_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    admission_id  uuid REFERENCES admissions (id) ON DELETE CASCADE,
    payment_id    uuid REFERENCES payments (id) ON DELETE SET NULL,
    refund_id     uuid REFERENCES refunds (id) ON DELETE SET NULL,
    kind          text NOT NULL CHECK (kind IN ('earned', 'reversal', 'slab_adjust', 'bonus', 'manual')),
    base_paise    bigint NOT NULL DEFAULT 0,
    bp            int NOT NULL DEFAULT 0,
    amount_paise  bigint NOT NULL,
    month         date NOT NULL,
    payout_id     uuid REFERENCES commission_payouts (id) ON DELETE SET NULL,
    note          text NOT NULL DEFAULT '',
    created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX commission_entries_counsellor_idx ON commission_entries (counsellor_id, month);
CREATE UNIQUE INDEX commission_entries_payment_uidx ON commission_entries (payment_id) WHERE kind = 'earned';

CREATE TABLE commission_targets (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    counsellor_id        uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    month                date NOT NULL,
    target_admissions    int NOT NULL DEFAULT 0,
    target_paise         bigint NOT NULL DEFAULT 0,
    slabs                jsonb NOT NULL DEFAULT '[]', -- [{"min_admissions": 10, "bp": 1000}]
    bonus_min_admissions int NOT NULL DEFAULT 0,
    bonus_paise          bigint NOT NULL DEFAULT 0,
    UNIQUE (counsellor_id, month)
);

-- Money helpers: approved payments and refunds per admission.
CREATE VIEW admission_balances AS
SELECT a.id AS admission_id,
       a.net_paise,
       COALESCE((SELECT sum(p.amount_paise) FROM payments p WHERE p.admission_id = a.id AND p.status = 'approved'), 0)::bigint AS paid_paise,
       COALESCE((SELECT sum(p.amount_paise) FROM payments p WHERE p.admission_id = a.id AND p.status = 'pending'), 0)::bigint AS pending_paise,
       COALESCE((SELECT sum(r.amount_paise) FROM refunds r WHERE r.admission_id = a.id), 0)::bigint AS refunded_paise
  FROM admissions a;
