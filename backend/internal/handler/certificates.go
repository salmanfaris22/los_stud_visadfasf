package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/danielgtaylor/huma/v2"

	"github.com/lms/backend/internal/dto"
)

type certListIn struct {
	dto.PageQuery
	CourseID string `query:"course_id"`
	Q        string `query:"q" maxLength:"100"`
}

type codePath struct {
	Code string `path:"code" maxLength:"40"`
}

func (h *Handler) certificateRoutes(api huma.API) {
	t, g := "Certificates", h.g
	huma.Register(api, op("list-certificates", http.MethodGet, "/certificates", t, "List issued certificates", g.Perm("certificates", "view")), h.listCertificates)
	huma.Register(api, op("issue-certificate", http.MethodPost, "/certificates", t, "Issue a certificate manually", g.Perm("certificates", "create")), h.issueCertificate)
	huma.Register(api, op("revoke-certificate", http.MethodDelete, "/certificates/{id}", t, "Revoke a certificate", g.Perm("certificates", "delete")), h.revokeCertificate)
	huma.Register(api, op("certificate-pdf", http.MethodGet, "/certificates/{id}/pdf", t, "Download a certificate PDF", g.Perm("certificates", "view")), h.certificatePDF)
	huma.Register(api, op("my-certificates", http.MethodGet, "/me/certificates", t, "My certificates", g.Student()), h.myCertificates)
	huma.Register(api, op("my-certificate-pdf", http.MethodGet, "/me/certificates/{id}/pdf", t, "Download my certificate", g.Student()), h.certificatePDF)
	huma.Register(api, op("verify-certificate", http.MethodGet, "/public/certificates/{code}", "Public website", "Verify a certificate code", g.RateLimit("verify", 60, time.Minute)), h.verifyCertificate)
}

func (h *Handler) listCertificates(ctx context.Context, in *certListIn) (*Out[dto.List[dto.Certificate]], error) {
	cid, err := optID(in.CourseID)
	if err != nil {
		return nil, err
	}
	return ok(h.s.Certificates.List(ctx, dto.CertificateFilter{PageQuery: in.PageQuery, CourseID: cid, Q: in.Q}))
}

func (h *Handler) issueCertificate(ctx context.Context, in *bodyIn[dto.CertificateInput]) (*Out[dto.Certificate], error) {
	return ok(h.s.Certificates.IssueManual(ctx, actor(ctx), in.Body))
}

func (h *Handler) revokeCertificate(ctx context.Context, in *idPath) (*struct{}, error) {
	id, err := parseID(in.ID, "certificate")
	if err != nil {
		return nil, err
	}
	return done(h.s.Certificates.Revoke(ctx, actor(ctx), id))
}

func (h *Handler) certificatePDF(ctx context.Context, in *idPath) (*FileOut, error) {
	id, err := parseID(in.ID, "certificate")
	if err != nil {
		return nil, err
	}
	return file(h.s.Certificates.PDF(ctx, actor(ctx), id))
}

func (h *Handler) myCertificates(ctx context.Context, _ *noInput) (*Out[[]dto.Certificate], error) {
	return ok(h.s.Certificates.Mine(ctx, actor(ctx)))
}

func (h *Handler) verifyCertificate(ctx context.Context, in *codePath) (*Out[dto.CertificateVerification], error) {
	return ok(h.s.Certificates.Verify(ctx, in.Code))
}
