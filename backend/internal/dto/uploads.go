package dto

import "github.com/google/uuid"

type Upload struct {
	ID        uuid.UUID `json:"id"`
	FileName  string    `json:"file_name"`
	Mime      string    `json:"mime"`
	SizeBytes int64     `json:"size_bytes"`
	URL       string    `json:"url"`
	Status    string    `json:"status"`
}

type PresignInput struct {
	Purpose  string `json:"purpose" enum:"submission,comment,avatar,thumbnail,cms,blog"`
	FileName string `json:"file_name" minLength:"1" maxLength:"200"`
	Mime     string `json:"mime" minLength:"3" maxLength:"120"`
	Size     int64  `json:"size" minimum:"1"`
}

type Presigned struct {
	Upload  Upload            `json:"upload"`
	PutURL  string            `json:"put_url"`
	Headers map[string]string `json:"headers"`
}
