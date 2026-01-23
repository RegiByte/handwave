import React from 'react'
import ReactDOM from 'react-dom/client'
import { PACKAGE_NAME, VERSION } from '@handwave/intent-engine'
import { RouterProvider } from '@tanstack/react-router'
import { getRouter } from './router'
import './styles.css'

// Verify monorepo package import works
console.log(`✅ Monorepo working: ${PACKAGE_NAME} v${VERSION}`)

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
