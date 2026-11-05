import { FN_GAP, GROUP_HEAD, GROUP_PAD, NODE_H, NODE_W, fileKey, type GNode, type XY } from "./types";

/** Space between file boxes. */
const FILE_GAP = 40;

export interface Layout {
  /** File groups: absolute. Functions: relative to their file group. */
  positions: Record<string, XY>;
  /** Size of each file group. */
  sizes: Record<string, { width: number; height: number }>;
}

/**
 * Files are stacked in rows (path order, so a directory stays together) to
 * fill a viewport of the given aspect ratio (width / height). Inside a file,
 * functions sit in a compact grid in source order.
 */
export function layout(nodes: GNode[], aspect = 16 / 10): Layout {
  const files = new Map<string, GNode[]>();
  for (const n of nodes) {
    const k = fileKey(n.filePath);
    files.set(k, [...(files.get(k) ?? []), n]);
  }
  const out: Layout = { positions: {}, sizes: {} };

  // Lay out each file on its own.
  const boxes: { key: string; width: number; height: number }[] = [];
  for (const key of [...files.keys()].sort()) {
    const fns = files.get(key)!.sort((a, b) => a.startLine - b.startLine || a.key.localeCompare(b.key));
    // Columns that make the box roughly square.
    const cols = Math.max(1, Math.round(Math.sqrt((fns.length * (NODE_H + FN_GAP)) / (NODE_W + FN_GAP))));
    const rows = Math.ceil(fns.length / cols);
    fns.forEach((n, i) => {
      out.positions[n.key] = { x: GROUP_PAD + (i % cols) * (NODE_W + FN_GAP), y: GROUP_HEAD + GROUP_PAD / 2 + Math.floor(i / cols) * (NODE_H + FN_GAP) };
    });
    const width = 2 * GROUP_PAD + cols * NODE_W + (cols - 1) * FN_GAP;
    const height = GROUP_HEAD + GROUP_PAD / 2 + rows * NODE_H + (rows - 1) * FN_GAP + GROUP_PAD;
    out.sizes[key] = { width, height };
    boxes.push({ key, width, height });
  }

  // Wrap files into rows about as wide as the viewport's shape allows.
  const area = boxes.reduce((s, b) => s + (b.width + FILE_GAP) * (b.height + FILE_GAP), 0);
  const rowWidth = Math.max(Math.sqrt(area * aspect), ...boxes.map((b) => b.width));
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const b of boxes) {
    if (x > 0 && x + b.width > rowWidth) {
      x = 0;
      y += rowH + FILE_GAP;
      rowH = 0;
    }
    out.positions[b.key] = { x, y };
    x += b.width + FILE_GAP;
    rowH = Math.max(rowH, b.height);
  }
  return out;
}
