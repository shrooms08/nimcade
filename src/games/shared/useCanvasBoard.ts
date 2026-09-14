import { useEffect, useRef } from 'react'
import { MAX_DPR } from './effects'

/** Canvas size in CSS px plus the capped device pixel ratio. */
export interface BoardView {
  width: number
  height: number
  dpr: number
}

/** Picks the canvas CSS size for a board of the given size. */
export type Fit = (boardWidth: number, boardHeight: number) => { width: number; height: number }

export const fillBoard: Fit = (width, height) => ({ width: Math.floor(width), height: Math.floor(height) })

/**
 * Keeps a canvas pixel-exact for its board element via ResizeObserver, with
 * dpr capped at MAX_DPR. After every resize it calls `onResizeRef.current`;
 * point that at the game's draw function so a static frame is repainted:
 *
 *   useEffect(() => { onResizeRef.current = draw }, [draw, onResizeRef])
 */
export function useCanvasBoard(fit: Fit) {
  const boardRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const viewRef = useRef<BoardView>({ width: 0, height: 0, dpr: 1 })
  const onResizeRef = useRef<() => void>(() => {})
  const fitRef = useRef(fit)

  useEffect(() => {
    fitRef.current = fit
  }, [fit])

  useEffect(() => {
    const board = boardRef.current
    const canvas = canvasRef.current
    if (!board || !canvas)
      return

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = fitRef.current(entry.contentRect.width, entry.contentRect.height)
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      viewRef.current = { width, height, dpr }
      canvas.style.width = `${width}px`
      canvas.style.height = `${height}px`
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      onResizeRef.current()
    })
    observer.observe(board)
    return () => observer.disconnect()
  }, [])

  return { boardRef, canvasRef, viewRef, onResizeRef }
}

/** Prepares the 2D context for a frame in CSS px, or null if not sized yet. */
export function beginFrame(canvas: HTMLCanvasElement | null, view: BoardView): CanvasRenderingContext2D | null {
  const ctx = canvas?.getContext('2d')
  if (!ctx || view.width === 0)
    return null
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
  ctx.imageSmoothingEnabled = false
  return ctx
}
