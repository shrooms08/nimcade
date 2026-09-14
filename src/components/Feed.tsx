import { useEffect, useRef, useState } from 'react'
import type { Game } from '../games/types'
import GameCard from './GameCard'

export default function Feed({
  games,
  onTip,
}: {
  games: Game[]
  onTip: (game: Game) => Promise<void>
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [activeId, setActiveId] = useState<string | null>(games[0]?.id ?? null)

  useEffect(() => {
    const container = containerRef.current
    if (!container)
      return

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting)
            continue
          const id = (entry.target as HTMLElement).dataset.gameId
          if (id)
            setActiveId(id)
        }
      },
      // Only the card filling most of the viewport counts as active, so a
      // half-swiped card never starts its game.
      { root: container, threshold: 0.6 },
    )

    const cards = container.querySelectorAll('[data-game-id]')
    cards.forEach(card => observer.observe(card))
    return () => observer.disconnect()
  }, [games])

  return (
    <div className="feed" ref={containerRef}>
      {games.map(game => (
        <GameCard
          key={game.id}
          game={game}
          active={game.id === activeId}
          onTip={onTip}
        />
      ))}
    </div>
  )
}
