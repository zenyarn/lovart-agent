type DraftNode = {
  id: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
};
type CanvasItem = {
  id: string;
  position: { x: number; y: number };
  width?: number;
  height?: number;
  style?: object;
  selected?: boolean;
  data: { asset?: unknown };
};
export function mergeCanvasDraft<T extends CanvasItem>(
  server: T[],
  local: T[],
  removed: ReadonlySet<string>,
): T[] {
  const byId = new Map(local.map((n) => [n.id, n]));
  return server
    .filter((n) => !removed.has(n.id))
    .map((n) => {
      const own = byId.get(n.id);
      return own
        ? {
            ...n,
            position: own.position,
            width: own.width,
            height: own.height,
            style: own.style,
            selected: own.selected,
          }
        : n;
    });
}
export function restoreCanvasDraft<T extends CanvasItem>(
  server: T[],
  draft: DraftNode[],
): T[] {
  const byId = new Map(draft.map((n) => [n.id, n]));
  return server
    .filter((n) => byId.has(n.id) || !n.data.asset)
    .map((n) => {
      const own = byId.get(n.id);
      if (!own) return n;
      const width = own.width ?? n.width,
        height = own.height ?? n.height;
      return {
        ...n,
        position: { x: own.x, y: own.y },
        width,
        height,
        style: { ...n.style, width, height },
      };
    });
}
type CanvasSnapshot = {
  nodes: DraftNode[];
  viewport: { x: number; y: number; zoom: number };
  settings: unknown;
};
/** Revision can advance while the identical snapshot is being saved. */
export function canvasDraftMatches(a: CanvasSnapshot, b: CanvasSnapshot) {
  const close = (x: number | undefined, y: number | undefined) =>
    x === y ||
    (typeof x === "number" && typeof y === "number" && Math.abs(x - y) < 1e-6);
  if (
    !Array.isArray(a.nodes) ||
    a.nodes.length !== b.nodes.length ||
    !a.viewport
  )
    return false;
  const target = new Map(b.nodes.map((n) => [n.id, n]));
  return (
    a.nodes.every((n) => {
      const t = target.get(n.id);
      return (
        t &&
        close(n.x, t.x) &&
        close(n.y, t.y) &&
        close(n.width, t.width) &&
        close(n.height, t.height)
      );
    }) &&
    close(a.viewport.x, b.viewport.x) &&
    close(a.viewport.y, b.viewport.y) &&
    close(a.viewport.zoom, b.viewport.zoom) &&
    JSON.stringify(a.settings) === JSON.stringify(b.settings)
  );
}
