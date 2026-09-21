import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { EngineProvider } from './contexts/EngineContext.jsx'
import 'antd/dist/reset.css'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <EngineProvider>
      <App />
    </EngineProvider>
  </React.StrictMode>
)
