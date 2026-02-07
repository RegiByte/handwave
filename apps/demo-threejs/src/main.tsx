import './index.css'
import { RouterProvider } from '@tanstack/react-router'
import ReactDOM from 'react-dom/client'
import React from 'react'
import { getRouter } from './router'

// Create the router instance
const router = getRouter()

// Register the router for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <React.StrictMode>
      <RouterProvider router={router} />
    </React.StrictMode>,
  )
}
