import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

// Silence non-critical logs in production builds; keep errors/warnings
if (import.meta && import.meta.env && import.meta.env.PROD) {
  try {
    console.log = (..._args: any[]) => {};
    console.debug = (..._args: any[]) => {};
    console.info = (..._args: any[]) => {};
  } catch (_) {}
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
