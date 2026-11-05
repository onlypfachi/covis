// Package indexer turns a checked-out commit into a graph of nodes and edges.
// The graph is a derived mirror of the repository at that commit; it is never
// edited directly.
package indexer

import "strings"

// Node kinds.
const (
	KindRepository = "repository"
	KindDirectory  = "directory"
	KindFile       = "file"
	KindModule     = "module" // external package
	KindClass      = "class"
	KindFunction   = "function"
	KindMethod     = "method"
	KindInterface  = "interface"
	KindType       = "type"
)

// Edge kinds. Imports and calls are distinct relationships and are never merged.
const (
	EdgeContains   = "contains"
	EdgeImports    = "imports"
	EdgeExports    = "exports"
	EdgeCalls      = "calls"
	EdgeExtends    = "extends"
	EdgeImplements = "implements"
	EdgeTests      = "tests"
)

type Node struct {
	Key           string         `json:"key"`
	Kind          string         `json:"kind"`
	Name          string         `json:"name"`
	QualifiedName string         `json:"qualifiedName"`
	FilePath      string         `json:"filePath,omitempty"`
	StartLine     int            `json:"startLine,omitempty"`
	EndLine       int            `json:"endLine,omitempty"`
	ParentKey     string         `json:"parentKey,omitempty"`
	Meta          map[string]any `json:"meta,omitempty"`
}

type Edge struct {
	Source   string `json:"source"`
	Target   string `json:"target"`
	Kind     string `json:"kind"`
	FilePath string `json:"filePath,omitempty"`
	Line     int    `json:"line,omitempty"`
	// Inferred is true when the target was matched by name alone rather than
	// through an import binding or type annotation.
	Inferred bool `json:"inferred,omitempty"`
}

type Graph struct {
	Nodes []Node
	Edges []Edge
}

// Stable keys are deterministic and human-readable so they survive re-indexing
// and keep canvas layouts attached to the same component.
func RepoKey() string             { return KindRepository + ":" }
func DirKey(path string) string   { return KindDirectory + ":" + path }
func FileKey(path string) string  { return KindFile + ":" + path }
func ModuleKey(pkg string) string { return KindModule + ":" + pkg }
func SymbolKey(kind, path, qual string) string {
	return kind + ":" + path + "#" + qual
}

// KeyFilePath extracts the file path from a file or symbol key.
func KeyFilePath(key string) string {
	_, rest, ok := strings.Cut(key, ":")
	if !ok {
		return ""
	}
	path, _, _ := strings.Cut(rest, "#")
	return path
}
