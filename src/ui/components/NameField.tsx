import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { setName } from '../../lib/profile'

/** Text field with Save (and an optional Cancel) for the display name; validation errors show inline. */
export function NameField({
  initial = '',
  compact = false,
  focusOnMount = false,
  onSaved,
  onCancel,
}: {
  initial?: string
  /** Slimmer variant for the game over prompt. */
  compact?: boolean
  focusOnMount?: boolean
  onSaved?: (name: string) => void
  onCancel?: () => void
}) {
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (focusOnMount)
      inputRef.current?.focus()
  }, [focusOnMount])

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const result = setName(value)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setError(null)
    onSaved?.(result.name)
  }

  return (
    <form className={compact ? 'nc-name-field is-compact' : 'nc-name-field'} onSubmit={submit} noValidate>
      <div className="nc-name-field__row">
        <input
          ref={inputRef}
          className="nc-name-field__input"
          type="text"
          value={value}
          placeholder="e.g. minos"
          aria-label="Display name"
          aria-invalid={error !== null}
          aria-describedby={error ? `${id}-error` : undefined}
          maxLength={32}
          autoComplete="nickname"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(event) => {
            setValue(event.target.value)
            if (error)
              setError(null)
          }}
        />
        <button type="submit" className="nc-btn nc-btn--gold nc-name-field__save">Save</button>
        {onCancel && <button type="button" className="nc-name-field__cancel" onClick={onCancel}>Cancel</button>}
      </div>
      {error && <p id={`${id}-error`} className="nc-name-field__error" role="alert">{error}</p>}
    </form>
  )
}
