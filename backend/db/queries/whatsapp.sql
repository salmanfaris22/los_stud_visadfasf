-- ───────────── Contacts ─────────────

-- name: UpsertWAContact :one
INSERT INTO wa_contacts (wa_id, profile_name, lead_id, student_id)
VALUES (@wa_id, @profile_name, sqlc.narg('lead_id'), sqlc.narg('student_id'))
ON CONFLICT (wa_id) DO UPDATE
SET profile_name = CASE WHEN EXCLUDED.profile_name <> '' THEN EXCLUDED.profile_name ELSE wa_contacts.profile_name END,
    lead_id = COALESCE(wa_contacts.lead_id, EXCLUDED.lead_id),
    student_id = COALESCE(wa_contacts.student_id, EXCLUDED.student_id)
RETURNING *;

-- name: GetWAContact :one
SELECT * FROM wa_contacts WHERE id = $1;

-- name: GetWAContactByLead :one
SELECT * FROM wa_contacts WHERE lead_id = $1 ORDER BY created_at LIMIT 1;

-- name: SetWAContactLead :exec
UPDATE wa_contacts SET lead_id = @lead_id WHERE id = @id;

-- name: TouchWAContactInbound :exec
UPDATE wa_contacts SET last_inbound_at = @at, last_message_at = @at, unread = unread + 1 WHERE id = @id;

-- name: TouchWAContactOutbound :exec
UPDATE wa_contacts SET last_message_at = now() WHERE id = $1;

-- name: ClearWAUnread :exec
UPDATE wa_contacts SET unread = 0 WHERE id = $1;

-- name: ListWAContacts :many
SELECT ct.*, l.name AS lead_name, l.owner_id, o.name AS owner_name, st.name AS student_name,
       COALESCE(lm.body, '')::text AS last_body, COALESCE(lm.kind, '')::text AS last_kind,
       COALESCE(lm.direction, '')::text AS last_direction,
       count(*) OVER () AS total_count
FROM wa_contacts ct
LEFT JOIN leads l ON l.id = ct.lead_id
LEFT JOIN users o ON o.id = l.owner_id
LEFT JOIN users st ON st.id = ct.student_id
LEFT JOIN LATERAL (SELECT m.body, m.kind, m.direction FROM wa_messages m
                    WHERE m.contact_id = ct.id ORDER BY m.created_at DESC LIMIT 1) lm ON true
WHERE ct.last_message_at IS NOT NULL
  AND (sqlc.narg('id')::uuid IS NULL OR ct.id = sqlc.narg('id'))
  AND (NOT @unread_only::boolean OR ct.unread > 0)
  AND (sqlc.narg('q')::text IS NULL OR ct.wa_id LIKE '%' || sqlc.narg('q') || '%' OR ct.profile_name ILIKE '%' || sqlc.narg('q') || '%'
       OR l.name ILIKE '%' || sqlc.narg('q') || '%' OR st.name ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR l.owner_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR l.team_id = sqlc.narg('scope_team')
       OR l.owner_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY ct.last_message_at DESC
LIMIT @lim::int OFFSET @off::int;

-- ───────────── Messages ─────────────

-- name: InsertWAMessage :one
INSERT INTO wa_messages (contact_id, direction, wa_message_id, kind, body, media_id, media_mime, media_name, template_name, status, sent_by, created_at)
VALUES (@contact_id, @direction, sqlc.narg('wa_message_id'), @kind, @body, @media_id, @media_mime, @media_name, @template_name, @status,
        sqlc.narg('sent_by'), COALESCE(sqlc.narg('created_at')::timestamptz, now()))
ON CONFLICT (wa_message_id) DO NOTHING
RETURNING *;

-- name: GetWAMessage :one
SELECT * FROM wa_messages WHERE id = $1;

-- name: SetWAMessageSent :exec
UPDATE wa_messages SET wa_message_id = @wa_message_id, status = 'sent' WHERE id = @id;

-- name: SetWAMessageFailed :exec
UPDATE wa_messages SET status = 'failed', error = @error WHERE id = @id;

-- name: SetWAMessageMediaKey :exec
UPDATE wa_messages SET media_key = @media_key WHERE id = @id;

-- name: UpdateWAMessageStatus :one
-- Delivery receipts only move forward (sent → delivered → read); failures always win.
UPDATE wa_messages
SET status = @status::text, error = CASE WHEN @error::text <> '' THEN @error::text ELSE error END
WHERE wa_message_id = @wa_message_id
  AND (@status::text = 'failed'
       OR (CASE status WHEN 'queued' THEN 0 WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 9 END)
          < (CASE @status::text WHEN 'sent' THEN 1 WHEN 'delivered' THEN 2 WHEN 'read' THEN 3 ELSE 0 END))
RETURNING contact_id;

-- name: ListWAMessages :many
SELECT m.*, u.name AS sent_by_name
FROM wa_messages m LEFT JOIN users u ON u.id = m.sent_by
WHERE m.contact_id = @contact_id
  AND (sqlc.narg('before')::timestamptz IS NULL OR m.created_at < sqlc.narg('before'))
ORDER BY m.created_at DESC
LIMIT @lim::int;

-- name: CountInboundMessages :one
SELECT count(*)::int FROM wa_messages WHERE contact_id = $1 AND direction = 'in';

-- ───────────── Templates & quick replies ─────────────

-- name: UpsertWATemplate :exec
INSERT INTO wa_templates (name, language, category, status, body, variables, synced_at)
VALUES (@name, @language, @category, @status, @body, @variables, now())
ON CONFLICT (name, language) DO UPDATE
SET category = EXCLUDED.category, status = EXCLUDED.status, body = EXCLUDED.body, variables = EXCLUDED.variables, synced_at = now();

-- name: DeleteStaleWATemplates :exec
DELETE FROM wa_templates WHERE synced_at < @before;

-- name: ListWATemplates :many
SELECT * FROM wa_templates ORDER BY name, language;

-- name: GetWATemplate :one
SELECT * FROM wa_templates WHERE name = @name AND language = @language;

-- name: ListWAQuickReplies :many
SELECT * FROM wa_quick_replies ORDER BY shortcut;

-- name: CreateWAQuickReply :one
INSERT INTO wa_quick_replies (shortcut, body) VALUES (@shortcut, @body) RETURNING *;

-- name: DeleteWAQuickReply :exec
DELETE FROM wa_quick_replies WHERE id = $1;

-- ───────────── Broadcasts ─────────────

-- name: CreateWABroadcast :one
INSERT INTO wa_broadcasts (name, template_name, language, variables, audience, created_by)
VALUES (@name, @template_name, @language, @variables, @audience, sqlc.narg('created_by'))
RETURNING *;

-- name: AddWABroadcastRecipients :exec
INSERT INTO wa_broadcast_recipients (broadcast_id, wa_id, name)
SELECT @broadcast_id::uuid, unnest(@wa_ids::text[]), unnest(@names::text[])
ON CONFLICT DO NOTHING;

-- name: SetWABroadcastTotal :exec
UPDATE wa_broadcasts SET total = (SELECT count(*) FROM wa_broadcast_recipients r WHERE r.broadcast_id = wa_broadcasts.id)
WHERE id = $1;

-- name: ListWABroadcasts :many
SELECT b.*, u.name AS created_by_name, count(*) OVER () AS total_count
FROM wa_broadcasts b LEFT JOIN users u ON u.id = b.created_by
ORDER BY b.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: GetWABroadcast :one
SELECT * FROM wa_broadcasts WHERE id = $1;

-- name: NextWABroadcast :one
SELECT * FROM wa_broadcasts WHERE status IN ('queued', 'sending') ORDER BY created_at LIMIT 1;

-- name: QueuedWARecipients :many
SELECT * FROM wa_broadcast_recipients WHERE broadcast_id = @broadcast_id AND status = 'queued' ORDER BY wa_id LIMIT @lim::int;

-- name: MarkWARecipient :exec
UPDATE wa_broadcast_recipients SET status = @status, error = @error WHERE broadcast_id = @broadcast_id AND wa_id = @wa_id;

-- name: RefreshWABroadcast :one
UPDATE wa_broadcasts b
SET sent = (SELECT count(*) FROM wa_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'sent'),
    failed = (SELECT count(*) FROM wa_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'failed'),
    status = CASE WHEN EXISTS (SELECT 1 FROM wa_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'queued')
                  THEN 'sending' ELSE 'done' END,
    finished_at = CASE WHEN EXISTS (SELECT 1 FROM wa_broadcast_recipients r WHERE r.broadcast_id = b.id AND r.status = 'queued')
                       THEN NULL ELSE now() END
WHERE b.id = $1
RETURNING *;

-- name: BroadcastLeadAudience :many
SELECT DISTINCT ON (l.phone_norm) l.phone_norm, l.name
FROM leads l
WHERE l.phone_norm <> ''
  AND (cardinality(@stage_ids::uuid[]) = 0 OR l.stage_id = ANY(@stage_ids::uuid[]))
  AND (cardinality(@sources::text[]) = 0 OR l.source = ANY(@sources::text[]))
  AND (cardinality(@course_ids::uuid[]) = 0 OR l.course_id = ANY(@course_ids::uuid[]))
ORDER BY l.phone_norm, l.created_at DESC;

-- name: BroadcastStudentAudience :many
SELECT u.name, COALESCE(u.phone, '')::text AS phone
FROM users u
WHERE u.kind = 'student' AND u.status = 'active' AND COALESCE(u.phone, '') <> ''
  AND (cardinality(@course_ids::uuid[]) = 0 OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.course_id = ANY(@course_ids::uuid[])))
  AND (cardinality(@batch_ids::uuid[]) = 0 OR EXISTS (SELECT 1 FROM enrollments e WHERE e.student_id = u.id AND e.batch_id = ANY(@batch_ids::uuid[])));

-- name: FindStudentByPhone :one
SELECT * FROM users WHERE kind = 'student' AND regexp_replace(COALESCE(phone, ''), '[^0-9]', '', 'g') IN (@full_number::text, @local_number::text) LIMIT 1;
