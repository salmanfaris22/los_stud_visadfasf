// Command migrate applies or rolls back database migrations.
//
//	go run ./cmd/migrate up
//	go run ./cmd/migrate down 1
//	go run ./cmd/migrate version
package main

import (
	"fmt"
	"os"
	"strconv"

	dbfiles "github.com/lms/backend/db"
	"github.com/lms/backend/internal/config"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	cmd := "up"
	if len(os.Args) > 1 {
		cmd = os.Args[1]
	}
	switch cmd {
	case "up":
		err = dbfiles.Up(cfg.DatabaseURL)
	case "down":
		steps := 1
		if len(os.Args) > 2 {
			if steps, err = strconv.Atoi(os.Args[2]); err != nil {
				break
			}
		}
		err = dbfiles.Down(cfg.DatabaseURL, steps)
	case "version":
		v, dirty, e := dbfiles.Version(cfg.DatabaseURL)
		fmt.Printf("version=%d dirty=%v\n", v, dirty)
		err = e
	default:
		err = fmt.Errorf("unknown command %q (use up, down [n], version)", cmd)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "migrate:", err)
		os.Exit(1)
	}
	fmt.Println("migrate", cmd, "ok")
}
