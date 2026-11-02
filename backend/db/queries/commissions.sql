-- name: CreateCommissionEntry :one
INSERT INTO commission_entries (counsellor_id, admission_id, payment_id, refund_id, kind, base_paise, bp, amount_paise, month, note)
VALUES (@counsellor_id, sqlc.narg('admission_id'), sqlc.narg('payment_id'), sqlc.narg('refund_id'), @kind, @base_paise, @bp,
        @amount_paise, @month, @note)
RETURNING *;

-- name: ListCommissionEntries :many
SELECT e.*, u.name AS counsellor_name, a.admission_no, COALESCE(p.receipt_no, '')::text AS receipt_no,
       count(*) OVER () AS total_count
FROM commission_entries e
JOIN users u ON u.id = e.counsellor_id
LEFT JOIN admissions a ON a.id = e.admission_id
LEFT JOIN payments p ON p.id = e.payment_id
WHERE (sqlc.narg('counsellor_id')::uuid IS NULL OR e.counsellor_id = sqlc.narg('counsellor_id'))
  AND (sqlc.narg('month')::date IS NULL OR e.month = sqlc.narg('month'))
  AND (NOT @unpaid_only::boolean OR e.payout_id IS NULL)
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR e.counsellor_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR e.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY e.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: CommissionSummary :many
-- One row per counsellor for a month, plus their all-time unpaid balance.
SELECT u.id AS counsellor_id, u.name AS counsellor_name, COALESCE(cp.commission_bp, 0)::int AS commission_bp,
       (SELECT count(*) FROM admissions a WHERE a.counsellor_id = u.id AND a.status IN ('active', 'completed')
           AND a.approved_at >= @month_start::timestamptz AND a.approved_at < @month_end::timestamptz)::int AS admissions,
       (SELECT COALESCE(sum(p.amount_paise), 0) FROM payments p JOIN admissions a ON a.id = p.admission_id
         WHERE a.counsellor_id = u.id AND p.status IN ('approved', 'void')
           AND p.approved_at >= @month_start::timestamptz AND p.approved_at < @month_end::timestamptz)::bigint AS collected_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e WHERE e.counsellor_id = u.id AND e.month = @month::date AND e.kind = 'earned')::bigint AS earned_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e WHERE e.counsellor_id = u.id AND e.month = @month::date AND e.kind = 'reversal')::bigint AS reversed_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e WHERE e.counsellor_id = u.id AND e.month = @month::date AND e.kind IN ('slab_adjust', 'bonus', 'manual'))::bigint AS adjustments_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e WHERE e.counsellor_id = u.id AND e.month = @month::date)::bigint AS total_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e WHERE e.counsellor_id = u.id AND e.payout_id IS NULL)::bigint AS unpaid_paise,
       (SELECT COALESCE(sum(po.amount_paise), 0) FROM commission_payouts po WHERE po.counsellor_id = u.id AND po.month = @month::date)::bigint AS paid_paise
FROM users u
JOIN counsellor_profiles cp ON cp.user_id = u.id
WHERE u.kind = 'staff'
  AND (sqlc.narg('counsellor_id')::uuid IS NULL OR u.id = sqlc.narg('counsellor_id'))
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR u.id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR cp.team_id = sqlc.narg('scope_team'))
ORDER BY u.name;

-- name: EntriesForSlab :many
SELECT kind, base_paise, bp FROM commission_entries
WHERE counsellor_id = @counsellor_id AND month = @month AND kind IN ('earned', 'reversal');

-- name: SumEntriesOfKind :one
SELECT COALESCE(sum(amount_paise), 0)::bigint FROM commission_entries
WHERE counsellor_id = @counsellor_id AND month = @month AND kind = @kind;

-- name: CountApprovedAdmissions :one
SELECT count(*)::int FROM admissions
WHERE counsellor_id = @counsellor_id AND status IN ('active', 'completed')
  AND approved_at >= @month_start::timestamptz AND approved_at < @month_end::timestamptz;

-- name: CollectedInMonth :one
SELECT COALESCE(sum(p.amount_paise), 0)::bigint FROM payments p JOIN admissions a ON a.id = p.admission_id
WHERE a.counsellor_id = @counsellor_id AND p.status = 'approved'
  AND p.approved_at >= @month_start::timestamptz AND p.approved_at < @month_end::timestamptz;

-- ───────────── Targets ─────────────

-- name: UpsertCommissionTarget :one
INSERT INTO commission_targets (counsellor_id, month, target_admissions, target_paise, slabs, bonus_min_admissions, bonus_paise)
VALUES (@counsellor_id, @month, @target_admissions, @target_paise, @slabs, @bonus_min_admissions, @bonus_paise)
ON CONFLICT (counsellor_id, month) DO UPDATE
SET target_admissions = EXCLUDED.target_admissions, target_paise = EXCLUDED.target_paise, slabs = EXCLUDED.slabs,
    bonus_min_admissions = EXCLUDED.bonus_min_admissions, bonus_paise = EXCLUDED.bonus_paise
RETURNING *;

-- name: GetCommissionTarget :one
SELECT * FROM commission_targets WHERE counsellor_id = @counsellor_id AND month = @month;

-- name: ListCommissionTargets :many
SELECT t.*, u.name AS counsellor_name FROM commission_targets t JOIN users u ON u.id = t.counsellor_id
WHERE t.month = @month
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR t.counsellor_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR t.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY u.name;

-- name: DeleteCommissionTarget :exec
DELETE FROM commission_targets WHERE id = $1;

-- name: CounsellorsWithActivity :many
-- Counsellors who have entries or a target in the month (slab settlement candidates).
SELECT DISTINCT e.counsellor_id FROM commission_entries e WHERE e.month = @month::date
UNION
SELECT t.counsellor_id FROM commission_targets t WHERE t.month = @month::date;

-- ───────────── Payouts ─────────────

-- name: CreateCommissionPayout :one
INSERT INTO commission_payouts (counsellor_id, month, amount_paise, paid_on, reference, note, created_by)
VALUES (@counsellor_id, @month, @amount_paise, @paid_on, @reference, @note, sqlc.narg('created_by'))
RETURNING *;

-- name: UnpaidCommissionUpTo :one
SELECT COALESCE(sum(amount_paise), 0)::bigint FROM commission_entries
WHERE counsellor_id = @counsellor_id AND payout_id IS NULL AND month <= @month;

-- name: LinkEntriesToPayout :exec
UPDATE commission_entries SET payout_id = @payout_id
WHERE counsellor_id = @counsellor_id AND payout_id IS NULL AND month <= @month;

-- name: ListCommissionPayouts :many
SELECT po.*, u.name AS counsellor_name, cb.name AS created_by_name, count(*) OVER () AS total_count
FROM commission_payouts po
JOIN users u ON u.id = po.counsellor_id
LEFT JOIN users cb ON cb.id = po.created_by
WHERE (sqlc.narg('counsellor_id')::uuid IS NULL OR po.counsellor_id = sqlc.narg('counsellor_id'))
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR po.counsellor_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR po.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY po.paid_on DESC, po.created_at DESC
LIMIT @lim::int OFFSET @off::int;
