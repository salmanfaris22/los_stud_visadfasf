package service

import (
	"fmt"
	"strings"
	"time"

	"github.com/lms/backend/internal/apperr"
)

// Money is kept in paise (int64) and rates in basis points (1800 = 18%). No floats are used
// for amounts, so totals always add up exactly.

// roundDiv divides and rounds half away from zero (b must be > 0).
func roundDiv(a, b int64) int64 {
	if a >= 0 {
		return (a + b/2) / b
	}
	return -((-a + b/2) / b)
}

// gstIncluded returns the GST inside a GST-inclusive amount: amount × rate / (100% + rate).
func gstIncluded(amount int64, bp int32) int64 {
	if bp <= 0 {
		return 0
	}
	return roundDiv(amount*int64(bp), 10000+int64(bp))
}

// percentOf returns base × bp / 10000, rounded (used for commissions).
func percentOf(base int64, bp int32) int64 { return roundDiv(base*int64(bp), 10000) }

type feeLine struct {
	FeePaise int64
	GSTBP    int32
}

type feeSplit struct {
	Gross, Discount, Net, Taxable, GST int64
	LineNet                            []int64
}

// splitFees spreads the discount over the lines in proportion to their fee (largest remainder,
// so the shares add up exactly) and extracts the GST included in each line's net amount.
func splitFees(lines []feeLine, discount int64) (feeSplit, error) {
	var out feeSplit
	for _, l := range lines {
		if l.FeePaise < 0 {
			return out, apperr.Invalid("fees cannot be negative")
		}
		out.Gross += l.FeePaise
	}
	if discount < 0 || discount > out.Gross {
		return out, apperr.Invalid("discount must be between ₹0 and the total fee (%s)", rupees(out.Gross))
	}
	out.Discount, out.Net = discount, out.Gross-discount
	shares := make([]int64, len(lines))
	if out.Gross > 0 && discount > 0 {
		var given int64
		rem := make([]int64, len(lines))
		for i, l := range lines {
			shares[i] = discount * l.FeePaise / out.Gross
			rem[i] = discount * l.FeePaise % out.Gross
			given += shares[i]
		}
		for left := discount - given; left > 0; left-- { // hand out the leftover paise, biggest remainder first
			best := -1
			for i := range rem {
				if best < 0 || rem[i] > rem[best] {
					best = i
				}
			}
			shares[best]++
			rem[best] = -1
		}
	}
	out.LineNet = make([]int64, len(lines))
	for i, l := range lines {
		out.LineNet[i] = l.FeePaise - shares[i]
		out.GST += gstIncluded(out.LineNet[i], l.GSTBP)
	}
	out.Taxable = out.Net - out.GST
	return out, nil
}

type plannedInstallment struct {
	Due    time.Time
	Amount int64
}

// addMonths moves a date by n months, clamping to the month's last day (31 Jan + 1 = 28/29 Feb).
func addMonths(t time.Time, n int) time.Time {
	y, m, d := t.Date()
	first := time.Date(y, m+time.Month(n), 1, 0, 0, 0, 0, time.UTC)
	last := first.AddDate(0, 1, -1).Day()
	if d > last {
		d = last
	}
	return time.Date(first.Year(), first.Month(), d, 0, 0, 0, 0, time.UTC)
}

// planInstallments splits net into count equal parts (the first absorbs the remainder).
func planInstallments(net int64, count int, first time.Time, intervalMonths int) []plannedInstallment {
	if count < 1 {
		count = 1
	}
	if intervalMonths < 1 {
		intervalMonths = 1
	}
	if net <= 0 {
		return nil
	}
	if int64(count) > net {
		count = int(net)
	}
	part := net / int64(count)
	out := make([]plannedInstallment, count)
	for i := range out {
		out[i] = plannedInstallment{Due: addMonths(first, i*intervalMonths), Amount: part}
	}
	out[0].Amount += net - part*int64(count)
	return out
}

type installmentState struct {
	Paid   int64
	Status string // paid | partial | due | overdue | upcoming
}

// allocatePaid fills installments oldest first with the money paid so far and labels each one.
// "due" means unpaid and due within 7 days.
func allocatePaid(amounts []int64, dues []time.Time, paid int64, today time.Time) []installmentState {
	out := make([]installmentState, len(amounts))
	left := paid
	for i, amt := range amounts {
		p := min(max(left, 0), amt)
		left -= p
		st := "upcoming"
		switch {
		case p >= amt:
			st = "paid"
		case dues[i].Before(today):
			st = "overdue"
		case p > 0:
			st = "partial"
		case !dues[i].After(today.AddDate(0, 0, 7)):
			st = "due"
		}
		out[i] = installmentState{Paid: p, Status: st}
	}
	return out
}

// slabRate returns the rate unlocked by an admissions count (0 when no slab is reached).
func slabRate(slabs []slabDef, admissions int32) int32 {
	var bp int32
	var best int32 = -1
	for _, s := range slabs {
		if admissions >= s.MinAdmissions && s.MinAdmissions > best {
			best, bp = s.MinAdmissions, s.BP
		}
	}
	return bp
}

type slabDef struct {
	MinAdmissions int32 `json:"min_admissions"`
	BP            int32 `json:"bp"`
}

type commissionLine struct {
	Kind string // earned | reversal
	Base int64
	BP   int32
}

// slabTopUp is the extra commission owed when a slab raises the month's rate: every earned
// line paid below the slab rate is topped up to it (reversals take it back). Per-deal rates
// above the slab are never reduced.
func slabTopUp(lines []commissionLine, slabBP int32) int64 {
	var total int64
	for _, l := range lines {
		if slabBP <= l.BP {
			continue
		}
		v := percentOf(l.Base, slabBP-l.BP)
		if l.Kind == "reversal" {
			v = -v
		}
		total += v
	}
	return total
}

// rupees formats paise as ₹1,23,456.78 (Indian digit grouping).
func rupees(p int64) string {
	neg := p < 0
	if neg {
		p = -p
	}
	whole, frac := p/100, p%100
	s := fmt.Sprint(whole)
	if len(s) > 3 {
		head, tail := s[:len(s)-3], s[len(s)-3:]
		var parts []string
		for len(head) > 2 {
			parts = append([]string{head[len(head)-2:]}, parts...)
			head = head[:len(head)-2]
		}
		if head != "" {
			parts = append([]string{head}, parts...)
		}
		s = strings.Join(parts, ",") + "," + tail
	}
	out := "₹" + s
	if frac != 0 {
		out += fmt.Sprintf(".%02d", frac)
	}
	if neg {
		out = "-" + out
	}
	return out
}

var (
	ones = []string{"", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
		"Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"}
	tens = []string{"", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"}
)

func words99(n int64) string {
	if n < 20 {
		return ones[n]
	}
	return strings.TrimSpace(tens[n/10] + " " + ones[n%10])
}

func words999(n int64) string {
	if n >= 100 {
		return strings.TrimSpace(ones[n/100] + " Hundred " + words99(n%100))
	}
	return words99(n)
}

// amountInWords spells paise the Indian way: "Rupees One Lakh Twenty Thousand and Fifty Paise Only".
func amountInWords(p int64) string {
	if p < 0 {
		p = -p
	}
	r, ps := p/100, p%100
	var parts []string
	for _, u := range []struct {
		div  int64
		name string
	}{{10000000, "Crore"}, {100000, "Lakh"}, {1000, "Thousand"}} {
		if r >= u.div {
			q := r / u.div
			if q >= 1000 { // more than 999 crore: spell the crore count recursively
				parts = append(parts, strings.TrimSuffix(strings.TrimPrefix(amountInWords(q*100), "Rupees "), " Only")+" "+u.name)
			} else {
				parts = append(parts, words999(q)+" "+u.name)
			}
			r %= u.div
		}
	}
	if r > 0 {
		parts = append(parts, words999(r))
	}
	out := "Rupees " + strings.Join(parts, " ")
	if len(parts) == 0 {
		out = "Rupees Zero"
	}
	if ps > 0 {
		out += " and " + words99(ps) + " Paise"
	}
	return out + " Only"
}

// parseDay reads "YYYY-MM-DD"; empty returns def.
func parseDay(s string, def time.Time) (time.Time, error) {
	if strings.TrimSpace(s) == "" {
		return def, nil
	}
	t, err := time.Parse("2006-01-02", s)
	if err != nil {
		return t, apperr.Invalid("dates must look like 2026-01-31")
	}
	return t, nil
}

// parseMonth reads "YYYY-MM" into the first day of that month (UTC).
func parseMonth(s string) (time.Time, error) {
	t, err := time.Parse("2006-01", strings.TrimSpace(s))
	if err != nil {
		return t, apperr.Invalid("month must look like 2026-01")
	}
	return t, nil
}

func ymd(t time.Time) string { return t.Format("2006-01-02") }

func ymdPtr(t *time.Time) string {
	if t == nil {
		return ""
	}
	return ymd(*t)
}
