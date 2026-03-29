import type { MapNode } from '../../types/mindMap'

export const NW     = 178   // node width
export const NH_HDR = 36    // header height
export const NH_SYM = 21    // height per symbol row
export const NH_BB  = 44    // black-box node height
export const NH_EXT = 40    // external (npm) node height
export const NH_PAD = 10    // bottom padding on explored nodes

export function nodeH(n: MapNode): number {
  if (n.isExternal) return NH_EXT
  if (n.isBlackBox) return NH_BB
  return NH_HDR + (n.symbols?.length ?? 0) * NH_SYM + NH_PAD
}

export const KIND_META: Record<string, { icon: string; color: string; bg: string }> = {
  function: { icon: 'ƒ', color: '#60a5fa', bg: 'rgba(96,165,250,.12)' },
  class:    { icon: 'c', color: '#a78bfa', bg: 'rgba(139,92,246,.15)' },
  type:     { icon: 'T', color: '#22d3ee', bg: 'rgba(6,182,212,.12)'  },
  variable: { icon: '◉', color: '#fbbf24', bg: 'rgba(245,158,11,.1)'  },
}
