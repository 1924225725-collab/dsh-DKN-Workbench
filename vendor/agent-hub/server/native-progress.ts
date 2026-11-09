export interface NativeProgress {
  phase: 'connecting' | 'resuming' | 'sending' | 'waiting' | 'streaming'
  text?: string
  itemId?: string
  elapsedMs: number
  firstTextMs?: number
  preparationMs?: number
  reusedConnection?: boolean
}
export type ProgressListener = (progress: NativeProgress) => void

/** Preview is transient; a preview must never drive a handoff or acceptance. */
export function reportProgress(listener: ProgressListener | undefined, progress: NativeProgress) {
  try { listener?.(progress) } catch { /* A display subscriber cannot fail a native turn. */ }
}
