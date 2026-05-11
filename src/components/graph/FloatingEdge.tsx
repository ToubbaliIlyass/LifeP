'use client'

import { BaseEdge, getStraightPath, useInternalNode, type EdgeProps } from '@xyflow/react'

function circleCenter(node: ReturnType<typeof useInternalNode>) {
  if (!node) return null
  const pos = node.internals.positionAbsolute
  const w = node.measured?.width ?? 90
  const r = (node.data as Record<string, unknown>)?.circleR as number ?? 19
  // Circle is at the top of the node div, centered horizontally
  return { cx: pos.x + w / 2, cy: pos.y + r, r }
}

export function FloatingEdge({
  id, source, target,
  style, label, labelStyle, labelBgPadding, labelBgBorderRadius, markerEnd,
}: EdgeProps) {
  const srcNode = useInternalNode(source)
  const tgtNode = useInternalNode(target)

  const src = circleCenter(srcNode)
  const tgt = circleCenter(tgtNode)

  if (!src || !tgt) return null

  const dx = tgt.cx - src.cx
  const dy = tgt.cy - src.cy
  const dist = Math.sqrt(dx * dx + dy * dy) || 1

  // Start/end at the circle borders, not the centers
  const sx = src.cx + (dx / dist) * src.r
  const sy = src.cy + (dy / dist) * src.r
  const tx = tgt.cx - (dx / dist) * tgt.r
  const ty = tgt.cy - (dy / dist) * tgt.r

  const [path, labelX, labelY] = getStraightPath({
    sourceX: sx, sourceY: sy,
    targetX: tx, targetY: ty,
  })

  return (
    <BaseEdge
      id={id}
      path={path}
      style={style}
      label={label}
      labelX={labelX}
      labelY={labelY}
      labelStyle={labelStyle}
      labelBgPadding={labelBgPadding as [number, number] | undefined}
      labelBgBorderRadius={labelBgBorderRadius}
      markerEnd={markerEnd}
    />
  )
}
