import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import DemoNotice from './components/DemoNotice.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <DemoNotice />
    <App />
  </StrictMode>,
)
