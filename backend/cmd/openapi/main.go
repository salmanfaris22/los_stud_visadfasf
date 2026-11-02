// Command openapi writes the OpenAPI 3.1 spec without starting the server or a database.
//
//	go run ./cmd/openapi > api/openapi.json
package main

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/lms/backend/internal/auth"
	"github.com/lms/backend/internal/config"
	"github.com/lms/backend/internal/platform/google"
	"github.com/lms/backend/internal/server"
	"github.com/lms/backend/internal/service"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	app := server.New(&service.Deps{Cfg: cfg, Google: google.New(cfg), Tokens: auth.NewTokens(cfg.JWTSecret, cfg.AccessTTL)})
	out, err := json.MarshalIndent(app.API.OpenAPI(), "", "  ")
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	fmt.Println(string(out))
}
