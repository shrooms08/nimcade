export interface ToastMessage {
  id: number
  tone: 'success' | 'error'
  text: string
}

export default function Toast({
  toast,
  onDismiss,
}: {
  toast: ToastMessage | null
  onDismiss: () => void
}) {
  if (!toast)
    return null

  return (
    <button
      type="button"
      className={`toast toast--${toast.tone}`}
      onClick={onDismiss}
      key={toast.id}
    >
      {toast.text}
    </button>
  )
}
