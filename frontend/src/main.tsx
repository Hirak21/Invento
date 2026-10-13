import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.tsx'
import { AuthProvider } from './hooks/useAuth.tsx'
import { BusinessUnitProvider } from './hooks/useBusinessUnit.tsx'
import { ToastProvider } from './components/ui/Toast.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <BusinessUnitProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </BusinessUnitProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
