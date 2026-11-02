-- ───────────── Admissions ─────────────

-- name: CreateAdmission :one
INSERT INTO admissions (admission_no, student_id, lead_id, counsellor_id, status, gross_paise, discount_paise, net_paise,
                        taxable_paise, gst_paise, commission_bp, notes, created_by, approved_by, approved_at)
VALUES (@prefix::text || nextval('admission_no_seq')::text, @student_id, sqlc.narg('lead_id'), sqlc.narg('counsellor_id'), @status,
        @gross_paise, @discount_paise, @net_paise, @taxable_paise, @gst_paise, @commission_bp, @notes, sqlc.narg('created_by'),
        sqlc.narg('approved_by'), CASE WHEN @status::text = 'active' THEN now() END)
RETURNING *;

-- name: AddAdmissionCourse :exec
INSERT INTO admission_courses (admission_id, course_id, batch_id, fee_paise, gst_bp)
VALUES (@admission_id, @course_id, sqlc.narg('batch_id'), @fee_paise, @gst_bp);

-- name: ListAdmissionCourses :many
SELECT ac.*, c.title AS course_title, b.name AS batch_name
FROM admission_courses ac
JOIN courses c ON c.id = ac.course_id
LEFT JOIN batches b ON b.id = ac.batch_id
WHERE ac.admission_id = $1
ORDER BY c.title;

-- name: CoursesForAdmissions :many
SELECT ac.admission_id, c.title
FROM admission_courses ac JOIN courses c ON c.id = ac.course_id
WHERE ac.admission_id = ANY(@ids::uuid[])
ORDER BY c.title;

-- name: GetAdmissionRow :one
SELECT a.*, u.name AS student_name, u.email AS student_email, COALESCE(u.phone, '')::text AS student_phone,
       COALESCE(u.student_code, '')::text AS student_code, co.name AS counsellor_name,
       b.paid_paise, b.pending_paise, b.refunded_paise
FROM admissions a
JOIN users u ON u.id = a.student_id
LEFT JOIN users co ON co.id = a.counsellor_id
JOIN admission_balances b ON b.admission_id = a.id
WHERE a.id = $1;

-- name: LockAdmission :one
SELECT * FROM admissions WHERE id = $1 FOR UPDATE;

-- name: ListAdmissions :many
SELECT a.*, u.name AS student_name, u.email AS student_email, COALESCE(u.phone, '')::text AS student_phone,
       COALESCE(u.student_code, '')::text AS student_code, co.name AS counsellor_name,
       b.paid_paise, b.pending_paise, b.refunded_paise,
       COALESCE(nd.next_due_date::text, '')::text AS next_due_date,
       count(*) OVER () AS total_count
FROM admissions a
JOIN users u ON u.id = a.student_id
LEFT JOIN users co ON co.id = a.counsellor_id
JOIN admission_balances b ON b.admission_id = a.id
LEFT JOIN LATERAL (
    SELECT min(i.due_date) AS next_due_date FROM installments i
     WHERE i.admission_id = a.id
       AND (SELECT sum(i2.amount_paise) FROM installments i2 WHERE i2.admission_id = a.id AND i2.seq <= i.seq)
           > b.paid_paise - b.refunded_paise) nd ON true
WHERE (sqlc.narg('status')::text IS NULL OR a.status = sqlc.narg('status'))
  AND (sqlc.narg('student_id')::uuid IS NULL OR a.student_id = sqlc.narg('student_id'))
  AND (sqlc.narg('counsellor_id')::uuid IS NULL OR a.counsellor_id = sqlc.narg('counsellor_id'))
  AND (sqlc.narg('course_id')::uuid IS NULL OR EXISTS (SELECT 1 FROM admission_courses ac WHERE ac.admission_id = a.id AND ac.course_id = sqlc.narg('course_id')))
  AND (NOT @with_balance::boolean OR a.net_paise > b.paid_paise - b.refunded_paise)
  AND (NOT @overdue::boolean OR (a.status = 'active' AND nd.next_due_date < @today::date))
  AND (sqlc.narg('from')::timestamptz IS NULL OR a.created_at >= sqlc.narg('from'))
  AND (sqlc.narg('to')::timestamptz IS NULL OR a.created_at < sqlc.narg('to'))
  AND (sqlc.narg('q')::text IS NULL OR a.admission_no ILIKE '%' || sqlc.narg('q') || '%' OR u.name ILIKE '%' || sqlc.narg('q') || '%'
       OR u.email ILIKE '%' || sqlc.narg('q') || '%' OR COALESCE(u.phone, '') ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR a.counsellor_id = sqlc.narg('scope_owner') OR a.created_by = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR a.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY a.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: AdmissionInScope :one
SELECT EXISTS (
    SELECT 1 FROM admissions a
    WHERE a.id = @id
      AND (sqlc.narg('scope_owner')::uuid IS NULL OR a.counsellor_id = sqlc.narg('scope_owner') OR a.created_by = sqlc.narg('scope_owner'))
      AND (sqlc.narg('scope_team')::uuid IS NULL OR a.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team'))))::boolean;

-- name: UpdateAdmissionTerms :one
UPDATE admissions
SET discount_paise = @discount_paise, net_paise = @net_paise, taxable_paise = @taxable_paise, gst_paise = @gst_paise,
    commission_bp = @commission_bp, counsellor_id = sqlc.narg('counsellor_id'), notes = @notes, updated_at = now()
WHERE id = @id
RETURNING *;

-- name: SetAdmissionStatus :one
UPDATE admissions
SET status = @status::text,
    approved_by = CASE WHEN @status::text = 'active' THEN COALESCE(approved_by, sqlc.narg('approved_by')) ELSE approved_by END,
    approved_at = CASE WHEN @status::text = 'active' THEN COALESCE(approved_at, now()) ELSE approved_at END,
    updated_at = now()
WHERE id = @id
RETURNING *;

-- name: StudentAdmissions :many
SELECT a.*, b.paid_paise, b.pending_paise, b.refunded_paise
FROM admissions a JOIN admission_balances b ON b.admission_id = a.id
WHERE a.student_id = $1 AND a.status <> 'cancelled'
ORDER BY a.created_at DESC;

-- ───────────── Installments ─────────────

-- name: AddInstallment :exec
INSERT INTO installments (admission_id, seq, due_date, amount_paise) VALUES (@admission_id, @seq, @due_date, @amount_paise);

-- name: ClearInstallments :exec
DELETE FROM installments WHERE admission_id = $1;

-- name: ListInstallments :many
SELECT * FROM installments WHERE admission_id = $1 ORDER BY seq;

-- name: InstallmentsToRemind :many
-- Unpaid installments due on or before @until whose last reminder is older than @remind_before.
SELECT i.id, i.admission_id, i.seq, i.due_date, i.amount_paise, i.reminded_at,
       a.admission_no, a.student_id, u.name AS student_name, u.email AS student_email, COALESCE(u.phone, '')::text AS student_phone,
       LEAST(i.amount_paise, x.cum - (b.paid_paise - b.refunded_paise))::bigint AS unpaid_paise
FROM installments i
JOIN admissions a ON a.id = i.admission_id AND a.status = 'active'
JOIN admission_balances b ON b.admission_id = a.id
JOIN users u ON u.id = a.student_id
JOIN LATERAL (SELECT sum(i2.amount_paise)::bigint AS cum FROM installments i2
               WHERE i2.admission_id = i.admission_id AND i2.seq <= i.seq) x ON true
WHERE x.cum > b.paid_paise - b.refunded_paise
  AND i.due_date <= @until::date
  AND (i.reminded_at IS NULL OR i.reminded_at < @remind_before::timestamptz)
ORDER BY i.due_date
LIMIT 500;

-- name: MarkInstallmentReminded :exec
UPDATE installments SET reminded_at = now() WHERE id = $1;

-- ───────────── Payments ─────────────

-- name: CreatePayment :one
INSERT INTO payments (admission_id, student_id, amount_paise, method, reference, paid_on, proof_upload_id, status, source, submitted_by, note)
VALUES (@admission_id, @student_id, @amount_paise, @method, @reference, @paid_on, sqlc.narg('proof_upload_id'), 'pending', @source,
        sqlc.narg('submitted_by'), @note)
RETURNING *;

-- name: LockPayment :one
SELECT * FROM payments WHERE id = $1 FOR UPDATE;

-- name: ApprovePayment :one
UPDATE payments
SET status = 'approved', approved_by = @approved_by, approved_at = now(), rejection_reason = '',
    receipt_no = @prefix::text || lpad(nextval('receipt_no_seq')::text, 6, '0')
WHERE id = @id AND status = 'pending'
RETURNING *;

-- name: RejectPayment :one
UPDATE payments SET status = 'rejected', approved_by = @approved_by, approved_at = now(), rejection_reason = @reason
WHERE id = @id AND status = 'pending'
RETURNING *;

-- name: VoidPayment :one
UPDATE payments SET status = 'void', rejection_reason = @reason WHERE id = @id AND status = 'approved' RETURNING *;

-- name: ListPayments :many
SELECT p.*, a.admission_no, a.counsellor_id, u.name AS student_name, COALESCE(u.phone, '')::text AS student_phone,
       sb.name AS submitted_by_name, ab.name AS approved_by_name, co.name AS counsellor_name,
       pu.mime AS proof_mime, count(*) OVER () AS total_count
FROM payments p
JOIN admissions a ON a.id = p.admission_id
JOIN users u ON u.id = p.student_id
LEFT JOIN users sb ON sb.id = p.submitted_by
LEFT JOIN users ab ON ab.id = p.approved_by
LEFT JOIN users co ON co.id = a.counsellor_id
LEFT JOIN uploads pu ON pu.id = p.proof_upload_id
WHERE (sqlc.narg('id')::uuid IS NULL OR p.id = sqlc.narg('id'))
  AND (sqlc.narg('admission_id')::uuid IS NULL OR p.admission_id = sqlc.narg('admission_id'))
  AND (sqlc.narg('status')::text IS NULL OR p.status = sqlc.narg('status'))
  AND (sqlc.narg('method')::text IS NULL OR p.method = sqlc.narg('method'))
  AND (sqlc.narg('source')::text IS NULL OR p.source = sqlc.narg('source'))
  AND (sqlc.narg('from')::date IS NULL OR p.paid_on >= sqlc.narg('from'))
  AND (sqlc.narg('to')::date IS NULL OR p.paid_on <= sqlc.narg('to'))
  AND (sqlc.narg('q')::text IS NULL OR a.admission_no ILIKE '%' || sqlc.narg('q') || '%' OR u.name ILIKE '%' || sqlc.narg('q') || '%'
       OR p.reference ILIKE '%' || sqlc.narg('q') || '%' OR COALESCE(p.receipt_no, '') ILIKE '%' || sqlc.narg('q') || '%')
  AND (sqlc.narg('scope_owner')::uuid IS NULL OR a.counsellor_id = sqlc.narg('scope_owner') OR a.created_by = sqlc.narg('scope_owner'))
  AND (sqlc.narg('scope_team')::uuid IS NULL OR a.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team')))
ORDER BY (p.status = 'pending') DESC, p.created_at DESC
LIMIT @lim::int OFFSET @off::int;

-- name: PaymentForReceipt :one
SELECT p.*, a.admission_no, a.net_paise, a.gst_paise AS admission_gst_paise, u.name AS student_name, u.email AS student_email,
       COALESCE(u.phone, '')::text AS student_phone, COALESCE(u.student_code, '')::text AS student_code
FROM payments p
JOIN admissions a ON a.id = p.admission_id
JOIN users u ON u.id = p.student_id
WHERE p.id = $1;

-- name: PaymentProofInScope :one
-- A payment proof may be opened by staff who can see payments in their sales scope.
SELECT EXISTS (
    SELECT 1 FROM payments p JOIN admissions a ON a.id = p.admission_id
    WHERE p.proof_upload_id = @upload_id
      AND (sqlc.narg('scope_owner')::uuid IS NULL OR a.counsellor_id = sqlc.narg('scope_owner') OR a.created_by = sqlc.narg('scope_owner'))
      AND (sqlc.narg('scope_team')::uuid IS NULL OR a.counsellor_id IN (SELECT cp.user_id FROM counsellor_profiles cp WHERE cp.team_id = sqlc.narg('scope_team'))))::boolean;

-- ───────────── Refunds ─────────────

-- name: CreateRefund :one
INSERT INTO refunds (admission_id, amount_paise, reason, method, reference, refunded_on, created_by)
VALUES (@admission_id, @amount_paise, @reason, @method, @reference, @refunded_on, sqlc.narg('created_by'))
RETURNING *;

-- name: ListRefunds :many
SELECT r.*, u.name AS created_by_name FROM refunds r LEFT JOIN users u ON u.id = r.created_by
WHERE r.admission_id = $1 ORDER BY r.refunded_on, r.created_at;

-- name: GetAdmissionBalance :one
SELECT * FROM admission_balances WHERE admission_id = $1;
