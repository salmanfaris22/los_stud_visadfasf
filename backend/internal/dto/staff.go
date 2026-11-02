package dto

import (
	"time"

	"github.com/google/uuid"
)

type ModuleDef struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Group string `json:"group"`
}

type PermissionCatalog struct {
	Modules []ModuleDef `json:"modules"`
	Actions []string    `json:"actions"`
}

type Role struct {
	ID          uuid.UUID           `json:"id"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Scoped      bool                `json:"scoped" doc:"Only see assigned courses and batches"`
	SalesScope  string              `json:"sales_scope" enum:"all,team,own" doc:"Which leads, admissions and commissions the role sees"`
	IsSystem    bool                `json:"is_system"`
	UserCount   int32               `json:"user_count"`
	Permissions map[string][]string `json:"permissions" doc:"module -> actions"`
}

type RoleInput struct {
	Name        string              `json:"name" minLength:"2" maxLength:"60"`
	Description string              `json:"description,omitempty" maxLength:"300"`
	Scoped      bool                `json:"scoped,omitempty"`
	SalesScope  string              `json:"sales_scope,omitempty" enum:"all,team,own"`
	Permissions map[string][]string `json:"permissions"`
}

type RoleRef struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
}

type Staff struct {
	ID           uuid.UUID  `json:"id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Phone        string     `json:"phone"`
	AvatarURL    string     `json:"avatar_url"`
	Status       string     `json:"status"`
	IsSuperAdmin bool       `json:"is_super_admin"`
	LastLoginAt  *time.Time `json:"last_login_at"`
	CreatedAt    time.Time  `json:"created_at"`
	RoleNames    []string   `json:"role_names"`
	Roles        []RoleRef  `json:"roles"`
}

type StaffInput struct {
	Name         string      `json:"name" minLength:"2" maxLength:"120"`
	Email        string      `json:"email" format:"email" maxLength:"200"`
	Phone        string      `json:"phone,omitempty" maxLength:"30"`
	Password     string      `json:"password,omitempty" maxLength:"200" doc:"Leave empty to email an invite link"`
	Status       string      `json:"status,omitempty" enum:"active,disabled"`
	IsSuperAdmin bool        `json:"is_super_admin,omitempty"`
	RoleIDs      []uuid.UUID `json:"role_ids"`
}

type StaffFilter struct {
	PageQuery
	Q      string
	RoleID *uuid.UUID
}
