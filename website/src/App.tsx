import { useState } from 'react';
import { WalletProvider } from './contexts/WalletContext';
import WalletInfo from './components/WalletInfo';
import HealthFactorIndicator from './components/HealthFactorIndicator';
import MarketsView from './components/MarketsView';
import UserDashboardView from './components/UserDashboardView';
import AssetView from './components/AssetView';
import logo from './assets/logo.png';
import './App.css';

const PXE_URL = import.meta.env.VITE_PXE_URL || 'http://localhost:8080';

function App() {
  const [currentView, setCurrentView] = useState('markets');
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const renderView = () => {
    switch (currentView) {
      case 'markets':
        return (
          <MarketsView 
            onAssetSelect={(assetId: string) => {
              setSelectedAsset(assetId);
              setCurrentView('asset');
            }}
          />
        );
      case 'dashboard':
        return (
          <UserDashboardView 
            onAssetSelect={(assetId: string) => {
              setSelectedAsset(assetId);
              setCurrentView('asset');
            }}
          />
        );
      case 'asset':
        return (
          <AssetView 
            assetId={selectedAsset as string}
            onBack={() => setCurrentView('markets')}
          />
        );
      default:
        return <MarketsView onAssetSelect={() => {}} />;
    }
  };

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="app-header-left">
          <div className="app-logo">
            <img src={logo} alt="Logo" className="header-logo" />
          </div>
          <WalletInfo />
        </div>
        <div className="app-header-right">
          <HealthFactorIndicator />
          <nav className="app-navigation">
            <ul>
              <li>
                <button 
                  className={currentView === 'markets' ? 'active' : ''} 
                  onClick={() => setCurrentView('markets')}
                >
                  Markets
                </button>
              </li>
              <li>
                <button 
                  className={currentView === 'dashboard' ? 'active' : ''}
                  onClick={() => setCurrentView('dashboard')}
                >
                  My Dashboard
                </button>
              </li>
            </ul>
          </nav>
        </div>
      </header>
      <main className="app-content">
        {renderView()}
      </main>
    </div>
  );
}

export default App;
