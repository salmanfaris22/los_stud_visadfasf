// Package dto holds the request and response models shared by handlers and services.
// Struct tags describe JSON names and validation rules (enforced by the HTTP layer and
// published in the OpenAPI spec).
package dto

import "github.com/google/uuid"

// PageQuery is embedded in list inputs.
type PageQuery struct {
	Page    int `query:"page" default:"1" minimum:"1"`
	PerPage int `query:"per_page" default:"20" minimum:"1" maximum:"200"`
}

func (p PageQuery) Lim() int32 {
	if p.PerPage <= 0 {
		return 20
	}
	return int32(p.PerPage)
}

func (p PageQuery) Off() int32 {
	page := p.Page
	if page < 1 {
		page = 1
	}
	return int32(page-1) * p.Lim()
}

// List is a paginated result.
type List[T any] struct {
	Items   []T   `json:"items"`
	Total   int64 `json:"total"`
	Page    int   `json:"page"`
	PerPage int   `json:"per_page"`
}

func NewList[T any](items []T, total int64, p PageQuery) List[T] {
	if items == nil {
		items = []T{}
	}
	return List[T]{Items: items, Total: total, Page: max(p.Page, 1), PerPage: int(p.Lim())}
}

// OK is a simple acknowledgement.
type OK struct {
	OK      bool   `json:"ok"`
	Message string `json:"message,omitempty"`
}

// Person is a compact user reference (mentor, author, host…).
type Person struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	Email     string    `json:"email"`
	AvatarURL string    `json:"avatar_url"`
	Bio       string    `json:"bio,omitempty"`
}

// IDs is a body holding an ordered list of ids (reordering, bulk actions).
type IDs struct {
	IDs []uuid.UUID `json:"ids" minItems:"1" maxItems:"2000"`
}

// File is a downloadable binary (CSV export, PDF, ICS).
type File struct {
	Name        string
	ContentType string
	Data        []byte
}
