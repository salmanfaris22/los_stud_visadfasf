-- ───────────── Teams & counsellor (sales) profiles ─────────────

-- name: ListTeams :many
SELECT t.*, (SELECT count(*) FROM counsellor_profiles cp WHERE cp.team_id = t.id)::int AS member_count
FROM teams t
ORDER BY t.name;

-- name: CreateTeam :one
INSERT INTO teams (name) VALUES (@name) RETURNING *;

-- name: UpdateTeam :one
UPDATE teams SET name = @name WHERE id = @id RETURNING *;

-- name: DeleteTeam :exec
DELETE FROM teams WHERE id = $1;

-- name: GetCounsellorProfile :one
SELECT * FROM counsellor_profiles WHERE user_id = $1;

-- name: UpsertCounsellorProfile :one
INSERT INTO counsellor_profiles (user_id, team_id, commission_bp, accepts_leads, max_open_leads)
VALUES (@user_id, sqlc.narg('team_id'), @commission_bp, @accepts_leads, @max_open_leads)
ON CONFLICT (user_id) DO UPDATE
SET team_id = EXCLUDED.team_id, commission_bp = EXCLUDED.commission_bp, accepts_leads = EXCLUDED.accepts_leads,
    max_open_leads = EXCLUDED.max_open_leads, updated_at = now()
RETURNING *;

-- name: SetAvailability :one
INSERT INTO counsellor_profiles (user_id, accepts_leads, available, last_seen_at)
VALUES (@user_id, false, @available, now())
ON CONFLICT (user_id) DO UPDATE SET available = EXCLUDED.available, last_seen_at = now(), updated_at = now()
RETURNING *;

-- name: TouchCounsellorSeen :exec
UPDATE counsellor_profiles SET last_seen_at = now() WHERE user_id = $1;

-- name: ListCounsellors :many
-- Staff who can work leads (leads:edit through a role) or already have a sales profile.
SELECT u.id, u.name, u.email, u.phone, u.avatar_url, u.status,
       cp.team_id, t.name AS team_name,
       COALESCE(cp.commission_bp, 0)::int AS commission_bp,
       COALESCE(cp.accepts_leads, false)::boolean AS accepts_leads,
       COALESCE(cp.available, false)::boolean AS available,
       COALESCE(cp.max_open_leads, 0)::int AS max_open_leads,
       cp.last_assigned_at, cp.last_seen_at,
       (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
         WHERE l.owner_id = u.id AND s.kind = 'open')::int AS open_leads
FROM users u
LEFT JOIN counsellor_profiles cp ON cp.user_id = u.id
LEFT JOIN teams t ON t.id = cp.team_id
WHERE u.kind = 'staff'
  AND (cp.user_id IS NOT NULL OR EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
         WHERE ur.user_id = u.id AND rp.module = 'leads' AND rp.action = 'edit'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR cp.team_id = sqlc.narg('team_id'))
ORDER BY u.name;

-- name: UserSalesScope :one
-- Broadest sales scope over the user's roles (all > team > own) and their team.
SELECT (CASE (SELECT min(CASE r.sales_scope WHEN 'all' THEN 0 WHEN 'team' THEN 1 ELSE 2 END)
                FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = @user_id)
            WHEN 0 THEN 'all' WHEN 1 THEN 'team' ELSE 'own' END)::text AS scope,
       (SELECT cp.team_id FROM counsellor_profiles cp WHERE cp.user_id = @user_id) AS team_id;

-- name: UsersWithPermission :many
-- Active staff holding module:action (super admins included), used to route notifications.
SELECT u.id FROM users u
WHERE u.kind = 'staff' AND u.status = 'active'
  AND (u.is_super_admin OR EXISTS (
        SELECT 1 FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id
         WHERE ur.user_id = u.id AND rp.module = @module AND rp.action = @action));

-- name: TeamManagers :many
-- Team-scoped staff of a team (sales managers), for escalations.
SELECT DISTINCT u.id FROM users u
JOIN counsellor_profiles cp ON cp.user_id = u.id
JOIN user_roles ur ON ur.user_id = u.id
JOIN roles r ON r.id = ur.role_id
WHERE cp.team_id = @team_id AND r.sales_scope = 'team' AND u.status = 'active';

-- ───────────── Assignment ─────────────

-- name: MatchAssignmentRule :one
SELECT * FROM assignment_rules
WHERE active
  AND (source = '' OR source = @source)
  AND (course_id IS NULL OR course_id = sqlc.narg('course_id'))
ORDER BY priority, created_at
LIMIT 1;

-- name: PickCounsellor :one
-- Next counsellor for automatic assignment. Round-robin = oldest last assignment first;
-- least-busy = fewest open leads first. The row lock spreads parallel assignments.
SELECT cp.user_id
FROM counsellor_profiles cp
JOIN users u ON u.id = cp.user_id
WHERE cp.accepts_leads AND u.status = 'active'
  AND (NOT @require_available::boolean OR cp.available)
  AND (sqlc.narg('team_id')::uuid IS NULL OR cp.team_id = sqlc.narg('team_id'))
  AND (sqlc.narg('exclude_id')::uuid IS NULL OR cp.user_id <> sqlc.narg('exclude_id'))
  AND (cp.max_open_leads = 0 OR (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
                                  WHERE l.owner_id = cp.user_id AND s.kind = 'open') < cp.max_open_leads)
ORDER BY (CASE WHEN @least_busy::boolean
               THEN (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
                      WHERE l.owner_id = cp.user_id AND s.kind = 'open')
               ELSE 0 END),
         cp.last_assigned_at NULLS FIRST, cp.user_id
LIMIT 1
FOR UPDATE OF cp SKIP LOCKED;

-- name: TouchAssigned :exec
UPDATE counsellor_profiles SET last_assigned_at = now() WHERE user_id = $1;

-- name: AssignLead :one
UPDATE leads
SET owner_id = sqlc.narg('owner_id'), team_id = sqlc.narg('team_id'),
    assigned_at = CASE WHEN sqlc.narg('owner_id')::uuid IS NULL THEN NULL ELSE now() END,
    sla_due_at = sqlc.narg('sla_due_at'), pullable = @pullable,
    reassign_count = reassign_count + @reassign_inc::int, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: TakeNextLead :one
-- FIFO pull: the oldest unassigned lead this counsellor may take.
UPDATE leads
SET owner_id = @owner_id, assigned_at = now(), sla_due_at = sqlc.narg('sla_due_at'), updated_at = now()
WHERE id = (SELECT l.id FROM leads l JOIN lead_stages s ON s.id = l.stage_id
             WHERE l.owner_id IS NULL AND l.pullable AND s.kind = 'open'
               AND (l.team_id IS NULL OR l.team_id = sqlc.narg('team_id'))
             ORDER BY l.created_at
             LIMIT 1
             FOR UPDATE OF l SKIP LOCKED)
RETURNING *;

-- name: MoveFollowUpsToOwner :exec
UPDATE lead_follow_ups SET owner_id = sqlc.narg('owner_id') WHERE lead_id = @lead_id AND done_at IS NULL;

-- name: OverdueSLALeads :many
SELECT l.* FROM leads l JOIN lead_stages s ON s.id = l.stage_id
WHERE l.sla_due_at < now() AND l.first_contacted_at IS NULL AND l.owner_id IS NOT NULL AND s.kind = 'open'
ORDER BY l.sla_due_at
LIMIT 100;

-- name: PoolLeads :many
-- Unassigned open leads from the last week, retried by the assignment job.
SELECT l.* FROM leads l JOIN lead_stages s ON s.id = l.stage_id
WHERE l.owner_id IS NULL AND l.pullable AND s.kind = 'open' AND l.created_at > now() - interval '7 days'
ORDER BY l.created_at
LIMIT 50;

-- ───────────── Leads ─────────────

-- name: CreateLead :one
INSERT INTO leads (name, email, phone, phone_norm, course_id, message, source, source_ref, city, stage_id)
VALUES (@name, @email, @phone, @phone_norm, sqlc.narg('course_id'), @message, @source, @source_ref, @city, sqlc.narg('stage_id'))
RETURNING *;

-- name: FindDuplicateLead :one
SELECT * FROM leads
WHERE (@phone_norm::text <> '' AND phone_norm = @phone_norm::text)
   OR (@email::text <> '' AND lower(email) = lower(@email::text))
ORDER BY created_at DESC
LIMIT 1;

-- name: GetLead :one
SELECT * FROM leads WHERE id = $1;

-- name: ListLeads :many
SELECT l.*, c.title AS course_title, s.name AS stage_name, s.color AS stage_color, s.kind AS stage_kind,
       o.name AS owner_name, t.name AS team_name, count(*) OVER () AS total_count
FROM leads l
LEFT JOIN courses c ON c.id = l.course_id
LEFT JOIN lead_stages s ON s.id = l.stage_id
LEFT JOIN users o ON o.id = l.owner_id
LEFT JOIN teams t ON t.id = l.team_id
WHERE (sqlc.narg('id')::uuid IS NULL OR l.id = sqlc.narg('id'))
  AND (sqlc.narg('stage_id')::uuid IS NULL OR l.stage_id = sqlc.narg('stage_id'))
  AND (sqlc.narg('stage_kind')::text IS NULL OR s.kind = sqlc.narg('stage_kind'))
  AND (sqlc.narg('owner_id')::uuid IS NULL OR l.owner_id = sqlc.narg('owner_id'))
  AND (NOT @unassigned::boolean OR l.owner_id IS NULL)
  AND (sqlc.narg('source')::text IS NULL OR l.source = sqlc.narg('source'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR l.course_id = sqlc.narg('course_id'))
  AND (sqlc.narg('team_id')::uuid IS NULL OR l.team_id = sqlc.narg('team_id'))
  AND (sqlc.narg('follow_up_before')::timestamptz IS NULL OR l.next_follow_up_at < sqlc.narg('follow_up_before'))
  AND (sqlc.narg('created_from')::timestamptz IS NULL OR l.created_at >= sqlc.narg('created_from'))
  AND (sqlc.narg('created_to')::timestamptz IS NULL OR l.created_at < sqlc.narg('created_to'))
  AND (sqlc.narg('q')::text IS NULL OR l.name ILIKE '%' || sqlc.narg('q') || '%' OR l.email ILIKE '%' || sqlc.narg('q') || '%'
       OR l.phone ILIKE '%' || sqlc.narg('q') || '%' OR l.phone_norm LIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR l.owner_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR l.team_id = sqlc.narg('scope_team')
       OR l.owner_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY (CASE WHEN @sort::text = 'follow_up' THEN l.next_follow_up_at END) ASC NULLS LAST,
         (CASE WHEN @sort::text = 'activity' THEN l.last_activity_at END) DESC NULLS LAST,
         l.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: LeadStageCounts :many
SELECT l.stage_id, count(*)::int AS total
FROM leads l
WHERE (sqlc.narg('scope_owner')::uuid IS NULL OR l.owner_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR l.team_id = sqlc.narg('scope_team')
       OR l.owner_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
GROUP BY l.stage_id;

-- name: LeadSources :many
SELECT DISTINCT source FROM leads WHERE source <> '' ORDER BY source;

-- name: UpdateLeadFields :one
UPDATE leads
SET name = @name, email = @email, phone = @phone, phone_norm = @phone_norm, course_id = sqlc.narg('course_id'),
    city = @city, source = @source, message = @message, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: SetLeadStage :one
UPDATE leads
SET stage_id = @stage_id, lost_reason = @lost_reason, updated_at = now(), last_activity_at = now(),
    first_contacted_at = CASE WHEN @contacted::boolean THEN COALESCE(first_contacted_at, now()) ELSE first_contacted_at END,
    sla_due_at = CASE WHEN @contacted::boolean THEN NULL ELSE sla_due_at END
WHERE id = @id
RETURNING *;

-- name: MarkLeadContacted :exec
UPDATE leads SET first_contacted_at = COALESCE(first_contacted_at, now()), sla_due_at = NULL, last_activity_at = now()
WHERE id = $1;

-- name: TouchLead :exec
UPDATE leads SET last_activity_at = now() WHERE id = $1;

-- name: LinkLeadConversion :exec
UPDATE leads
SET stage_id = @stage_id, student_id = @student_id, admission_id = @admission_id, lost_reason = '', sla_due_at = NULL,
    first_contacted_at = COALESCE(first_contacted_at, now()), last_activity_at = now(), updated_at = now()
WHERE id = @id;

-- name: DeleteLead :exec
DELETE FROM leads WHERE id = $1;

-- name: ListLeadsForExport :many
SELECT l.name, l.email, l.phone, l.source, l.city, l.created_at, l.next_follow_up_at, l.lost_reason,
       COALESCE(c.title, '')::text AS course_title, COALESCE(s.name, '')::text AS stage_name, COALESCE(o.name, '')::text AS owner_name
FROM leads l
LEFT JOIN courses c ON c.id = l.course_id
LEFT JOIN lead_stages s ON s.id = l.stage_id
LEFT JOIN users o ON o.id = l.owner_id
WHERE (sqlc.narg('scope_owner')::uuid IS NULL OR l.owner_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR l.team_id = sqlc.narg('scope_team')
       OR l.owner_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY l.created_at DESC;

-- ───────────── Activities, follow-ups, calls ─────────────

-- name: AddLeadActivity :one
INSERT INTO lead_activities (lead_id, actor_id, kind, body, data)
VALUES (@lead_id, sqlc.narg('actor_id'), @kind, @body, @data)
RETURNING *;

-- name: ListLeadActivities :many
SELECT a.*, u.name AS actor_name
FROM lead_activities a LEFT JOIN users u ON u.id = a.actor_id
WHERE a.lead_id = $1
ORDER BY a.created_at DESC
LIMIT 300;

-- name: CreateFollowUp :one
INSERT INTO lead_follow_ups (lead_id, owner_id, due_at, note, created_by)
VALUES (@lead_id, sqlc.narg('owner_id'), @due_at, @note, sqlc.narg('created_by'))
RETURNING *;

-- name: GetFollowUp :one
SELECT * FROM lead_follow_ups WHERE id = $1;

-- name: ListLeadFollowUps :many
SELECT * FROM lead_follow_ups WHERE lead_id = $1 ORDER BY (done_at IS NOT NULL), due_at;

-- name: CompleteFollowUp :one
UPDATE lead_follow_ups SET done_at = now() WHERE id = $1 AND done_at IS NULL RETURNING *;

-- name: DeleteFollowUp :exec
DELETE FROM lead_follow_ups WHERE id = $1;

-- name: RefreshLeadFollowUp :exec
UPDATE leads
SET next_follow_up_at = (SELECT min(f.due_at) FROM lead_follow_ups f WHERE f.lead_id = @lead_id::uuid AND f.done_at IS NULL)
WHERE leads.id = @lead_id::uuid;

-- name: ListFollowUpsDue :many
SELECT f.*, l.name AS lead_name, l.phone AS lead_phone, COALESCE(s.name, '')::text AS stage_name
FROM lead_follow_ups f
JOIN leads l ON l.id = f.lead_id
LEFT JOIN lead_stages s ON s.id = l.stage_id
WHERE f.done_at IS NULL AND f.due_at < @before
  AND (sqlc.narg('owner_id')::uuid IS NULL OR f.owner_id = sqlc.narg('owner_id'))
ORDER BY f.due_at
LIMIT 300;

-- name: FollowUpsToRemind :many
SELECT f.id, f.owner_id, f.lead_id, f.due_at, f.note, l.name AS lead_name
FROM lead_follow_ups f JOIN leads l ON l.id = f.lead_id
WHERE f.done_at IS NULL AND NOT f.reminded AND f.due_at <= @until AND f.owner_id IS NOT NULL
ORDER BY f.due_at
LIMIT 300;

-- name: MarkFollowUpsReminded :exec
UPDATE lead_follow_ups SET reminded = true WHERE id = ANY(@ids::uuid[]);

-- name: CreateCallLog :one
INSERT INTO call_logs (lead_id, user_id, phone, direction, started_at, duration_seconds)
VALUES (@lead_id, sqlc.narg('user_id'), @phone, @direction, @started_at, @duration_seconds)
RETURNING *;

-- ───────────── Pipeline settings ─────────────

-- name: ListStages :many
SELECT s.*, (SELECT count(*) FROM leads l WHERE l.stage_id = s.id)::int AS lead_count
FROM lead_stages s
ORDER BY s.position, s.name;

-- name: GetStage :one
SELECT * FROM lead_stages WHERE id = $1;

-- name: DefaultStage :one
SELECT * FROM lead_stages WHERE kind = 'open' ORDER BY is_default DESC, position LIMIT 1;

-- name: FirstStageOfKind :one
SELECT * FROM lead_stages WHERE kind = @kind ORDER BY position LIMIT 1;

-- name: CreateStage :one
INSERT INTO lead_stages (name, color, kind, position)
VALUES (@name, @color, @kind, (SELECT COALESCE(max(position), -1) + 1 FROM lead_stages))
RETURNING *;

-- name: UpdateStage :one
UPDATE lead_stages SET name = @name, color = @color, kind = @kind WHERE id = @id RETURNING *;

-- name: SetDefaultStage :exec
UPDATE lead_stages SET is_default = (lead_stages.id = @stage_id::uuid);

-- name: SetStagePosition :exec
UPDATE lead_stages SET position = @position WHERE id = @id;

-- name: MoveLeadsToStage :exec
UPDATE leads SET stage_id = @to_id WHERE stage_id = @from_id;

-- name: DeleteStage :exec
DELETE FROM lead_stages WHERE id = $1;

-- name: CountStagesOfKind :one
SELECT count(*)::int FROM lead_stages WHERE kind = $1;

-- name: ListLostReasons :many
SELECT * FROM lost_reasons ORDER BY position, label;

-- name: CreateLostReason :one
INSERT INTO lost_reasons (label, position) VALUES (@label, (SELECT COALESCE(max(position), -1) + 1 FROM lost_reasons)) RETURNING *;

-- name: DeleteLostReason :exec
DELETE FROM lost_reasons WHERE id = $1;

-- name: ListAssignmentRules :many
SELECT r.*, c.title AS course_title, t.name AS team_name
FROM assignment_rules r
LEFT JOIN courses c ON c.id = r.course_id
LEFT JOIN teams t ON t.id = r.team_id
ORDER BY r.priority, r.created_at;

-- name: CreateAssignmentRule :one
INSERT INTO assignment_rules (name, source, course_id, team_id, strategy, priority, active)
VALUES (@name, @source, sqlc.narg('course_id'), sqlc.narg('team_id'), @strategy, @priority, @active)
RETURNING *;

-- name: UpdateAssignmentRule :one
UPDATE assignment_rules
SET name = @name, source = @source, course_id = sqlc.narg('course_id'), team_id = sqlc.narg('team_id'),
    strategy = @strategy, priority = @priority, active = @active
WHERE id = @id
RETURNING *;

-- name: DeleteAssignmentRule :exec
DELETE FROM assignment_rules WHERE id = $1;

-- ───────────── Dashboards ─────────────

-- name: MySalesCounts :one
SELECT
    (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
      WHERE l.owner_id = @user_id AND s.kind = 'open')::int AS open_leads,
    (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
      WHERE l.owner_id = @user_id AND s.kind = 'open' AND l.first_contacted_at IS NULL)::int AS untouched_leads,
    (SELECT count(*) FROM lead_follow_ups f
      WHERE f.owner_id = @user_id AND f.done_at IS NULL AND f.due_at < @day_end::timestamptz)::int AS follow_ups_today,
    (SELECT count(*) FROM lead_follow_ups f
      WHERE f.owner_id = @user_id AND f.done_at IS NULL AND f.due_at < now())::int AS follow_ups_overdue,
    (SELECT count(*) FROM leads l JOIN lead_stages s ON s.id = l.stage_id
      WHERE l.owner_id IS NULL AND l.pullable AND s.kind = 'open'
        AND (l.team_id IS NULL OR l.team_id = sqlc.narg('team_id')))::int AS pool_leads,
    (SELECT count(*) FROM admissions a
      WHERE a.counsellor_id = @user_id AND a.status <> 'cancelled' AND a.created_at >= @month_start::timestamptz)::int AS admissions_month,
    (SELECT COALESCE(sum(p.amount_paise), 0) FROM payments p JOIN admissions a ON a.id = p.admission_id
      WHERE a.counsellor_id = @user_id AND p.status = 'approved' AND p.approved_at >= @month_start::timestamptz)::bigint AS collected_month,
    (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e
      WHERE e.counsellor_id = @user_id AND e.month = @month::date)::bigint AS commission_month;
