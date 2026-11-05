package graph

import "github.com/n0/covis/backend/internal/app"

//go:generate go run github.com/99designs/gqlgen generate

type Resolver struct {
	App *app.Service
}
