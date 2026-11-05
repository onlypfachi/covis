package indexer

import (
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const maxFileBytes = 1 << 20

var skipDirs = map[string]bool{
	"node_modules": true, ".git": true, "dist": true, "build": true,
	"coverage": true, "vendor": true, ".next": true, "out": true,
}

var testFile = regexp.MustCompile(`(\.(test|spec)\.[cm]?[jt]sx?$)|(^|/)__tests__/`)

// Index analyzes the checkout at root and returns its graph. root must be a
// checkout of a single commit; the caller records which one.
func Index(root, repoName string) (*Graph, error) {
	files := map[string]*fileFacts{}
	err := filepath.WalkDir(root, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			if p != root && (skipDirs[d.Name()] || strings.HasPrefix(d.Name(), ".")) {
				return filepath.SkipDir
			}
			return nil
		}
		rel, _ := filepath.Rel(root, p)
		rel = filepath.ToSlash(rel)
		if languageFor(rel) == nil || strings.HasSuffix(rel, ".d.ts") || strings.Contains(rel, ".min.") {
			return nil
		}
		info, err := d.Info()
		if err != nil || !info.Mode().IsRegular() || info.Size() > maxFileBytes {
			return nil // symlinks and huge files are skipped
		}
		src, err := os.ReadFile(p)
		if err != nil {
			return err
		}
		facts, err := parseFile(rel, src)
		if err != nil {
			return err
		}
		files[rel] = facts
		return nil
	})
	if err != nil {
		return nil, err
	}
	b := &builder{files: files, res: newResolver(root, files), seenNode: map[string]bool{}, seenEdge: map[Edge]bool{}}
	b.build(repoName)
	b.sort()
	return &b.g, nil
}

type builder struct {
	g        Graph
	files    map[string]*fileFacts
	res      *resolver
	seenNode map[string]bool
	seenEdge map[Edge]bool
}

func (b *builder) node(n Node) {
	if b.seenNode[n.Key] {
		return
	}
	b.seenNode[n.Key] = true
	b.g.Nodes = append(b.g.Nodes, n)
	if n.ParentKey != "" {
		b.edge(Edge{Source: n.ParentKey, Target: n.Key, Kind: EdgeContains})
	}
}

func (b *builder) edge(e Edge) {
	if e.Source == "" || e.Target == "" || e.Source == e.Target {
		return
	}
	// Dedupe on relationship identity, keeping the first occurrence's line.
	id := Edge{Source: e.Source, Target: e.Target, Kind: e.Kind}
	if b.seenEdge[id] {
		return
	}
	b.seenEdge[id] = true
	b.g.Edges = append(b.g.Edges, e)
}

func (b *builder) dir(p string) string {
	if p == "." || p == "" {
		return RepoKey()
	}
	key := DirKey(p)
	if !b.seenNode[key] {
		parent := b.dir(path.Dir(p))
		b.node(Node{Key: key, Kind: KindDirectory, Name: path.Base(p), QualifiedName: p, FilePath: p, ParentKey: parent})
	}
	return key
}

func (b *builder) build(repoName string) {
	b.node(Node{Key: RepoKey(), Kind: KindRepository, Name: repoName, QualifiedName: repoName})

	paths := make([]string, 0, len(b.files))
	for p := range b.files {
		paths = append(paths, p)
	}
	sort.Strings(paths)

	// Pass 1: structural nodes.
	for _, p := range paths {
		f := b.files[p]
		fileKey := FileKey(p)
		meta := map[string]any{}
		if testFile.MatchString(p) {
			meta["isTest"] = true
		}
		b.node(Node{Key: fileKey, Kind: KindFile, Name: path.Base(p), QualifiedName: p, FilePath: p, ParentKey: b.dir(path.Dir(p)), Meta: meta})
		for _, s := range f.symbols {
			parent := fileKey
			if s.parent != "" {
				parent = SymbolKey(KindClass, p, s.parent)
			}
			b.node(Node{Key: SymbolKey(s.kind, p, s.qual), Kind: s.kind, Name: s.name, QualifiedName: s.qual,
				FilePath: p, StartLine: s.start, EndLine: s.end, ParentKey: parent, Meta: s.meta})
		}
	}

	// Pass 2: relationships.
	for _, p := range paths {
		f := b.files[p]
		fileKey := FileKey(p)
		isTest := testFile.MatchString(p)
		for _, im := range f.imports {
			target, ext := b.res.resolve(p, im.spec)
			if target != "" {
				b.edge(Edge{Source: fileKey, Target: FileKey(target), Kind: EdgeImports, FilePath: p, Line: im.line})
				if isTest && !testFile.MatchString(target) {
					b.edge(Edge{Source: fileKey, Target: FileKey(target), Kind: EdgeTests, FilePath: p, Line: im.line})
				}
			} else if ext != "" {
				b.node(Node{Key: ModuleKey(ext), Kind: KindModule, Name: ext, QualifiedName: ext, ParentKey: RepoKey(), Meta: map[string]any{"external": true}})
				b.edge(Edge{Source: fileKey, Target: ModuleKey(ext), Kind: EdgeImports, FilePath: p, Line: im.line})
			}
		}
		for name := range f.exports {
			if s := b.localSymbol(f, f.exports[name]); s != nil {
				b.edge(Edge{Source: fileKey, Target: SymbolKey(s.kind, p, s.qual), Kind: EdgeExports, FilePath: p, Line: s.start})
			}
		}
		for _, s := range f.symbols {
			if s.kind != KindClass {
				continue
			}
			from := SymbolKey(KindClass, p, s.qual)
			for _, t := range s.extends {
				if key := b.resolveName(f, t, 0); key != "" {
					b.edge(Edge{Source: from, Target: key, Kind: EdgeExtends, FilePath: p, Line: s.start})
				}
			}
			for _, t := range s.implements {
				if key := b.resolveName(f, t, 0); key != "" {
					b.edge(Edge{Source: from, Target: key, Kind: EdgeImplements, FilePath: p, Line: s.start})
				}
			}
		}
		for _, c := range f.calls {
			b.resolveCall(f, c)
		}
	}
}

func (b *builder) localSymbol(f *fileFacts, qual string) *symbol {
	for i := range f.symbols {
		if f.symbols[i].qual == qual {
			return &f.symbols[i]
		}
	}
	return nil
}

func (b *builder) bindingFor(f *fileFacts, local string) *binding {
	for i := range f.bindings {
		if f.bindings[i].local == local {
			return &f.bindings[i]
		}
	}
	return nil
}

// resolveName resolves a top-level identifier visible in f to a symbol key,
// following import bindings and re-exports.
func (b *builder) resolveName(f *fileFacts, name string, depth int) string {
	if s := b.localSymbol(f, name); s != nil && s.parent == "" {
		return SymbolKey(s.kind, f.path, s.qual)
	}
	if bd := b.bindingFor(f, name); bd != nil {
		if target, _ := b.res.resolve(f.path, bd.spec); target != "" {
			return b.resolveExport(target, bd.imported, depth+1)
		}
	}
	return ""
}

// resolveExport finds the symbol a module exports under name.
func (b *builder) resolveExport(file, name string, depth int) string {
	f := b.files[file]
	if f == nil || depth > 8 || name == "*" {
		return ""
	}
	if local, ok := f.exports[name]; ok {
		return b.resolveName(f, local, depth)
	}
	for _, im := range f.imports {
		if !im.exportStar {
			continue
		}
		if target, _ := b.res.resolve(file, im.spec); target != "" {
			if key := b.resolveExport(target, name, depth+1); key != "" {
				return key
			}
		}
	}
	return ""
}

// resolveMethod finds method on the class identified by classKey.
func (b *builder) resolveMethod(classKey, method string) string {
	if !strings.HasPrefix(classKey, KindClass+":") {
		return ""
	}
	key := classKey + "." + method
	if b.seenNode[strings.Replace(key, KindClass+":", KindMethod+":", 1)] {
		return strings.Replace(key, KindClass+":", KindMethod+":", 1)
	}
	return ""
}

// inheritedMethod looks up method on classKey, then up its extends chain.
func (b *builder) inheritedMethod(classKey, method string, depth int) string {
	if key := b.resolveMethod(classKey, method); key != "" || depth > 8 {
		return key
	}
	file := KeyFilePath(classKey)
	f := b.files[file]
	if f == nil {
		return ""
	}
	_, qual, _ := strings.Cut(classKey, "#")
	if s := b.localSymbol(f, qual); s != nil {
		for _, parent := range s.extends {
			if key := b.inheritedMethod(b.resolveName(f, parent, 0), method, depth+1); key != "" {
				return key
			}
		}
	}
	return ""
}

func (b *builder) resolveCall(f *fileFacts, c callSite) {
	from := b.localSymbol(f, c.from)
	if from == nil {
		return
	}
	src := SymbolKey(from.kind, f.path, from.qual)
	emit := func(target string, inferred bool) {
		if target != "" {
			b.edge(Edge{Source: src, Target: target, Kind: EdgeCalls, FilePath: f.path, Line: c.line, Inferred: inferred})
		}
	}
	switch {
	case c.receiver == "" || c.receiver == "new":
		emit(b.resolveName(f, c.callee, 0), false)
	case c.receiver == "this" && from.parent != "":
		emit(b.inheritedMethod(SymbolKey(KindClass, f.path, from.parent), c.callee, 0), false)
	case strings.HasPrefix(c.receiver, "this.") && from.parent != "":
		field := strings.TrimPrefix(c.receiver, "this.")
		if typ := f.fieldTypes[from.parent][field]; typ != "" {
			emit(b.inheritedMethod(b.resolveName(f, typ, 0), c.callee, 0), false)
		}
	default:
		if bd := b.bindingFor(f, c.receiver); bd != nil && bd.imported == "*" {
			if target, _ := b.res.resolve(f.path, bd.spec); target != "" {
				emit(b.resolveExport(target, c.callee, 1), false)
			}
			return
		}
		emit(b.guessMethod(f, c.callee), true)
	}
}

// guessMethod matches a method call on an unknown receiver by name, among the
// files f imports. It only answers when exactly one candidate exists.
func (b *builder) guessMethod(f *fileFacts, method string) string {
	var found string
	for _, im := range f.imports {
		target, _ := b.res.resolve(f.path, im.spec)
		tf := b.files[target]
		if tf == nil {
			continue
		}
		for _, s := range tf.symbols {
			if s.kind == KindMethod && s.name == method {
				key := SymbolKey(KindMethod, target, s.qual)
				if found != "" && found != key {
					return ""
				}
				found = key
			}
		}
	}
	return found
}

func (b *builder) sort() {
	sort.Slice(b.g.Nodes, func(i, j int) bool { return b.g.Nodes[i].Key < b.g.Nodes[j].Key })
	sort.Slice(b.g.Edges, func(i, j int) bool {
		x, y := b.g.Edges[i], b.g.Edges[j]
		if x.Kind != y.Kind {
			return x.Kind < y.Kind
		}
		if x.Source != y.Source {
			return x.Source < y.Source
		}
		return x.Target < y.Target
	})
}
