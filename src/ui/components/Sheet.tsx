import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'

/** How far the handle must be dragged down before the sheet closes. */
const DISMISS_DRAG_PX = 90

/**
 * A bottom sheet from the prototype: dim backdrop, glass panel that slides up
 * over 250ms, and a drag handle (tap it, drag it down, tap the backdrop or
 * press Escape to close).
 */
export function Sheet({
  label,
  onClose,
  tall = false,
  children,
}: {
  label: string
  onClose: () => void
  /** Tall sheets reach up under the top chrome (the Cup). */
  tall?: boolean
  children: ReactNode
}) {
  const panelRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ id: number; startY: number; dy: number } | null>(null)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const setOffset = (dy: number) => {
    if (panelRef.current)
      panelRef.current.style.transform = dy > 0 ? `translateY(${dy}px)` : ''
  }

  const onHandleDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    dragRef.current = { id: event.pointerId, startY: event.clientY, dy: 0 }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
    catch {
      // Best-effort; a tap still closes.
    }
  }
  const onHandleMove = (event: ReactPointerEvent) => {
    const drag = dragRef.current
    if (!drag || drag.id !== event.pointerId)
      return
    drag.dy = Math.max(0, event.clientY - drag.startY)
    setOffset(drag.dy)
  }
  const onHandleUp = () => {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag || drag.dy < 6 || drag.dy > DISMISS_DRAG_PX)
      onClose() // a tap, or a long enough drag
    else
      setOffset(0)
  }

  return (
    <div className="nc-sheet-layer">
      <div className="nc-backdrop" onClick={onClose} />
      <div ref={panelRef} className={tall ? 'nc-sheet nc-sheet--tall' : 'nc-sheet'} role="dialog" aria-modal="true" aria-label={label}>
        <button
          type="button"
          className="nc-sheet__handle"
          aria-label="Close"
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={() => { dragRef.current = null; setOffset(0) }}
        >
          <span />
        </button>
        {children}
      </div>
    </div>
  )
}
