import type { EditorTool } from '@/composables/useEditorTools'

export interface PointerTarget {
  /// The press landed on the stage background rather than on a node.
  isStage: boolean
  /// The press landed on the transformer's own border or one of its anchors.
  onTransformer: boolean
  /// Empty for any node the editor did not create, such as a transformer anchor.
  id: string
}

export type PointerIntent =
  | { kind: 'paint' }
  | { kind: 'fill' }
  | { kind: 'pick' }
  | { kind: 'pan' }
  | { kind: 'select'; id: string }
  | { kind: 'transform' }

/// Decides what a press means before Konva sees it. The transformer must win over
/// everything else: its anchors carry no id, so treating them as background would
/// clear the selection and tear the handles away mid-resize.
export function pointerIntent(tool: EditorTool, target: PointerTarget): PointerIntent {
  if (tool === 'eyedropper') return { kind: 'pick' }
  if (tool === 'bucket') return { kind: 'fill' }
  if (tool !== 'select') return { kind: 'paint' }
  if (target.onTransformer) return { kind: 'transform' }
  if (target.isStage || target.id === '') return { kind: 'pan' }
  return { kind: 'select', id: target.id }
}
