import type { Doc, Id } from "../_generated/dataModel";

/**
 * Activities nest to any depth: an activity with `parentId` is a sub-activity of
 * that activity. `order` is the position among siblings (same day, same parent).
 * These helpers are pure so the backend and the optimistic updates share them.
 */
export type ActivityNode = Doc<"activities"> & { children: ActivityNode[] };

/** Builds the nested tree for one day from its flat activity rows. */
export function buildTree(rows: Doc<"activities">[], parentId?: Id<"activities">): ActivityNode[] {
  return rows
    .filter((a) => a.parentId === parentId)
    .sort((a, b) => a.order - b.order)
    .map((a) => ({ ...a, children: buildTree(rows, a._id) }));
}

/** Every node in the tree, depth first. */
export const flatten = (nodes: ActivityNode[]): ActivityNode[] => nodes.flatMap((n) => [n, ...flatten(n.children)]);

export const findNode = (nodes: ActivityNode[], id: Id<"activities">): ActivityNode | undefined =>
  flatten(nodes).find((n) => n._id === id);

/** Applies `fn` to every node, rebuilding the tree immutably. */
export const mapTree = (nodes: ActivityNode[], fn: (n: ActivityNode) => ActivityNode): ActivityNode[] =>
  nodes.map((n) => fn({ ...n, children: mapTree(n.children, fn) }));

/** Removes a node (and its subtree) and renumbers the siblings it leaves behind. */
export function removeNode(nodes: ActivityNode[], id: Id<"activities">): ActivityNode[] {
  const kept = nodes.filter((n) => n._id !== id);
  const removedHere = kept.length !== nodes.length;
  return kept.map((n, i) => ({ ...n, order: removedHere ? i : n.order, children: removeNode(n.children, id) }));
}

/** Inserts `node` at `index` among the children of `parentId` (top level when undefined). */
export function insertNode(
  nodes: ActivityNode[],
  parentId: Id<"activities"> | undefined,
  index: number,
  node: ActivityNode,
): ActivityNode[] {
  const place = (list: ActivityNode[]) => {
    const next = [...list];
    next.splice(Math.max(0, Math.min(index, next.length)), 0, { ...node, parentId });
    return next.map((n, order) => ({ ...n, order }));
  };
  if (parentId === undefined) return place(nodes);
  return nodes.map((n) => (n._id === parentId ? { ...n, children: place(n.children) } : { ...n, children: insertNode(n.children, parentId, index, node) }));
}

/** Ids of a node's ancestors, nearest first. */
export function ancestorIds(nodes: ActivityNode[], id: Id<"activities">): Id<"activities">[] {
  const byId = new Map(flatten(nodes).map((n) => [n._id, n]));
  const ids: Id<"activities">[] = [];
  for (let cur = byId.get(id)?.parentId; cur; cur = byId.get(cur)?.parentId) ids.push(cur);
  return ids;
}
