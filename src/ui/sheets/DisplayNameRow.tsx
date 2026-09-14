import { useState } from 'react'
import { usePlayerName } from '../../lib/usePlayerName'
import { NameField } from '../components/NameField'

/** The wallet sheet's first row: the display name, edited inline. */
export function DisplayNameRow() {
  const name = usePlayerName()
  const [editing, setEditing] = useState(false)

  if (editing) {
    return (
      <div className="nc-name-row is-editing">
        <span className="nc-caps">Display name</span>
        <NameField initial={name ?? ''} focusOnMount onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />
      </div>
    )
  }
  return (
    <button type="button" className="nc-name-row" onClick={() => setEditing(true)}>
      <span className="nc-caps">Display name</span>
      <span className={name ? 'nc-name-row__value' : 'nc-name-row__value is-empty'}>{name ?? 'Set your name'}</span>
      <span className="nc-name-row__edit" aria-hidden="true">{name ? 'Edit' : 'Add'}</span>
    </button>
  )
}
