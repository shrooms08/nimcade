import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  title: string
  onRetry: () => void
  children: ReactNode
}

/** Catches a game that throws while loading or rendering, so one broken card never takes down the feed. */
export class CardErrorBoundary extends Component<Props, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn(`[Nimcade] ${this.props.title} failed to load`, error, info.componentStack)
  }

  render() {
    if (!this.state.failed)
      return this.props.children
    return (
      <div className="nc-card-error" role="alert">
        <p className="nc-card-error__title">{this.props.title} couldn't load</p>
        <p className="nc-card-error__sub">Something went wrong starting this game.</p>
        <button
          type="button"
          className="nc-btn nc-btn--white"
          onClick={() => {
            this.setState({ failed: false })
            this.props.onRetry()
          }}
        >
          Retry
        </button>
      </div>
    )
  }
}
