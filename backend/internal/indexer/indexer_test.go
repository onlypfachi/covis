package indexer

import (
	"encoding/json"
	"flag"
	"os"
	"strings"
	"testing"
)

var update = flag.Bool("update", false, "rewrite golden files")

const (
	ctrl    = "src/payments/payment.controller.ts"
	svc     = "src/payments/payment.service.ts"
	gateway = "src/payments/stripe.gateway.ts"
)

func indexFixture(t *testing.T) *Graph {
	t.Helper()
	g, err := Index("testdata/sample-ts", "sample-ts")
	if err != nil {
		t.Fatal(err)
	}
	return g
}

func hasEdge(g *Graph, kind, src, dst string) (Edge, bool) {
	for _, e := range g.Edges {
		if e.Kind == kind && e.Source == src && e.Target == dst {
			return e, true
		}
	}
	return Edge{}, false
}

func TestRelationships(t *testing.T) {
	g := indexFixture(t)
	want := []struct {
		kind, src, dst string
		inferred       bool
	}{
		// File imports, including tsconfig path aliases and barrel files.
		{EdgeImports, FileKey(ctrl), FileKey(svc), false},
		{EdgeImports, FileKey(svc), FileKey(gateway), false},
		{EdgeImports, FileKey(gateway), FileKey("src/lib/base-gateway.ts"), false},
		{EdgeImports, FileKey(gateway), ModuleKey("stripe"), false},
		{EdgeImports, FileKey("src/main.ts"), FileKey("src/payments/index.ts"), false},
		{EdgeImports, FileKey("src/main.ts"), FileKey("src/http/server.js"), false},
		// Calls resolved through parameter properties, field initializers and this.
		{EdgeCalls, SymbolKey(KindMethod, ctrl, "PaymentController.create"), SymbolKey(KindMethod, svc, "PaymentService.charge"), false},
		{EdgeCalls, SymbolKey(KindMethod, ctrl, "PaymentController.create"), SymbolKey(KindFunction, ctrl, "parseAmount"), false},
		{EdgeCalls, SymbolKey(KindMethod, svc, "PaymentService.charge"), SymbolKey(KindMethod, svc, "PaymentService.validate"), false},
		{EdgeCalls, SymbolKey(KindMethod, svc, "PaymentService.charge"), SymbolKey(KindMethod, gateway, "StripeGateway.createCharge"), false},
		// Inherited method via extends across a path alias.
		{EdgeCalls, SymbolKey(KindMethod, gateway, "StripeGateway.createCharge"), SymbolKey(KindMethod, "src/lib/base-gateway.ts", "BaseGateway.log"), false},
		// Through a barrel file with export * and an aliased re-export.
		{EdgeCalls, SymbolKey(KindFunction, "src/main.ts", "start"), SymbolKey(KindClass, svc, "PaymentService"), false},
		{EdgeCalls, SymbolKey(KindFunction, "src/main.ts", "start"), SymbolKey(KindClass, ctrl, "PaymentController"), false},
		// Namespace import.
		{EdgeCalls, SymbolKey(KindFunction, "src/main.ts", "start"), SymbolKey(KindFunction, "src/http/server.js", "listen"), false},
		// Heritage.
		{EdgeExtends, SymbolKey(KindClass, gateway, "StripeGateway"), SymbolKey(KindClass, "src/lib/base-gateway.ts", "BaseGateway"), false},
		{EdgeImplements, SymbolKey(KindClass, svc, "PaymentService"), SymbolKey(KindInterface, "src/payments/types.ts", "PaymentProcessor"), false},
		// Tests and exports.
		{EdgeTests, FileKey("src/payments/payment.service.test.ts"), FileKey(svc), false},
		{EdgeExports, FileKey(svc), SymbolKey(KindClass, svc, "PaymentService"), false},
		{EdgeContains, SymbolKey(KindClass, svc, "PaymentService"), SymbolKey(KindMethod, svc, "PaymentService.charge"), false},
	}
	for _, w := range want {
		e, ok := hasEdge(g, w.kind, w.src, w.dst)
		if !ok {
			t.Errorf("missing %s edge %s -> %s", w.kind, w.src, w.dst)
			continue
		}
		if e.Inferred != w.inferred {
			t.Errorf("%s %s -> %s inferred=%v", w.kind, w.src, w.dst, e.Inferred)
		}
	}
}

func nodeByKey(g *Graph, key string) *Node {
	for i := range g.Nodes {
		if g.Nodes[i].Key == key {
			return &g.Nodes[i]
		}
	}
	return nil
}

func TestSignatures(t *testing.T) {
	g := indexFixture(t)
	charge := nodeByKey(g, SymbolKey(KindMethod, svc, "PaymentService.charge"))
	got, _ := json.Marshal(charge.Meta)
	want := `{"doc":"Charges the customer.\nAmounts are in minor units.","modifiers":["async"],` +
		`"params":[{"doc":"Amount to charge, in cents.","name":"amount","type":"number"},{"default":"'usd'","doc":"ISO currency code","name":"currency","type":"string"},{"name":"tags","rest":true,"type":"string[]"}],` +
		`"returnExprs":["this.gateway.createCharge({ amount, currency })"],"returns":"Promise\u003cunknown\u003e","returnsDoc":"The gateway's charge record."}`
	if string(got) != want {
		t.Errorf("charge meta:\n got %s\nwant %s", got, want)
	}

	ctor := nodeByKey(g, SymbolKey(KindMethod, ctrl, "PaymentController.constructor"))
	got, _ = json.Marshal(ctor.Meta["params"])
	if string(got) != `[{"name":"payments","property":"private","type":"PaymentService"}]` {
		t.Errorf("constructor params: %s", got)
	}

	toCents := nodeByKey(g, SymbolKey(KindFunction, gateway, "toCents"))
	got, _ = json.Marshal(toCents.Meta)
	if string(got) != `{"modifiers":["export"],"params":[{"name":"amount","type":"number"},{"name":"rate","optional":true,"type":"number"}],"returnExprs":["Math.round(amount * (rate ?? 100))"],"returns":"number"}` {
		t.Errorf("arrow function meta: %s", got)
	}

	// No return value: nothing listed, so the UI can infer void.
	validate := nodeByKey(g, SymbolKey(KindMethod, svc, "PaymentService.validate"))
	if _, ok := validate.Meta["returnExprs"]; ok {
		t.Errorf("validate has return expressions: %v", validate.Meta["returnExprs"])
	}
	if mods := validate.Meta["modifiers"]; len(mods.([]string)) != 1 || mods.([]string)[0] != "private" {
		t.Errorf("validate modifiers = %v", mods)
	}
}

func TestImportsAndCallsAreDistinct(t *testing.T) {
	g := indexFixture(t)
	for _, e := range g.Edges {
		if e.Kind == EdgeCalls && strings.HasPrefix(e.Source, KindFile+":") {
			t.Errorf("call edge from a file node: %+v", e)
		}
		if e.Kind == EdgeImports && !strings.HasPrefix(e.Source, KindFile+":") {
			t.Errorf("import edge from a non-file node: %+v", e)
		}
	}
}

func TestSkipsNodeModulesAndKeysAreStable(t *testing.T) {
	a, b := indexFixture(t), indexFixture(t)
	for _, n := range a.Nodes {
		if strings.Contains(n.Key, "node_modules") {
			t.Errorf("indexed vendored file %s", n.Key)
		}
	}
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	if string(ja) != string(jb) {
		t.Error("indexing is not deterministic")
	}
}

func TestGolden(t *testing.T) {
	g := indexFixture(t)
	got, _ := json.MarshalIndent(g, "", "  ")
	const golden = "testdata/sample-ts.golden.json"
	if *update {
		if err := os.WriteFile(golden, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(golden)
	if err != nil {
		t.Fatalf("%v (run go test -update)", err)
	}
	if string(got) != string(want) {
		t.Error("graph differs from golden; inspect and run go test ./internal/indexer -update")
	}
}
