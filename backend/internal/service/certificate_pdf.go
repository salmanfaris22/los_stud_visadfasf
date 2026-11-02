package service

import (
	"bytes"
	"strconv"
	"strings"
	"time"

	"github.com/go-pdf/fpdf"
	qrcode "github.com/skip2/go-qrcode"
)

func hexRGB(h string) (int, int, int) {
	h = strings.TrimPrefix(h, "#")
	if len(h) != 6 {
		return 79, 70, 229
	}
	v, err := strconv.ParseUint(h, 16, 32)
	if err != nil {
		return 79, 70, 229
	}
	return int(v >> 16 & 0xff), int(v >> 8 & 0xff), int(v & 0xff)
}

// RenderCertificatePDF draws an A4 landscape certificate.
func RenderCertificatePDF(brand, color, student, course, code string, issued time.Time, verifyURL string) ([]byte, error) {
	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetTitle("Certificate "+code, true)
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()
	tr := pdf.UnicodeTranslatorFromDescriptor("")
	r, g, b := hexRGB(color)
	w, h := 297.0, 210.0

	pdf.SetFillColor(250, 250, 255)
	pdf.Rect(0, 0, w, h, "F")
	pdf.SetDrawColor(r, g, b)
	pdf.SetLineWidth(2.5)
	pdf.Rect(10, 10, w-20, h-20, "D")
	pdf.SetLineWidth(0.6)
	pdf.Rect(15, 15, w-30, h-30, "D")
	pdf.SetFillColor(r, g, b)
	pdf.Rect(15, 15, w-30, 6, "F")

	pdf.SetTextColor(r, g, b)
	pdf.SetFont("Helvetica", "B", 18)
	pdf.SetXY(0, 32)
	pdf.CellFormat(w, 10, tr(brand), "", 1, "C", false, 0, "")

	pdf.SetTextColor(30, 30, 46)
	pdf.SetFont("Helvetica", "B", 34)
	pdf.SetXY(0, 50)
	pdf.CellFormat(w, 16, "CERTIFICATE OF COMPLETION", "", 1, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 14)
	pdf.SetTextColor(90, 90, 110)
	pdf.SetXY(0, 76)
	pdf.CellFormat(w, 8, "This certifies that", "", 1, "C", false, 0, "")

	pdf.SetFont("Times", "BI", 36)
	pdf.SetTextColor(20, 20, 30)
	pdf.SetXY(0, 88)
	pdf.CellFormat(w, 18, tr(student), "", 1, "C", false, 0, "")
	pdf.SetDrawColor(200, 200, 215)
	pdf.SetLineWidth(0.4)
	pdf.Line(70, 108, w-70, 108)

	pdf.SetFont("Helvetica", "", 14)
	pdf.SetTextColor(90, 90, 110)
	pdf.SetXY(0, 114)
	pdf.CellFormat(w, 8, "has successfully completed the course", "", 1, "C", false, 0, "")

	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetTextColor(r, g, b)
	pdf.SetXY(30, 126)
	pdf.MultiCell(w-60, 11, tr(course), "", "C", false)

	pdf.SetFont("Helvetica", "", 11)
	pdf.SetTextColor(90, 90, 110)
	pdf.SetXY(30, 168)
	pdf.CellFormat(90, 6, "Issued on "+issued.Format("2 January 2006"), "", 1, "L", false, 0, "")
	pdf.SetXY(30, 175)
	pdf.CellFormat(90, 6, "Certificate ID: "+code, "", 1, "L", false, 0, "")
	pdf.SetXY(30, 182)
	pdf.SetFont("Helvetica", "", 9)
	pdf.CellFormat(150, 5, "Verify at "+verifyURL, "", 1, "L", false, 0, "")

	png, err := qrcode.Encode(verifyURL, qrcode.Medium, 256)
	if err != nil {
		return nil, err
	}
	pdf.RegisterImageOptionsReader("qr", fpdf.ImageOptions{ImageType: "PNG"}, bytes.NewReader(png))
	pdf.ImageOptions("qr", w-62, 150, 32, 32, false, fpdf.ImageOptions{ImageType: "PNG"}, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
