/**
 * Node positions for the two layouts. Both are deterministic: the same graph always lands in the same
 * place, so a refresh or a click does not shuffle the picture. ECharts then fits the coordinates into
 * the panel (graph series with `layout: "none"`).
 */

export interface Point {
  x: number;
  y: number;
}

interface Link {
  source: string;
  target: string;
}

const COLUMN_GAP = 260;
const ROW_GAP = 90;

/**
 * Left-to-right layers, one block per connected group of services, stacked top to bottom with the
 * largest first so unrelated groups do not interleave and cross each other's edges. `roots` (the
 * requester of a flow) start the walk, so they sit alone in the first column even when a call further
 * down loops back to them.
 */
export function hierarchicalLayout(
  ids: string[],
  links: Link[],
  roots: string[] = [],
): Map<string, Point> {
  const points = new Map<string, Point>();
  let top = 0;
  for (const group of components(ids, links)) {
    const set = new Set(group);
    const part = layeredLayout(
      group,
      links.filter((l) => set.has(l.source) && set.has(l.target)),
      new Set(roots),
    );
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of part.values()) {
      minY = Math.min(minY, p.y);
      maxY = Math.max(maxY, p.y);
    }
    for (const [id, p] of part) points.set(id, { x: p.x, y: p.y - minY + top });
    top += maxY - minY + ROW_GAP * 1.5;
  }
  return points;
}

/** Weakly connected components, largest first, ties by name. */
function components(ids: string[], links: Link[]): string[][] {
  const parent = new Map<string, string>(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(x, r);
    return r;
  };
  for (const l of links)
    if (parent.has(l.source) && parent.has(l.target))
      parent.set(find(l.source), find(l.target));
  const groups = new Map<string, string[]>();
  for (const id of [...ids].sort()) {
    const r = find(id);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(id);
  }
  return [...groups.values()].sort(
    (a, b) => b.length - a.length || a[0]!.localeCompare(b[0]!),
  );
}

/**
 * Left-to-right layers: callers left of what they call. Cycles are broken by dropping the edges a
 * depth-first walk finds going back, each node's column is its longest path from a root, and nodes
 * within a column are ordered by the average position of their neighbours (a few barycentre sweeps)
 * to cut down on crossings.
 */
function layeredLayout(
  ids: string[],
  links: Link[],
  roots: Set<string>,
): Map<string, Point> {
  const out = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const id of ids) {
    out.set(id, []);
    indegree.set(id, 0);
  }
  for (const l of links) {
    if (!out.has(l.source) || !out.has(l.target) || l.source === l.target)
      continue;
    out.get(l.source)!.push(l.target);
    indegree.set(l.target, (indegree.get(l.target) ?? 0) + 1);
  }

  // Break cycles: walk from the roots first so the natural direction wins.
  const order = [...ids].sort(
    (a, b) =>
      Number(roots.has(b)) - Number(roots.has(a)) ||
      (indegree.get(a) ?? 0) - (indegree.get(b) ?? 0) ||
      a.localeCompare(b),
  );
  const state = new Map<string, 1 | 2>(); // 1 = on stack, 2 = done
  const dag = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const root of order) {
    if (state.has(root)) continue;
    const stack: Array<[string, number]> = [[root, 0]];
    state.set(root, 1);
    while (stack.length) {
      const top = stack[stack.length - 1]!;
      const [v, i] = top;
      const next = out.get(v)!;
      if (i >= next.length) {
        state.set(v, 2);
        stack.pop();
        continue;
      }
      top[1] = i + 1;
      const w = next[i]!;
      const st = state.get(w);
      if (st === 1) continue; // back edge: drop it
      dag.get(v)!.push(w);
      if (st === undefined) {
        state.set(w, 1);
        stack.push([w, 0]);
      }
    }
  }

  // Longest path from a root, in topological order.
  const indeg = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const targets of dag.values())
    for (const t of targets) indeg.set(t, (indeg.get(t) ?? 0) + 1);
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => indeg.get(id) === 0).sort();
  while (queue.length) {
    const v = queue.shift()!;
    for (const w of dag.get(v)!) {
      rank.set(w, Math.max(rank.get(w)!, rank.get(v)! + 1));
      indeg.set(w, indeg.get(w)! - 1);
      if (indeg.get(w) === 0) queue.push(w);
    }
  }

  const columns: string[][] = [];
  for (const id of [...ids].sort()) {
    const r = rank.get(id) ?? 0;
    (columns[r] ??= []).push(id);
  }

  // Neighbours in both directions, for the barycentre sweeps.
  const preds = new Map<string, string[]>(ids.map((id) => [id, []]));
  const succs = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const [v, targets] of dag)
    for (const w of targets) {
      succs.get(v)!.push(w);
      preds.get(w)!.push(v);
    }
  const pos = new Map<string, number>();
  const index = (): void =>
    columns.forEach((col) => col.forEach((id, i) => pos.set(id, i)));
  index();
  const sweep = (col: string[], neighbours: Map<string, string[]>): void => {
    const key = new Map<string, number>();
    col.forEach((id, i) => {
      const ns = neighbours.get(id)!.filter((n) => pos.has(n));
      key.set(
        id,
        ns.length ? ns.reduce((sum, n) => sum + pos.get(n)!, 0) / ns.length : i,
      );
    });
    col.sort((a, b) => key.get(a)! - key.get(b)! || a.localeCompare(b));
  };
  for (let pass = 0; pass < 6; pass++) {
    if (pass % 2 === 0)
      for (let r = 1; r < columns.length; r++) sweep(columns[r]!, preds);
    else
      for (let r = columns.length - 2; r >= 0; r--) sweep(columns[r]!, succs);
    index();
  }

  const points = new Map<string, Point>();
  columns.forEach((col, r) =>
    col.forEach((id, i) =>
      points.set(id, {
        x: r * COLUMN_GAP,
        y: (i - (col.length - 1) / 2) * ROW_GAP,
      }),
    ),
  );
  return points;
}

/**
 * Force-directed (Fruchterman-Reingold) layout seeded with the hierarchical positions, so it starts
 * untangled and keeps a rough left-to-right flow. A fixed number of iterations with a cooling
 * temperature keeps it deterministic and cheap for the few hundred nodes a namespace has.
 */
export function forceLayout(
  ids: string[],
  links: Link[],
  roots: string[] = [],
): Map<string, Point> {
  const seed = hierarchicalLayout(ids, links, roots);
  const n = ids.length;
  if (n <= 1) return seed;

  const k = 110; // ideal edge length
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  const idx = new Map<string, number>();
  ids.forEach((id, i) => {
    const p = seed.get(id)!;
    // Squash the seed so the forces, not the column gap, decide the spacing.
    xs[i] = p.x * 0.5;
    ys[i] = p.y * 0.8 + ((i % 3) - 1) * 3; // tiny deterministic jitter breaks exact symmetry
    idx.set(id, i);
  });
  const pairs: Array<[number, number]> = [];
  for (const l of links) {
    const a = idx.get(l.source);
    const b = idx.get(l.target);
    if (a !== undefined && b !== undefined && a !== b) pairs.push([a, b]);
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const iterations = 300;
  let temperature = k * 2;
  for (let it = 0; it < iterations; it++) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let ddx = xs[i]! - xs[j]!;
        let ddy = ys[i]! - ys[j]!;
        let d2 = ddx * ddx + ddy * ddy;
        if (d2 < 0.01) {
          ddx = 0.1;
          ddy = 0.1;
          d2 = 0.02;
        }
        const f = (k * k) / d2; // repulsion k²/d, divided by d again for the unit vector
        dx[i] = dx[i]! + ddx * f;
        dy[i] = dy[i]! + ddy * f;
        dx[j] = dx[j]! - ddx * f;
        dy[j] = dy[j]! - ddy * f;
      }
    }
    for (const [a, b] of pairs) {
      const ddx = xs[a]! - xs[b]!;
      const ddy = ys[a]! - ys[b]!;
      const d = Math.sqrt(ddx * ddx + ddy * ddy) || 0.1;
      const f = d / k; // attraction d²/k, divided by d for the unit vector
      dx[a] = dx[a]! - ddx * f;
      dy[a] = dy[a]! - ddy * f;
      dx[b] = dx[b]! + ddx * f;
      dy[b] = dy[b]! + ddy * f;
    }
    for (let i = 0; i < n; i++) {
      // Gravity keeps separate components from drifting apart.
      dx[i] = dx[i]! - xs[i]! * 0.02;
      dy[i] = dy[i]! - ys[i]! * 0.02;
      const d = Math.sqrt(dx[i]! * dx[i]! + dy[i]! * dy[i]!) || 1;
      const step = Math.min(d, temperature);
      xs[i] = xs[i]! + (dx[i]! / d) * step;
      ys[i] = ys[i]! + (dy[i]! / d) * step;
    }
    temperature = Math.max(1, temperature * 0.97);
  }

  const points = new Map<string, Point>();
  ids.forEach((id, i) => points.set(id, { x: xs[i]!, y: ys[i]! }));
  return points;
}
