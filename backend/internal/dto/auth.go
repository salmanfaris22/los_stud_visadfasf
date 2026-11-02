package dto

import "github.com/google/uuid"

// Me describes the signed-in user.
type Me struct {
	ID           uuid.UUID `json:"id"`
	Kind         string    `json:"kind" enum:"staff,student"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	Phone        string    `json:"phone"`
	AvatarURL    string    `json:"avatar_url"`
	Bio          string    `json:"bio"`
	StudentCode  string    `json:"student_code"`
	IsSuperAdmin bool      `json:"is_super_admin"`
	Scoped       bool      `json:"scoped"`
	SalesScope   string    `json:"sales_scope" enum:"all,team,own,"`
	Permissions  []string  `json:"permissions"`
	App          string    `json:"app"`
}

type Providers struct {
	Google bool `json:"google"`
	Signup bool `json:"signup"`
}

type LoginInput struct {
	Email    string `json:"email" format:"email" maxLength:"200"`
	Password string `json:"password" minLength:"1" maxLength:"200"`
}

type RegisterInput struct {
	Name     string `json:"name" minLength:"2" maxLength:"120"`
	Email    string `json:"email" format:"email" maxLength:"200"`
	Phone    string `json:"phone,omitempty" maxLength:"30"`
	Password string `json:"password" minLength:"8" maxLength:"200"`
}

type ProfileInput struct {
	Name      string `json:"name" minLength:"2" maxLength:"120"`
	Phone     string `json:"phone,omitempty" maxLength:"30"`
	AvatarURL string `json:"avatar_url,omitempty" maxLength:"600"`
	Bio       string `json:"bio,omitempty" maxLength:"2000"`
}

type ChangePasswordInput struct {
	CurrentPassword string `json:"current_password,omitempty" maxLength:"200"`
	NewPassword     string `json:"new_password" minLength:"8" maxLength:"200"`
}

type ForgotInput struct {
	Email string `json:"email" format:"email" maxLength:"200"`
}

type ResetInput struct {
	Token    string `json:"token" minLength:"10" maxLength:"200"`
	Password string `json:"password" minLength:"8" maxLength:"200"`
}

// MobileLoginInput signs a staff member into the phone app (tokens returned in the body).
type MobileLoginInput struct {
	Email    string `json:"email" format:"email" maxLength:"200"`
	Password string `json:"password" minLength:"1" maxLength:"200"`
	Device   string `json:"device,omitempty" maxLength:"120" doc:"e.g. vivo X300 Pro · Android 16"`
}

type RefreshTokenInput struct {
	RefreshToken string `json:"refresh_token" minLength:"10" maxLength:"200"`
}

// MobileSession is returned to the phone app; it stores the refresh token securely.
type MobileSession struct {
	User         Me     `json:"user"`
	AccessToken  string `json:"access_token"`
	RefreshToken string `json:"refresh_token"`
	ExpiresIn    int    `json:"expires_in" doc:"Access token lifetime in seconds"`
}

// Session is what a successful sign-in produces; the HTTP layer turns tokens into cookies.
type Session struct {
	User         Me
	App          string
	AccessToken  string
	RefreshToken string
}
