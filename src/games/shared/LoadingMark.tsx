/** Shown while a game's heavy assets load: the mono icon with a diagonal sheen, and "Loading". */
export function LoadingMark() {
  return (
    <div className="nc-loading" role="status">
      <span className="nc-loading__mark" aria-hidden="true" />
      <span className="nc-loading__text">Loading</span>
    </div>
  )
}
