import type { QuadNode } from '../types/events'

export const ROOT_ID = '__root__'
export const ROOT_BOUNDS = { x: -12, z: -12, w: 24, h: 24 }

/**
 * Compute the bounding rect for the child at `childIndex` among `siblingCount`
 * siblings inside `parent`. Uses a sqrt-based grid that stays roughly square.
 */
export function computeChildBounds(
  parent: { x: number; z: number; w: number; h: number },
  childIndex: number,
  siblingCount: number,
): { x: number; z: number; w: number; h: number } {
  const n = Math.max(siblingCount, 1)
  const cols = Math.ceil(Math.sqrt(n))
  const rows = Math.ceil(n / cols)

  // padding proportional to parent size (4%)
  const padX = parent.w * 0.04
  const padZ = parent.h * 0.04

  const cellW = (parent.w - padX * (cols + 1)) / cols
  const cellH = (parent.h - padZ * (rows + 1)) / rows

  const col = childIndex % cols
  const row = Math.floor(childIndex / cols)

  return {
    x: parent.x + padX + col * (cellW + padX),
    z: parent.z + padZ + row * (cellH + padZ),
    w: Math.max(cellW, 0.15),
    h: Math.max(cellH, 0.15),
  }
}

/**
 * Recompute bounds for every direct child of `parentNode` (and recursively
 * their descendants) given the parent's current bounds.
 */
export function recomputeDescendants(
  parentNode: QuadNode,
  nodes: Record<string, QuadNode>,
): Record<string, QuadNode> {
  const updated: Record<string, QuadNode> = {}
  const n = parentNode.childIds.length

  for (let i = 0; i < n; i++) {
    const child = nodes[parentNode.childIds[i]]
    if (!child) continue

    const newBounds = computeChildBounds(parentNode.bounds, i, n)
    const updatedChild: QuadNode = { ...child, bounds: newBounds }
    updated[child.id] = updatedChild

    if (updatedChild.childIds.length > 0) {
      Object.assign(
        updated,
        recomputeDescendants(updatedChild, { ...nodes, ...updated }),
      )
    }
  }

  return updated
}

/** Break an absolute path into segments relative to the project root. */
export function getRelativeSegments(filePath: string, projectRoot: string): string[] {
  if (filePath.startsWith(projectRoot + '/')) {
    return filePath.slice(projectRoot.length + 1).split('/')
  }
  return [filePath.split('/').pop() ?? filePath]
}

/** Return the longest common ancestor directory of two paths. */
export function findCommonAncestor(a: string, b: string): string {
  const aParts = a.split('/')
  const bParts = b.split('/')
  let i = 0
  while (i < aParts.length && i < bParts.length && aParts[i] === bParts[i]) i++
  return aParts.slice(0, i).join('/')
}
