import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './assets/animations.css'
import App from './App.tsx'
import { WalletProvider } from './contexts/WalletContext.tsx'
import { LendingProvider } from './contexts/LendingContext.tsx'

const PXE_URL = import.meta.env.VITE_PXE_URL || 'http://localhost:8080';

createRoot(document.getElementById('root')!).render(
  <WalletProvider pxeUrl={PXE_URL}>
    <LendingProvider>
      <App />
    </LendingProvider>
  </WalletProvider>
)
