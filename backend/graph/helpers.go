package graph

import (
	"errors"

	"github.com/n0/covis/backend/internal/changeset"
	"github.com/n0/covis/backend/internal/graphstore"
)

// orNil maps not-found errors to a null result.
func orNil[T any](v *T, err error) (*T, error) {
	if errors.Is(err, graphstore.ErrNotFound) || errors.Is(err, changeset.ErrNotFound) {
		return nil, nil
	}
	return v, err
}

func nonNil[T any](s []T) []T {
	if s == nil {
		return []T{}
	}
	return s
}
