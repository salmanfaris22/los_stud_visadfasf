DROP VIEW IF EXISTS admission_balances;
DROP TABLE IF EXISTS commission_targets, commission_entries, commission_payouts, refunds, payments, installments, admission_courses CASCADE;
ALTER TABLE leads DROP COLUMN IF EXISTS admission_id;
DROP TABLE IF EXISTS admissions CASCADE;
DROP SEQUENCE IF EXISTS receipt_no_seq;
DROP SEQUENCE IF EXISTS admission_no_seq;
ALTER TABLE courses DROP COLUMN IF EXISTS fee_paise, DROP COLUMN IF EXISTS gst_bp;
DROP TABLE IF EXISTS wa_broadcast_recipients, wa_broadcasts, wa_quick_replies, wa_templates, wa_messages, wa_contacts CASCADE;
DROP TABLE IF EXISTS assignment_rules, call_logs, lead_follow_ups CASCADE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'lost'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
UPDATE leads l SET status = CASE s.kind WHEN 'won' THEN 'converted' WHEN 'lost' THEN 'lost' ELSE CASE WHEN s.name = 'New' THEN 'new' ELSE 'contacted' END END
  FROM lead_stages s WHERE s.id = l.stage_id;
DROP TABLE IF EXISTS lead_activities CASCADE;
DROP INDEX IF EXISTS leads_email_lower_idx;
ALTER TABLE leads
    DROP COLUMN IF EXISTS phone_norm, DROP COLUMN IF EXISTS stage_id, DROP COLUMN IF EXISTS owner_id, DROP COLUMN IF EXISTS team_id,
    DROP COLUMN IF EXISTS source_ref, DROP COLUMN IF EXISTS city, DROP COLUMN IF EXISTS assigned_at, DROP COLUMN IF EXISTS sla_due_at,
    DROP COLUMN IF EXISTS first_contacted_at, DROP COLUMN IF EXISTS last_activity_at, DROP COLUMN IF EXISTS next_follow_up_at,
    DROP COLUMN IF EXISTS lost_reason, DROP COLUMN IF EXISTS student_id, DROP COLUMN IF EXISTS reassign_count;
DROP TABLE IF EXISTS lost_reasons, lead_stages, counsellor_profiles, teams CASCADE;
ALTER TABLE roles DROP COLUMN IF EXISTS sales_scope;
