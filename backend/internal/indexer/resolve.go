package indexer

import (
	"encoding/json"
	"os"
	"path"
	"path/filepath"
	"strings"
)

var probeExts = []string{".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"}

// resolver maps import specifiers to repository files, honouring relative
// paths and tsconfig/jsconfig baseUrl and paths.
type resolver struct {
	files   map[string]*fileFacts
	baseURL string // repo-relative, "" when unset
	paths   map[string][]string
}

func newResolver(root string, files map[string]*fileFacts) *resolver {
	r := &resolver{files: files}
	for _, name := range []string{"tsconfig.json", "jsconfig.json"} {
		raw, err := os.ReadFile(filepath.Join(root, name))
		if err != nil {
			continue
		}
		var cfg struct {
			CompilerOptions struct {
				BaseURL string              `json:"baseUrl"`
				Paths   map[string][]string `json:"paths"`
			} `json:"compilerOptions"`
		}
		if json.Unmarshal(stripJSONC(raw), &cfg) != nil {
			continue
		}
		r.paths = cfg.CompilerOptions.Paths
		if cfg.CompilerOptions.BaseURL != "" {
			r.baseURL = path.Clean(cfg.CompilerOptions.BaseURL)
		} else if r.paths != nil {
			r.baseURL = "."
		}
		break
	}
	return r
}

// resolve returns the repository file for spec imported from fromPath, or the
// external package name when it is not a repository file.
func (r *resolver) resolve(fromPath, spec string) (file, external string) {
	if strings.HasPrefix(spec, ".") {
		return r.probe(path.Join(path.Dir(fromPath), spec)), ""
	}
	for pattern, targets := range r.paths {
		prefix, suffix, wild := strings.Cut(pattern, "*")
		var rest string
		switch {
		case wild && strings.HasPrefix(spec, prefix) && strings.HasSuffix(spec, suffix) && len(spec) >= len(prefix)+len(suffix):
			rest = spec[len(prefix) : len(spec)-len(suffix)]
		case !wild && spec == pattern:
		default:
			continue
		}
		for _, t := range targets {
			if f := r.probe(path.Join(r.baseURL, strings.Replace(t, "*", rest, 1))); f != "" {
				return f, ""
			}
		}
	}
	if r.baseURL != "" {
		if f := r.probe(path.Join(r.baseURL, spec)); f != "" {
			return f, ""
		}
	}
	return "", packageName(spec)
}

func (r *resolver) probe(p string) string {
	p = path.Clean(p)
	if _, ok := r.files[p]; ok {
		return p
	}
	// TS ESM convention: import "./x.js" refers to x.ts.
	stem := strings.TrimSuffix(p, path.Ext(p))
	for _, cand := range []string{p, stem} {
		for _, ext := range probeExts {
			if _, ok := r.files[cand+ext]; ok {
				return cand + ext
			}
		}
	}
	for _, ext := range probeExts {
		if _, ok := r.files[p+"/index"+ext]; ok {
			return p + "/index" + ext
		}
	}
	return ""
}

func packageName(spec string) string {
	parts := strings.Split(spec, "/")
	if strings.HasPrefix(spec, "@") && len(parts) > 1 {
		return parts[0] + "/" + parts[1]
	}
	return parts[0]
}

// stripJSONC removes comments and trailing commas so tsconfig files parse.
func stripJSONC(in []byte) []byte {
	out := make([]byte, 0, len(in))
	inStr := false
	for i := 0; i < len(in); i++ {
		c := in[i]
		if inStr {
			out = append(out, c)
			if c == '\\' && i+1 < len(in) {
				i++
				out = append(out, in[i])
			} else if c == '"' {
				inStr = false
			}
			continue
		}
		switch {
		case c == '"':
			inStr = true
			out = append(out, c)
		case c == '/' && i+1 < len(in) && in[i+1] == '/':
			for i < len(in) && in[i] != '\n' {
				i++
			}
			out = append(out, '\n')
		case c == '/' && i+1 < len(in) && in[i+1] == '*':
			i += 2
			for i+1 < len(in) && !(in[i] == '*' && in[i+1] == '/') {
				i++
			}
			i++
		case c == ',':
			j := i + 1
			for j < len(in) && strings.ContainsRune(" \t\r\n", rune(in[j])) {
				j++
			}
			if j < len(in) && (in[j] == '}' || in[j] == ']') {
				continue
			}
			out = append(out, c)
		default:
			out = append(out, c)
		}
	}
	return out
}
