-- name: CollectionsReport :many
SELECT date_trunc(@bucket::text, p.paid_on)::date AS period,
       count(*)::int AS payments,
       sum(p.amount_paise)::bigint AS total_paise,
       COALESCE(sum(p.amount_paise) FILTER (WHERE p.method = 'upi'), 0)::bigint AS upi_paise,
       COALESCE(sum(p.amount_paise) FILTER (WHERE p.method = 'cash'), 0)::bigint AS cash_paise,
       COALESCE(sum(p.amount_paise) FILTER (WHERE p.method = 'bank'), 0)::bigint AS bank_paise,
       COALESCE(sum(p.amount_paise) FILTER (WHERE p.method NOT IN ('upi', 'cash', 'bank')), 0)::bigint AS other_paise
FROM payments p
WHERE p.status = 'approved' AND p.paid_on >= @date_from::date AND p.paid_on <= @date_to::date
GROUP BY 1
ORDER BY 1;

-- name: RefundsTotal :one
SELECT COALESCE(sum(amount_paise), 0)::bigint FROM refunds WHERE refunded_on >= @date_from::date AND refunded_on <= @date_to::date;

-- name: PendingApprovalTotal :one
SELECT count(*)::int AS payments, COALESCE(sum(amount_paise), 0)::bigint AS total_paise FROM payments WHERE status = 'pending';

-- name: DuesReport :many
SELECT a.id, a.admission_no, a.status, u.name AS student_name, COALESCE(u.phone, '')::text AS student_phone,
       COALESCE(co.name, '')::text AS counsellor_name, a.net_paise,
       (b.paid_paise - b.refunded_paise)::bigint AS paid_paise,
       (a.net_paise - b.paid_paise + b.refunded_paise)::bigint AS balance_paise,
       GREATEST(0, COALESCE((SELECT sum(i.amount_paise) FROM installments i WHERE i.admission_id = a.id AND i.due_date < @today::date), 0)
                   - (b.paid_paise - b.refunded_paise))::bigint AS overdue_paise,
       COALESCE(nd.next_due_date::text, '')::text AS next_due_date
FROM admissions a
JOIN users u ON u.id = a.student_id
LEFT JOIN users co ON co.id = a.counsellor_id
JOIN admission_balances b ON b.admission_id = a.id
LEFT JOIN LATERAL (
    SELECT min(i.due_date) AS next_due_date FROM installments i
     WHERE i.admission_id = a.id
       AND (SELECT sum(i2.amount_paise) FROM installments i2 WHERE i2.admission_id = a.id AND i2.seq <= i.seq)
           > b.paid_paise - b.refunded_paise) nd ON true
WHERE a.status = 'active' AND a.net_paise > b.paid_paise - b.refunded_paise
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR a.counsellor_id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR a.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY nd.next_due_date NULLS LAST, a.created_at;

-- name: CounsellorPerformance :many
SELECT u.id AS counsellor_id, u.name AS counsellor_name,
       (SELECT count(*) FROM leads l WHERE l.owner_id = u.id AND l.assigned_at >= @since::timestamptz AND l.assigned_at < @until::timestamptz)::int AS leads_assigned,
       (SELECT count(*) FROM leads l WHERE l.owner_id = u.id AND l.first_contacted_at >= @since::timestamptz AND l.first_contacted_at < @until::timestamptz)::int AS leads_contacted,
       COALESCE((SELECT avg(extract(epoch FROM l.first_contacted_at - COALESCE(l.assigned_at, l.created_at)) / 60)
                   FROM leads l WHERE l.owner_id = u.id AND l.first_contacted_at >= @since::timestamptz AND l.first_contacted_at < @until::timestamptz
                    AND l.first_contacted_at >= COALESCE(l.assigned_at, l.created_at)), 0)::float8 AS avg_response_minutes,
       (SELECT count(*) FROM call_logs c WHERE c.user_id = u.id AND c.started_at >= @since::timestamptz AND c.started_at < @until::timestamptz)::int AS calls,
       (SELECT count(*) FROM admissions a WHERE a.counsellor_id = u.id AND a.status <> 'cancelled' AND a.created_at >= @since::timestamptz AND a.created_at < @until::timestamptz)::int AS admissions,
       (SELECT COALESCE(sum(a.net_paise), 0) FROM admissions a WHERE a.counsellor_id = u.id AND a.status <> 'cancelled' AND a.created_at >= @since::timestamptz AND a.created_at < @until::timestamptz)::bigint AS booked_paise,
       (SELECT COALESCE(sum(p.amount_paise), 0) FROM payments p JOIN admissions a ON a.id = p.admission_id
         WHERE a.counsellor_id = u.id AND p.status = 'approved' AND p.approved_at >= @since::timestamptz AND p.approved_at < @until::timestamptz)::bigint AS collected_paise,
       (SELECT COALESCE(sum(e.amount_paise), 0) FROM commission_entries e
         WHERE e.counsellor_id = u.id AND e.created_at >= @since::timestamptz AND e.created_at < @until::timestamptz)::bigint AS commission_paise
FROM users u
JOIN counsellor_profiles cp ON cp.user_id = u.id
WHERE u.kind = 'staff'
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR u.id = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR cp.team_id = sqlc.narg('scope_team'))
ORDER BY u.name;

-- name: FunnelByStage :many
SELECT s.id, s.name, s.color, s.kind, s.position, count(l.id)::int AS total
FROM lead_stages s
LEFT JOIN leads l ON l.stage_id = s.id AND l.created_at >= @since::timestamptz AND l.created_at < @until::timestamptz
GROUP BY s.id
ORDER BY s.position;

-- name: FunnelBySource :many
SELECT COALESCE(NULLIF(l.source, ''), 'unknown')::text AS source,
       count(*)::int AS total,
       count(*) FILTER (WHERE s.kind = 'won')::int AS converted,
       count(*) FILTER (WHERE s.kind = 'lost')::int AS lost
FROM leads l LEFT JOIN lead_stages s ON s.id = l.stage_id
WHERE l.created_at >= @since::timestamptz AND l.created_at < @until::timestamptz
GROUP BY 1
ORDER BY 2 DESC;

-- name: LostReasonsReport :many
SELECT COALESCE(NULLIF(l.lost_reason, ''), 'Not given')::text AS reason, count(*)::int AS total
FROM leads l JOIN lead_stages s ON s.id = l.stage_id
WHERE s.kind = 'lost' AND l.created_at >= @since::timestamptz AND l.created_at < @until::timestamptz
GROUP BY 1
ORDER BY 2 DESC;

-- name: GSTRegister :many
-- Every approved receipt in the range with its GST share (the admission's GST ratio applied to the amount).
SELECT p.id, COALESCE(p.receipt_no, '')::text AS receipt_no, p.paid_on, p.amount_paise, p.method,
       a.admission_no, u.name AS student_name,
       COALESCE(round(p.amount_paise::numeric * a.gst_paise / NULLIF(a.net_paise, 0)), 0)::bigint AS gst_paise
FROM payments p
JOIN admissions a ON a.id = p.admission_id
JOIN users u ON u.id = p.student_id
WHERE p.status = 'approved' AND p.paid_on >= @date_from::date AND p.paid_on <= @date_to::date
ORDER BY p.paid_on, p.receipt_no;
