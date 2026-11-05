import { resultType, type Signature } from "../canvas/signature";
import type { GNode } from "../canvas/types";

/** 1. What the function is: name, modifiers, doc summary and where it lives. */
export function FunctionDescription({ node, sig }: { node: GNode; sig: Signature }) {
  const owner = node.kind === "method" ? node.qualifiedName.split(".").slice(0, -1).join(".") : null;
  return (
    <div className="section" aria-label="Description">
      <h3>Description</h3>
      <h2 className="mono" style={{ overflowWrap: "anywhere" }}>{node.kind === "method" ? node.qualifiedName : node.name}</h2>
      <div className="faint" style={{ fontSize: 12 }}>
        {[...sig.modifiers, node.kind].join(" ")}{owner && <> of <span className="mono">{owner}</span></>}
      </div>
      {sig.doc ? (
        <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{sig.doc}</p>
      ) : (
        <p className="faint" style={{ margin: "8px 0 0" }}>No doc comment in the source.</p>
      )}
      <div className="faint mono" style={{ marginTop: 8, fontSize: 11 }}>{node.filePath}:{node.startLine}–{node.endLine}</div>
    </div>
  );
}

/** 2. Parameters with type, default and @param description. */
export function FunctionInputs({ sig }: { sig: Signature }) {
  return (
    <div className="section" aria-label="Inputs">
      <h3>Inputs</h3>
      {sig.params.length === 0 ? (
        <p className="faint" style={{ margin: 0 }}>None</p>
      ) : (
        <ul className="params">
          {sig.params.map((p, i) => (
            <li key={i}>
              <div className="row wrap" style={{ gap: 6 }}>
                <span className="mono">
                  {p.rest && <span className="faint">…</span>}
                  {p.name}
                  {p.optional && <span className="faint">?</span>}
                </span>
                <span className="mono type">{p.type ?? <span className="faint">untyped</span>}</span>
                {p.default !== undefined && <span className="faint">default <span className="mono">{p.default}</span></span>}
                {p.property && <span className="faint">{p.property} field</span>}
              </div>
              {p.doc && <div className="muted">{p.doc}</div>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** 3. The whole function, with its real line numbers from the file. */
export function FunctionCode({ source, startLine }: { source: string; startLine: number }) {
  const lines = source.replace(/\n$/, "").split("\n");
  return (
    <div className="section" aria-label="Function">
      <h3>Function</h3>
      <pre className="source numbered">
        {lines.map((l, i) => (
          <div key={i}><span className="ln">{startLine + i}</span>{l || " "}</div>
        ))}
      </pre>
    </div>
  );
}

/** 4. What comes out: the result type, its description and the returned expressions. */
export function FunctionResult({ node, sig }: { node: GNode; sig: Signature }) {
  const owner = node.kind === "method" ? node.qualifiedName.split(".").slice(0, -1).join(".") : null;
  const t = resultType(sig, node.name, owner);
  return (
    <div className="section" aria-label="Result">
      <h3>Result</h3>
      <dl className="kv">
        <dt>type</dt>
        <dd>
          <span className="mono type">{t.type}</span>{" "}
          {t.source === "inferred" && <span className="pill" title="No return type annotation; inferred from the code">inferred</span>}
          {t.source === "unknown" && <span className="pill warn" title="No return type annotation">not annotated</span>}
        </dd>
        {sig.returnsDoc && (<><dt>meaning</dt><dd>{sig.returnsDoc}</dd></>)}
        <dt>returns</dt>
        <dd>
          {sig.returnExprs.length === 0 ? (
            <span className="faint">{node.name === "constructor" ? "a new instance" : "nothing (no return value)"}</span>
          ) : (
            <ul className="returns">
              {sig.returnExprs.map((e, i) => <li key={i} className="mono">{e}</li>)}
            </ul>
          )}
        </dd>
      </dl>
    </div>
  );
}
