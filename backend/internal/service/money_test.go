package service

import (
	"testing"
	"time"
)

func TestGSTIncluded(t *testing.T) {
	cases := []struct {
		amount int64
		bp     int32
		want   int64
	}{
		{1180000, 1800, 180000}, // ₹11,800 incl. 18% → ₹1,800 GST
		{1000000, 1800, 152542}, // ₹10,000 incl. 18% → ₹1,525.42
		{100, 1800, 15},
		{500000, 0, 0},
		{1050000, 500, 50000}, // 5%
	}
	for _, c := range cases {
		if got := gstIncluded(c.amount, c.bp); got != c.want {
			t.Errorf("gstIncluded(%d, %d) = %d, want %d", c.amount, c.bp, got, c.want)
		}
	}
}

func TestSplitFeesAddsUp(t *testing.T) {
	lines := []feeLine{{FeePaise: 2999900, GSTBP: 1800}, {FeePaise: 1500000, GSTBP: 1800}, {FeePaise: 333333, GSTBP: 0}}
	s, err := splitFees(lines, 100001)
	if err != nil {
		t.Fatal(err)
	}
	if s.Gross != 4833233 || s.Net != 4733232 || s.Discount != 100001 {
		t.Fatalf("totals wrong: %+v", s)
	}
	var sum int64
	for _, n := range s.LineNet {
		sum += n
	}
	if sum != s.Net {
		t.Fatalf("line nets %v add up to %d, want %d", s.LineNet, sum, s.Net)
	}
	if s.Taxable+s.GST != s.Net {
		t.Fatalf("taxable %d + gst %d != net %d", s.Taxable, s.GST, s.Net)
	}
	if s.LineNet[2] > 333333 || s.LineNet[2] < 326000 {
		t.Fatalf("discount not proportional: %v", s.LineNet)
	}
}

func TestSplitFeesRejectsBadDiscount(t *testing.T) {
	if _, err := splitFees([]feeLine{{FeePaise: 1000, GSTBP: 1800}}, 1001); err == nil {
		t.Fatal("discount above total accepted")
	}
	if _, err := splitFees([]feeLine{{FeePaise: 1000, GSTBP: 1800}}, -1); err == nil {
		t.Fatal("negative discount accepted")
	}
	s, err := splitFees([]feeLine{{FeePaise: 1000, GSTBP: 1800}}, 1000)
	if err != nil || s.Net != 0 || s.GST != 0 {
		t.Fatalf("full discount: %+v %v", s, err)
	}
}

func d(s string) time.Time { t, _ := time.Parse("2006-01-02", s); return t }

func TestPlanInstallments(t *testing.T) {
	p := planInstallments(1000000, 3, d("2026-01-31"), 1)
	if len(p) != 3 {
		t.Fatalf("got %d installments", len(p))
	}
	if p[0].Amount != 333334 || p[1].Amount != 333333 || p[2].Amount != 333333 {
		t.Fatalf("amounts %+v", p)
	}
	if ymd(p[1].Due) != "2026-02-28" || ymd(p[2].Due) != "2026-03-31" {
		t.Fatalf("due dates %s %s", ymd(p[1].Due), ymd(p[2].Due))
	}
	if len(planInstallments(0, 3, d("2026-01-01"), 1)) != 0 {
		t.Fatal("zero fee should have no installments")
	}
	if got := planInstallments(2, 5, d("2026-01-01"), 1); len(got) != 2 {
		t.Fatalf("more installments than paise: %d", len(got))
	}
}

func TestAllocatePaid(t *testing.T) {
	amounts := []int64{5000, 3000, 3000}
	dues := []time.Time{d("2026-01-01"), d("2026-02-01"), d("2026-06-01")}
	today := d("2026-02-10")
	st := allocatePaid(amounts, dues, 6000, today)
	want := []string{"paid", "overdue", "upcoming"}
	for i, w := range want {
		if st[i].Status != w {
			t.Errorf("installment %d status %s, want %s", i, st[i].Status, w)
		}
	}
	if st[1].Paid != 1000 || st[2].Paid != 0 {
		t.Errorf("allocation %+v", st)
	}
	st = allocatePaid([]int64{5000}, []time.Time{d("2026-02-15")}, 2000, today)
	if st[0].Status != "partial" {
		t.Errorf("partial not detected: %+v", st)
	}
	st = allocatePaid([]int64{5000}, []time.Time{d("2026-02-15")}, 0, today)
	if st[0].Status != "due" {
		t.Errorf("due soon not detected: %+v", st)
	}
	st = allocatePaid([]int64{5000}, []time.Time{d("2026-01-15")}, 9000, today)
	if st[0].Status != "paid" || st[0].Paid != 5000 {
		t.Errorf("overpay: %+v", st)
	}
}

func TestSlabs(t *testing.T) {
	slabs := []slabDef{{MinAdmissions: 5, BP: 700}, {MinAdmissions: 10, BP: 1000}, {MinAdmissions: 0, BP: 500}}
	for _, c := range []struct {
		n    int32
		want int32
	}{{0, 500}, {4, 500}, {5, 700}, {9, 700}, {10, 1000}, {40, 1000}} {
		if got := slabRate(slabs, c.n); got != c.want {
			t.Errorf("slabRate(%d) = %d, want %d", c.n, got, c.want)
		}
	}
	lines := []commissionLine{{"earned", 1000000, 500}, {"earned", 500000, 1200}, {"reversal", 200000, 500}}
	// 10% slab: first line +5% of 10,000 = 500; second already 12% → 0; reversal −5% of 2,000 = −100
	if got := slabTopUp(lines, 1000); got != 40000 {
		t.Errorf("slabTopUp = %d, want 40000", got)
	}
	if got := slabTopUp(lines, 0); got != 0 {
		t.Errorf("no slab top-up = %d", got)
	}
}

func TestRupeesAndWords(t *testing.T) {
	for _, c := range []struct {
		p    int64
		want string
	}{{0, "₹0"}, {12345678, "₹1,23,456.78"}, {100000000, "₹10,00,000"}, {99900, "₹999"}, {-5050, "-₹50.50"}} {
		if got := rupees(c.p); got != c.want {
			t.Errorf("rupees(%d) = %q, want %q", c.p, got, c.want)
		}
	}
	for _, c := range []struct {
		p    int64
		want string
	}{
		{1180000, "Rupees Eleven Thousand Eight Hundred Only"},
		{12000050, "Rupees One Lakh Twenty Thousand and Fifty Paise Only"},
		{2500000000, "Rupees Two Crore Fifty Lakh Only"},
		{100, "Rupees One Only"},
	} {
		if got := amountInWords(c.p); got != c.want {
			t.Errorf("amountInWords(%d) = %q, want %q", c.p, got, c.want)
		}
	}
}

func TestPercentOf(t *testing.T) {
	if got := percentOf(1180000, 850); got != 100300 {
		t.Errorf("8.5%% of 11,800 = %d", got)
	}
	if got := percentOf(-200000, 1000); got != -20000 {
		t.Errorf("negative base = %d", got)
	}
}
