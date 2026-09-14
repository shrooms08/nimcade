/** The gold NIM coin used across the chrome: a gold circle with a black N, or black with a gold N. */
export function Coin({ size = 16, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <span
      className={inverted ? 'nc-coin nc-coin--inverted' : 'nc-coin'}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.56) }}
      aria-hidden="true"
    >
      N
    </span>
  )
}
