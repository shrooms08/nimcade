import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './ui/tokens.css'
import './ui/ui.css'
import './ui/splash.css'
import './ui/feed.css'
import './ui/chrome.css'
import './ui/overlays.css'
import './ui/sheets.css'
import './ui/cup.css'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
