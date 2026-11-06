import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AuthProvider } from './features/auth/AuthProvider'
import { ReadingPreferencesProvider } from './features/preferences/ReadingPreferencesProvider'
import './styles/global.css'

const legacyHash = window.location.hash
if (legacyHash.startsWith('#/')) {
  window.history.replaceState(null, '', legacyHash.slice(1) || '/')
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <ErrorBoundary>
        <ReadingPreferencesProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ReadingPreferencesProvider>
      </ErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>,
)
