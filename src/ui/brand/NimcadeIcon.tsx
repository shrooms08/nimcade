/** The Nimcade mark from the design prototype: a gold rounded square with a black N. */
export function NimcadeIcon({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="154 154 204 204" aria-hidden="true">
      <rect x="154" y="154" width="204" height="204" rx="46" fill="#F6B221" />
      <path d="M206 324V188h34l52 68v-68h34v136h-34l-52-68v68h-34z" fill="#000000" />
    </svg>
  )
}
