/** The Nimcade app icon from the UI kit: a gold rounded square with a black N. */
export function NimcadeIcon({
  size,
  className,
  squareClassName,
  letterClassName,
}: {
  size?: number
  className?: string
  /** Hooks for animating the square and the N separately, as the splash does. */
  squareClassName?: string
  letterClassName?: string
}) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 204 204" aria-hidden="true">
      <rect className={squareClassName} width="204" height="204" rx="46" fill="#F6B221" />
      <path className={letterClassName} d="M52 170V34h34l52 68v-68h34v136h-34l-52-68v68h-34z" fill="#000000" />
    </svg>
  )
}
