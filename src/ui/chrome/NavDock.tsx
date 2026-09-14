export type SheetName = 'tip' | 'cup' | 'wallet'

/**
 * The Feed / Cup / Wallet pill. In play it squeezes out (scaleX .28 + fade)
 * while the 44px round dots button grows in 80ms later, as in the prototype.
 */
export function NavDock({
  playing,
  sheet,
  onFeed,
  onCup,
  onWallet,
  onExitPlay,
}: {
  playing: boolean
  sheet: SheetName | null
  onFeed: () => void
  onCup: () => void
  onWallet: () => void
  onExitPlay: () => void
}) {
  const tab = playing ? -1 : 0
  const item = (on: boolean) => (on ? 'nc-nav__item is-on' : 'nc-nav__item')
  return (
    <>
      <nav className={playing ? 'nc-nav is-hidden' : 'nc-nav'} aria-hidden={playing}>
        <div className="nc-nav__pill nc-glass">
          <button type="button" className={item(sheet === null || sheet === 'tip')} onClick={onFeed} tabIndex={tab}>Feed</button>
          <button type="button" className={item(sheet === 'cup')} onClick={onCup} tabIndex={tab}>Cup</button>
          <button type="button" className={item(sheet === 'wallet')} onClick={onWallet} tabIndex={tab}>Wallet</button>
        </div>
      </nav>
      <button
        type="button"
        className={playing ? 'nc-dots nc-glass is-shown' : 'nc-dots nc-glass'}
        onClick={onExitPlay}
        aria-label="Back to the feed"
        aria-hidden={!playing}
        tabIndex={playing ? 0 : -1}
      >
        <span className="nc-dots__grid" aria-hidden="true"><i /><i /><i /><i /></span>
      </button>
    </>
  )
}
