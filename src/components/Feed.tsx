import { useEffect, useImperativeHandle, useRef } from 'react'
import type { ReactNode, Ref } from 'react'
import type { Game } from '../games/types'

export interface FeedHandle {
  scrollTo: (index: number) => void
}

/**
 * The vertical snap feed. A card counts as current once it fills most of the
 * viewport. While a card is in play the feed is locked (overflow hidden,
 * touch-action none), so the game owns every touch.
 */
export default function Feed({
  games,
  locked,
  handleRef,
  onCurrentChange,
  renderCard,
}: {
  games: Game[]
  locked: boolean
  handleRef: Ref<FeedHandle>
  onCurrentChange: (index: number) => void
  renderCard: (game: Game, index: number) => ReactNode
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const onChangeRef = useRef(onCurrentChange)

  useEffect(() => {
    onChangeRef.current = onCurrentChange
  })

  useImperativeHandle(handleRef, () => ({
    scrollTo(index: number) {
      const container = containerRef.current
      container?.scrollTo({ top: index * container.clientHeight, behavior: 'smooth' })
    },
  }), [])

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting)
            onChangeRef.current(Number((entry.target as HTMLElement).dataset.index))
        }
      },
      { root: container, threshold: 0.6 },
    )
    container.querySelectorAll('[data-index]').forEach(card => observer.observe(card))
    return () => observer.disconnect()
  }, [games])

  return (
    <div ref={containerRef} className={locked ? 'nc-feed is-locked' : 'nc-feed'}>
      {games.map((game, index) => (
        <section key={game.id} className="nc-card" data-index={index} aria-label={game.title}>
          {renderCard(game, index)}
        </section>
      ))}
    </div>
  )
}
