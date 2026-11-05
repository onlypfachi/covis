import { expect, test } from "@playwright/test";
import { layout } from "../src/canvas/layout";
import { GROUP_HEAD, NODE_H, NODE_W, fileKey, type GNode } from "../src/canvas/types";

// Unit tests for the canvas layout: a pure function, no browser needed.

function fn(path: string, name: string, line: number): GNode {
  const key = `function:${path}#${name}`;
  return { id: key, key, kind: "function", name, qualifiedName: name, filePath: path, startLine: line, endLine: line + 1, parentKey: fileKey(path), meta: {} };
}

/** n files of one function each. */
const files = (n: number) => Array.from({ length: n }, (_, i) => fn(`src/f${String(i).padStart(2, "0")}.ts`, "a", 1));

type Box = { x: number; y: number; width: number; height: number };
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test("no functions: empty layout", () => {
  expect(layout([])).toEqual({ positions: {}, sizes: {} });
});

test("functions sit inside their file box, in source order, without overlapping", () => {
  // Twelve functions, given out of source order.
  const names = Array.from({ length: 12 }, (_, i) => `f${String(i).padStart(2, "0")}`);
  const nodes = [...names].reverse().map((name) => fn("src/a.ts", name, Number(name.slice(1)) * 10 + 1));
  const { positions, sizes } = layout(nodes);
  const size = sizes[fileKey("src/a.ts")];
  const boxes = nodes.map((n) => ({ ...positions[n.key], width: NODE_W, height: NODE_H }));
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0);
    expect(b.y).toBeGreaterThanOrEqual(GROUP_HEAD);
    expect(b.x + b.width).toBeLessThanOrEqual(size.width);
    expect(b.y + b.height).toBeLessThanOrEqual(size.height);
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  // Many functions wrap into more than one column instead of one tall column.
  expect(new Set(boxes.map((b) => b.x)).size).toBeGreaterThan(1);
  // Reading order (row by row) follows the source.
  const order = [...nodes].sort((a, b) => positions[a.key].y - positions[b.key].y || positions[a.key].x - positions[b.key].x).map((n) => n.name);
  expect(order).toEqual(names);
});

test("files are stacked in rows, in path order, without overlapping", () => {
  const nodes = files(12);
  const { positions, sizes } = layout(nodes, 16 / 10);
  const keys = nodes.map((n) => fileKey(n.filePath));
  const boxes = keys.map((k) => ({ ...positions[k], ...sizes[k] }));
  expect(new Set(boxes.map((b) => b.y)).size).toBeGreaterThan(1);
  expect(new Set(boxes.map((b) => b.x)).size).toBeGreaterThan(1);
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  // Path order: left to right, then the next row.
  const order = [...keys].sort((a, b) => positions[a].y - positions[b].y || positions[a].x - positions[b].x);
  expect(order).toEqual([...keys].sort());
});

test("the stack follows the viewport's shape", () => {
  const nodes = files(12);
  const extent = (aspect: number) => {
    const { positions, sizes } = layout(nodes, aspect);
    const keys = nodes.map((n) => fileKey(n.filePath));
    const w = Math.max(...keys.map((k) => positions[k].x + sizes[k].width));
    const h = Math.max(...keys.map((k) => positions[k].y + sizes[k].height));
    return w / h;
  };
  expect(extent(3)).toBeGreaterThan(extent(0.5));
});

test("one file wider than the row still gets placed", () => {
  const big = Array.from({ length: 30 }, (_, i) => fn("src/big.ts", `f${i}`, i));
  const { positions, sizes } = layout([...big, fn("src/small.ts", "s", 1)], 0.1);
  expect(positions[fileKey("src/big.ts")]).toEqual({ x: 0, y: 0 });
  // The next file wraps below rather than overlapping.
  expect(positions[fileKey("src/small.ts")].y).toBeGreaterThanOrEqual(sizes[fileKey("src/big.ts")].height);
});
