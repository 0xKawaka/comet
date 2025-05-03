import { useState } from 'react';
import { WalletProvider } from './contexts/WalletContext';
import { LendingProvider } from './contexts/LendingContext';
import { TransactionProvider } from './contexts/TransactionContext';
import WalletInfo from './components/WalletInfo';
import HealthFactorIndicator from './components/HealthFactorIndicator';
import MarketsView from './components/MarketsView';
import UserDashboardView from './components/UserDashboardView';
import AssetView from './components/AssetView';
import logo from './assets/logo.png';
import { FiGlobe, FiUser } from 'react-icons/fi';
import './App.css';

const PXE_URL = import.meta.env.VITE_PXE_URL || 'http://localhost:8080';

function AppContent() {
  const [currentView, setCurrentView] = useState('markets');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [previousView, setPreviousView] = useState('markets');

  const navigateToAsset = (assetId: string) => {
    setPreviousView(currentView);
    setSelectedAsset(assetId);
    setCurrentView('asset');
  };

  const renderView = () => {
    switch (currentView) {
      case 'markets':
        return (
          <MarketsView 
            onAssetSelect={(assetId: string) => navigateToAsset(assetId)}
          />
        );
      case 'dashboard':
        return (
          <UserDashboardView 
            onAssetSelect={(assetId: string) => navigateToAsset(assetId)}
          />
        );
      case 'asset':
        return (
          <AssetView 
            assetId={selectedAsset as string}
            onBack={() => setCurrentView(previousView)}
            previousView={previousView}
          />
        );
      default:
        return <MarketsView onAssetSelect={() => {}} />;
    }
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <div className="header-logo-section">
            <div className="logo-container">
              <img 
                src={logo} 
                alt="Logo" 
                className="logo"
              />
              <h1 className="app-title text-gradient">
                Comet
              </h1>
            </div>
            <WalletInfo />
          </div>
          
          <div className="header-right">
            <HealthFactorIndicator showLabel={false} />
            <nav>
              <div className="nav-menu">
                <button 
                  className={`nav-button ${currentView === 'markets' ? 'nav-button-active' : 'nav-button-inactive'}`}
                  onClick={() => setCurrentView('markets')}
                >
                  <FiGlobe />
                  Markets
                </button>
                <button 
                  className={`nav-button ${currentView === 'dashboard' ? 'nav-button-active' : 'nav-button-inactive'}`}
                  onClick={() => setCurrentView('dashboard')}
                >
                  <FiUser />
                  My Dashboard
                </button>
              </div>
            </nav>
          </div>
        </header>
        
        <main className="main-content">
          <div className="glass-panel content-panel">
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <WalletProvider pxeUrl={PXE_URL}>
      <TransactionProvider>
        <LendingProvider>
          <AppContent />
        </LendingProvider>
      </TransactionProvider>
    </WalletProvider>
  );
}

export default App;
