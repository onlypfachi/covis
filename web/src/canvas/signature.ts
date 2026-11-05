/** Function signature as recorded by the indexer in node meta. */
export interface Param {
  name: string;
  type?: string;
  default?: string;
  optional?: boolean;
  rest?: boolean;
  /** Visibility when this is a TypeScript constructor parameter property. */
  property?: string;
  /** @param description from the doc comment. */
  doc?: string;
}

export interface Signature {
  params: Param[];
  /** Annotated return type. */
  returns?: string;
  /** @returns description from the doc comment. */
  returnsDoc?: string;
  /** Expressions of the function's return statements. */
  returnExprs: string[];
  modifiers: string[];
  /** Doc comment summary, without tags. */
  doc?: string;
}

export const FUNCTION_KINDS = new Set(["function", "method"]);

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

export function readSignature(meta: Record<string, unknown> | null | undefined): Signature | null {
  if (!meta || !Array.isArray(meta.params)) return null;
  return {
    params: (meta.params as Param[]).filter((p) => p && typeof p.name === "string"),
    returns: str(meta.returns),
    returnsDoc: str(meta.returnsDoc),
    returnExprs: Array.isArray(meta.returnExprs) ? (meta.returnExprs as string[]) : [],
    modifiers: Array.isArray(meta.modifiers) ? (meta.modifiers as string[]) : [],
    doc: str(meta.doc),
  };
}

/** The result type: the annotation when there is one, otherwise what can be
 * safely inferred from the code, marked as such. */
export function resultType(sig: Signature, name: string, owner: string | null): { type: string; source: "annotated" | "inferred" | "unknown" } {
  if (sig.returns) return { type: sig.returns, source: "annotated" };
  const async = sig.modifiers.includes("async");
  if (name === "constructor") return { type: owner ?? "instance", source: "inferred" };
  if (sig.returnExprs.length === 0) return { type: async ? "Promise<void>" : "void", source: "inferred" };
  return { type: async ? "Promise<unknown>" : "unknown", source: "unknown" };
}
