import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import 'antd/dist/reset.css'

// BUILD_STAMP 2026-06-10-r7：3 个独立联动下拉（省/市/区）
const BUILD_STAMP = '2026-06-10-r7';
console.info(`[BUILD] ${BUILD_STAMP}`);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)