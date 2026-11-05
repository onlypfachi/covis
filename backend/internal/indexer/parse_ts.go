package indexer

import (
	"path"
	"strings"

	sitter "github.com/tree-sitter/go-tree-sitter"
	tsjs "github.com/tree-sitter/tree-sitter-javascript/bindings/go"
	tsts "github.com/tree-sitter/tree-sitter-typescript/bindings/go"
)

// symbol is a declaration found in one file. qual is the name within the file,
// e.g. "PaymentService" or "PaymentService.charge".
type symbol struct {
	kind       string
	name       string
	qual       string
	start, end int
	parent     string // qual of the enclosing class, or ""
	extends    []string
	implements []string
	meta       map[string]any
}

type importStmt struct {
	spec       string
	line       int
	reexport   bool
	exportStar bool
}

// binding maps a local name to an exported name of another module.
// imported is the exported name, "default", or "*" for namespace imports.
type binding struct {
	local    string
	imported string
	spec     string
}

type callSite struct {
	from     string // qual of the calling symbol
	callee   string
	receiver string // "", "this", "this.<field>", "new", "?" or an identifier
	line     int
}

type fileFacts struct {
	path     string
	symbols  []symbol
	imports  []importStmt
	bindings []binding
	calls    []callSite
	// exported name -> local name
	exports map[string]string
	// class qual -> field -> type name
	fieldTypes map[string]map[string]string
}

var (
	langTS  = sitter.NewLanguage(tsts.LanguageTypescript())
	langTSX = sitter.NewLanguage(tsts.LanguageTSX())
	langJS  = sitter.NewLanguage(tsjs.Language())
)

func languageFor(p string) *sitter.Language {
	switch path.Ext(p) {
	case ".ts", ".mts", ".cts":
		return langTS
	case ".tsx":
		return langTSX
	case ".js", ".jsx", ".mjs", ".cjs":
		return langJS
	}
	return nil
}

func parseFile(p string, src []byte) (*fileFacts, error) {
	parser := sitter.NewParser()
	defer parser.Close()
	if err := parser.SetLanguage(languageFor(p)); err != nil {
		return nil, err
	}
	tree := parser.Parse(src, nil)
	defer tree.Close()

	x := &extractor{src: src, f: &fileFacts{
		path:       p,
		exports:    map[string]string{},
		fieldTypes: map[string]map[string]string{},
	}}
	root := tree.RootNode()
	for i := uint(0); i < root.NamedChildCount(); i++ {
		x.top(root.NamedChild(i))
	}
	return x.f, nil
}

type extractor struct {
	src []byte
	f   *fileFacts
}

func (x *extractor) text(n *sitter.Node) string { return n.Utf8Text(x.src) }
func line(n *sitter.Node) int                   { return int(n.StartPosition().Row) + 1 }
func endLine(n *sitter.Node) int                { return int(n.EndPosition().Row) + 1 }

func (x *extractor) top(n *sitter.Node) {
	switch n.Kind() {
	case "import_statement":
		x.importStmt(n)
	case "export_statement":
		x.exportStmt(n)
	default:
		x.decl(n, "", false)
	}
}

func unquote(s string) string { return strings.Trim(s, "\"'`") }

func (x *extractor) importStmt(n *sitter.Node) {
	src := n.ChildByFieldName("source")
	if src == nil {
		return
	}
	spec := unquote(x.text(src))
	x.f.imports = append(x.f.imports, importStmt{spec: spec, line: line(n)})
	for i := uint(0); i < n.NamedChildCount(); i++ {
		c := n.NamedChild(i)
		if c.Kind() == "import_clause" {
			x.importClause(c, spec)
		}
	}
}

func (x *extractor) importClause(n *sitter.Node, spec string) {
	for i := uint(0); i < n.NamedChildCount(); i++ {
		c := n.NamedChild(i)
		switch c.Kind() {
		case "identifier":
			x.f.bindings = append(x.f.bindings, binding{local: x.text(c), imported: "default", spec: spec})
		case "namespace_import":
			for j := uint(0); j < c.NamedChildCount(); j++ {
				if id := c.NamedChild(j); id.Kind() == "identifier" {
					x.f.bindings = append(x.f.bindings, binding{local: x.text(id), imported: "*", spec: spec})
				}
			}
		case "named_imports":
			for j := uint(0); j < c.NamedChildCount(); j++ {
				s := c.NamedChild(j)
				if s.Kind() != "import_specifier" {
					continue
				}
				name := x.text(s.ChildByFieldName("name"))
				local := name
				if a := s.ChildByFieldName("alias"); a != nil {
					local = x.text(a)
				}
				x.f.bindings = append(x.f.bindings, binding{local: local, imported: name, spec: spec})
			}
		}
	}
}

func hasToken(n *sitter.Node, tok string) bool {
	for i := uint(0); i < n.ChildCount(); i++ {
		c := n.Child(i)
		if !c.IsNamed() && c.Kind() == tok {
			return true
		}
	}
	return false
}

func (x *extractor) exportStmt(n *sitter.Node) {
	isDefault := hasToken(n, "default")
	if d := n.ChildByFieldName("declaration"); d != nil {
		for _, name := range x.decl(d, "", true) {
			x.f.exports[name] = name
			if isDefault {
				x.f.exports["default"] = name
			}
		}
		return
	}
	if isDefault {
		if v := n.ChildByFieldName("value"); v != nil && v.Kind() == "identifier" {
			x.f.exports["default"] = x.text(v)
		} else if v != nil {
			// export default class/function without a name, or an expression.
			for _, name := range x.decl(v, "", true) {
				x.f.exports["default"] = name
			}
		}
		return
	}

	var spec string
	if src := n.ChildByFieldName("source"); src != nil {
		spec = unquote(x.text(src))
	}
	var clause *sitter.Node
	for i := uint(0); i < n.NamedChildCount(); i++ {
		if c := n.NamedChild(i); c.Kind() == "export_clause" {
			clause = c
		}
	}
	if spec != "" {
		x.f.imports = append(x.f.imports, importStmt{spec: spec, line: line(n), reexport: true, exportStar: clause == nil})
	}
	if clause == nil {
		return
	}
	for i := uint(0); i < clause.NamedChildCount(); i++ {
		s := clause.NamedChild(i)
		if s.Kind() != "export_specifier" {
			continue
		}
		name := x.text(s.ChildByFieldName("name"))
		alias := name
		if a := s.ChildByFieldName("alias"); a != nil {
			alias = x.text(a)
		}
		if spec != "" {
			// Re-export: bind a synthetic local name to the other module.
			local := "\x00reexport:" + alias
			x.f.bindings = append(x.f.bindings, binding{local: local, imported: name, spec: spec})
			x.f.exports[alias] = local
		} else {
			x.f.exports[alias] = name
		}
	}
}

// decl records a declaration and returns the top-level names it declares.
func (x *extractor) decl(n *sitter.Node, parent string, exported bool) []string {
	switch n.Kind() {
	case "class_declaration", "abstract_class_declaration", "class":
		return x.class(n)
	case "function_declaration", "generator_function_declaration", "function_expression", "function":
		name := "default"
		if id := n.ChildByFieldName("name"); id != nil {
			name = x.text(id)
		}
		x.add(symbol{kind: KindFunction, name: name, qual: name, start: line(n), end: endLine(n), meta: x.signature(n, n)})
		x.calls(n.ChildByFieldName("body"), name)
		return []string{name}
	case "lexical_declaration", "variable_declaration":
		var names []string
		for i := uint(0); i < n.NamedChildCount(); i++ {
			d := n.NamedChild(i)
			if d.Kind() != "variable_declarator" {
				continue
			}
			id := d.ChildByFieldName("name")
			if id == nil || id.Kind() != "identifier" {
				continue
			}
			name := x.text(id)
			names = append(names, name)
			if v := d.ChildByFieldName("value"); v != nil && isFunctionValue(v) {
				x.add(symbol{kind: KindFunction, name: name, qual: name, start: line(n), end: endLine(n), meta: x.signature(v, n)})
				x.calls(v, name)
			}
		}
		return names
	case "interface_declaration":
		name := x.text(n.ChildByFieldName("name"))
		x.add(symbol{kind: KindInterface, name: name, qual: name, start: line(n), end: endLine(n)})
		return []string{name}
	case "type_alias_declaration", "enum_declaration":
		name := x.text(n.ChildByFieldName("name"))
		x.add(symbol{kind: KindType, name: name, qual: name, start: line(n), end: endLine(n)})
		return []string{name}
	}
	return nil
}

func isFunctionValue(n *sitter.Node) bool {
	switch n.Kind() {
	case "arrow_function", "function_expression", "function", "generator_function":
		return true
	}
	return false
}

func (x *extractor) add(s symbol) { x.f.symbols = append(x.f.symbols, s) }

func (x *extractor) class(n *sitter.Node) []string {
	name := "default"
	if id := n.ChildByFieldName("name"); id != nil {
		name = x.text(id)
	}
	cls := symbol{kind: KindClass, name: name, qual: name, start: line(n), end: endLine(n)}
	for i := uint(0); i < n.NamedChildCount(); i++ {
		h := n.NamedChild(i)
		if h.Kind() != "class_heritage" {
			continue
		}
		for j := uint(0); j < h.NamedChildCount(); j++ {
			c := h.NamedChild(j)
			switch c.Kind() {
			case "extends_clause":
				for k := uint(0); k < c.NamedChildCount(); k++ {
					if t := typeName(x, c.NamedChild(k)); t != "" {
						cls.extends = append(cls.extends, t)
					}
				}
			case "implements_clause":
				for k := uint(0); k < c.NamedChildCount(); k++ {
					if t := typeName(x, c.NamedChild(k)); t != "" {
						cls.implements = append(cls.implements, t)
					}
				}
			default: // JavaScript grammar: heritage holds the expression directly
				if t := typeName(x, c); t != "" {
					cls.extends = append(cls.extends, t)
				}
			}
		}
	}
	x.add(cls)

	body := n.ChildByFieldName("body")
	if body == nil {
		return []string{name}
	}
	fields := map[string]string{}
	for i := uint(0); i < body.NamedChildCount(); i++ {
		m := body.NamedChild(i)
		switch m.Kind() {
		case "method_definition":
			mname := x.text(m.ChildByFieldName("name"))
			if mname == "constructor" {
				x.ctorFields(m, fields)
			}
			qual := name + "." + mname
			x.add(symbol{kind: KindMethod, name: mname, qual: qual, parent: name, start: line(m), end: endLine(m), meta: x.signature(m, m)})
			x.calls(m.ChildByFieldName("body"), qual)
		case "public_field_definition", "field_definition":
			nameNode := m.ChildByFieldName("name")
			if nameNode == nil {
				nameNode = m.ChildByFieldName("property")
			}
			if nameNode == nil {
				continue
			}
			fname := x.text(nameNode)
			v := m.ChildByFieldName("value")
			if t := m.ChildByFieldName("type"); t != nil {
				fields[fname] = typeName(x, t)
			} else if v != nil && v.Kind() == "new_expression" {
				fields[fname] = typeName(x, v.ChildByFieldName("constructor"))
			}
			if v != nil && isFunctionValue(v) {
				qual := name + "." + fname
				x.add(symbol{kind: KindMethod, name: fname, qual: qual, parent: name, start: line(m), end: endLine(m), meta: x.signature(v, m)})
				x.calls(v, qual)
			}
		}
	}
	x.f.fieldTypes[name] = fields
	return []string{name}
}

// ctorFields records TypeScript parameter properties: constructor(private svc: Svc).
func (x *extractor) ctorFields(m *sitter.Node, fields map[string]string) {
	params := m.ChildByFieldName("parameters")
	if params == nil {
		return
	}
	for i := uint(0); i < params.NamedChildCount(); i++ {
		p := params.NamedChild(i)
		if p.Kind() != "required_parameter" && p.Kind() != "optional_parameter" {
			continue
		}
		isProp := false
		for j := uint(0); j < p.NamedChildCount(); j++ {
			if k := p.NamedChild(j).Kind(); k == "accessibility_modifier" || k == "override_modifier" {
				isProp = true
			}
		}
		if !isProp && !hasToken(p, "readonly") {
			continue
		}
		pat, typ := p.ChildByFieldName("pattern"), p.ChildByFieldName("type")
		if pat != nil && typ != nil {
			fields[x.text(pat)] = typeName(x, typ)
		}
	}
}

// typeName reduces a type or expression node to a bare identifier,
// dropping generics, type annotations' colons and namespaces.
func typeName(x *extractor, n *sitter.Node) string {
	if n == nil {
		return ""
	}
	switch n.Kind() {
	case "identifier", "type_identifier":
		return x.text(n)
	case "type_annotation", "generic_type", "extends_type_clause":
		for i := uint(0); i < n.NamedChildCount(); i++ {
			if t := typeName(x, n.NamedChild(i)); t != "" {
				return t
			}
		}
	case "nested_type_identifier", "member_expression":
		s := x.text(n)
		return s[strings.LastIndex(s, ".")+1:]
	}
	return ""
}

func (x *extractor) calls(n *sitter.Node, from string) {
	if n == nil {
		return
	}
	switch n.Kind() {
	case "call_expression":
		if fn := n.ChildByFieldName("function"); fn != nil {
			x.callTarget(fn, from, line(n))
		}
	case "new_expression":
		if c := n.ChildByFieldName("constructor"); c != nil && c.Kind() == "identifier" {
			x.f.calls = append(x.f.calls, callSite{from: from, callee: x.text(c), receiver: "new", line: line(n)})
		}
	}
	for i := uint(0); i < n.NamedChildCount(); i++ {
		x.calls(n.NamedChild(i), from)
	}
}

func (x *extractor) callTarget(fn *sitter.Node, from string, ln int) {
	switch fn.Kind() {
	case "identifier":
		x.f.calls = append(x.f.calls, callSite{from: from, callee: x.text(fn), line: ln})
	case "member_expression":
		prop := fn.ChildByFieldName("property")
		obj := fn.ChildByFieldName("object")
		if prop == nil || obj == nil {
			return
		}
		recv := "?"
		switch obj.Kind() {
		case "this":
			recv = "this"
		case "identifier":
			recv = x.text(obj)
		case "member_expression":
			if o := obj.ChildByFieldName("object"); o != nil && o.Kind() == "this" {
				if p := obj.ChildByFieldName("property"); p != nil {
					recv = "this." + x.text(p)
				}
			}
		}
		x.f.calls = append(x.f.calls, callSite{from: from, callee: x.text(prop), receiver: recv, line: ln})
	}
}

// signature describes a function's inputs and output for the inspector:
// parameters, return type, modifiers and doc comment. fn is the node that owns
// the parameters; decl is the declaration that carries modifiers and docs.
func (x *extractor) signature(fn, decl *sitter.Node) map[string]any {
	params := []map[string]any{}
	if ps := fn.ChildByFieldName("parameters"); ps != nil {
		for i := uint(0); i < ps.NamedChildCount(); i++ {
			if p := ps.NamedChild(i); p.Kind() != "comment" {
				params = append(params, x.param(p))
			}
		}
	} else if p := fn.ChildByFieldName("parameter"); p != nil {
		params = append(params, map[string]any{"name": x.text(p)}) // x => ...
	}
	sig := map[string]any{"params": params, "modifiers": x.modifiers(decl)}
	if fn != decl {
		sig["modifiers"] = dedupe(append(sig["modifiers"].([]string), x.modifiers(fn)...))
	}
	if rt := fn.ChildByFieldName("return_type"); rt != nil {
		sig["returns"] = typeText(x.text(rt))
	}
	if doc := x.docComment(decl); doc != "" {
		summary, paramDocs, returnsDoc := splitDoc(doc)
		if summary != "" {
			sig["doc"] = summary
		}
		for _, p := range params {
			if name, _ := p["name"].(string); paramDocs[name] != "" {
				p["doc"] = paramDocs[name]
			}
		}
		if returnsDoc != "" {
			sig["returnsDoc"] = returnsDoc
		}
	}
	if exprs := x.returnExprs(fn); len(exprs) > 0 {
		sig["returnExprs"] = exprs
	}
	return sig
}

// splitDoc separates a doc comment's summary from its @param and @returns
// descriptions. Lines after a tag continue that tag; other tags are dropped.
func splitDoc(doc string) (summary string, params map[string]string, returns string) {
	params = map[string]string{}
	var sum []string
	section, param := "summary", ""
	appendTo := func(prev, l string) string { return strings.TrimSpace(prev + " " + l) }
	for _, l := range strings.Split(doc, "\n") {
		if !strings.HasPrefix(l, "@") {
			switch section {
			case "summary":
				sum = append(sum, l)
			case "param":
				params[param] = appendTo(params[param], l)
			case "returns":
				returns = appendTo(returns, l)
			}
			continue
		}
		tag, rest, _ := strings.Cut(l, " ")
		rest = strings.TrimSpace(rest)
		if strings.HasPrefix(rest, "{") { // JSDoc type, e.g. {string}
			if i := strings.Index(rest, "}"); i >= 0 {
				rest = strings.TrimSpace(rest[i+1:])
			}
		}
		section = "other"
		switch tag {
		case "@param", "@arg", "@argument":
			name, desc, _ := strings.Cut(rest, " ")
			name, _, _ = strings.Cut(strings.Trim(name, "[]"), "=") // [name=default]
			section, param = "param", name
			params[name] = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(desc), "-"))
		case "@returns", "@return":
			section = "returns"
			returns = strings.TrimSpace(strings.TrimPrefix(rest, "-"))
		}
	}
	return strings.TrimSpace(strings.Join(sum, "\n")), params, returns
}

// returnExprs lists what the function returns: the expression of each return
// statement in its own body (not nested functions), or an arrow's expression body.
func (x *extractor) returnExprs(fn *sitter.Node) []string {
	body := fn.ChildByFieldName("body")
	if body == nil {
		return nil
	}
	if body.Kind() != "statement_block" {
		return []string{clip(strings.Join(strings.Fields(x.text(body)), " "), 120)}
	}
	var out []string
	seen := map[string]bool{}
	var walk func(n *sitter.Node)
	walk = func(n *sitter.Node) {
		switch n.Kind() {
		case "function_declaration", "function_expression", "function", "arrow_function",
			"generator_function_declaration", "method_definition", "class_declaration", "class":
			return
		case "return_statement":
			if n.NamedChildCount() > 0 && len(out) < 5 {
				e := clip(strings.Join(strings.Fields(x.text(n.NamedChild(0))), " "), 120)
				if !seen[e] {
					seen[e] = true
					out = append(out, e)
				}
			}
			return
		}
		for i := uint(0); i < n.NamedChildCount(); i++ {
			walk(n.NamedChild(i))
		}
	}
	walk(body)
	return out
}

func (x *extractor) param(p *sitter.Node) map[string]any {
	out := map[string]any{}
	switch p.Kind() {
	case "required_parameter", "optional_parameter":
		pat := p.ChildByFieldName("pattern")
		if pat != nil && pat.Kind() == "rest_pattern" {
			out["rest"] = true
			out["name"] = clip(strings.TrimPrefix(x.text(pat), "..."), 80)
		} else if pat != nil {
			out["name"] = clip(x.text(pat), 80)
		}
		if t := p.ChildByFieldName("type"); t != nil {
			out["type"] = typeText(x.text(t))
		}
		if v := p.ChildByFieldName("value"); v != nil {
			out["default"] = clip(x.text(v), 60)
		}
		if p.Kind() == "optional_parameter" {
			out["optional"] = true
		}
		for i := uint(0); i < p.NamedChildCount(); i++ {
			if c := p.NamedChild(i); c.Kind() == "accessibility_modifier" {
				out["property"] = x.text(c) // constructor parameter property
			}
		}
	case "assignment_pattern": // JS: a = 1
		out["name"] = clip(x.text(p.ChildByFieldName("left")), 80)
		out["default"] = clip(x.text(p.ChildByFieldName("right")), 60)
	case "rest_pattern":
		out["rest"] = true
		out["name"] = clip(strings.TrimPrefix(x.text(p), "..."), 80)
	default: // identifier, object_pattern, array_pattern
		out["name"] = clip(x.text(p), 80)
	}
	return out
}

// modifiers lists keywords such as async, static, get and visibility on n,
// plus export when n is directly exported.
func (x *extractor) modifiers(n *sitter.Node) []string {
	mods := []string{}
	if parent := n.Parent(); parent != nil && parent.Kind() == "export_statement" {
		mods = append(mods, "export")
		if hasToken(parent, "default") {
			mods = append(mods, "default")
		}
	}
	for i := uint(0); i < n.ChildCount(); i++ {
		c := n.Child(i)
		switch {
		case c.Kind() == "accessibility_modifier" || c.Kind() == "override_modifier":
			mods = append(mods, x.text(c))
		case !c.IsNamed():
			switch c.Kind() {
			case "async", "static", "get", "set", "readonly", "abstract":
				mods = append(mods, c.Kind())
			case "*":
				mods = append(mods, "generator")
			}
		}
	}
	if strings.HasPrefix(n.Kind(), "generator_function") {
		mods = append(mods, "generator")
	}
	return dedupe(mods)
}

// docComment returns the text of a /** */ comment directly above n, looking
// through export and variable declaration wrappers.
func (x *extractor) docComment(n *sitter.Node) string {
	cur := n
	for p := cur.Parent(); p != nil; p = cur.Parent() {
		k := p.Kind()
		if k != "export_statement" && k != "variable_declarator" && k != "lexical_declaration" && k != "variable_declaration" {
			break
		}
		cur = p
	}
	prev := cur.PrevSibling()
	if prev == nil || prev.Kind() != "comment" || prev.EndPosition().Row+1 < cur.StartPosition().Row {
		return ""
	}
	raw := x.text(prev)
	if !strings.HasPrefix(raw, "/**") {
		return ""
	}
	raw = strings.TrimSuffix(strings.TrimPrefix(raw, "/**"), "*/")
	var lines []string
	for _, l := range strings.Split(raw, "\n") {
		l = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(l), "*"))
		lines = append(lines, l)
	}
	return clip(strings.TrimSpace(strings.Join(lines, "\n")), 600)
}

// typeText normalizes a type annotation: drops the leading colon and collapses whitespace.
func typeText(s string) string {
	s = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(s), ":"))
	return clip(strings.Join(strings.Fields(s), " "), 160)
}

func clip(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n-1] + "…"
}

func dedupe(ss []string) []string {
	seen := map[string]bool{}
	out := ss[:0]
	for _, s := range ss {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	return out
}
