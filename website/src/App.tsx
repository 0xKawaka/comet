import { useState } from 'react';
import { WalletProvider } from './contexts/WalletContext';
import WalletInfo from './components/WalletInfo';
import HealthFactorIndicator from './components/HealthFactorIndicator';
import MarketsView from './components/MarketsView';
import UserDashboardView from './components/UserDashboardView';
import AssetView from './components/AssetView';
import logo from './assets/logo.png';
import { FiGlobe, FiUser, FiChevronLeft } from 'react-icons/fi';

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
    <div style={{
      backgroundColor: "#121320",
      minHeight: "100vh",
      color: "#ffffff"
    }}>
      <div style={{
        maxWidth: "1280px",
        margin: "0 auto",
        padding: "0 1.5rem"
      }}>
        <header style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "1.5rem 0",
          borderBottom: "1px solid rgba(54, 57, 82, 0.5)"
        }}>
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem"
          }}>
            <div style={{
              display: "flex",
              alignItems: "center"
            }}>
              <img 
                src={logo} 
                alt="Logo" 
                style={{
                  height: "2.5rem",
                  marginRight: "0.75rem"
                }}
              />
              <h1 className="text-gradient" style={{
                fontSize: "1.5rem",
                fontWeight: "700"
              }}>
                Comet
              </h1>
            </div>
            <WalletInfo />
          </div>
          
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "1.5rem"
          }}>
            <HealthFactorIndicator />
            <nav>
              <div style={{
                display: "flex",
                gap: "0.75rem"
              }}>
                <button 
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: "500",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    backgroundColor: currentView === 'markets' 
                      ? "rgba(117, 49, 253, 0.2)" 
                      : "transparent",
                    border: currentView === 'markets' 
                      ? "1px solid #7531fd" 
                      : "1px solid #363952",
                    color: currentView === 'markets' 
                      ? "#d9fbff" 
                      : "#ffffff",
                    cursor: "pointer"
                  }}
                  onClick={() => setCurrentView('markets')}
                >
                  <FiGlobe />
                  Markets
                </button>
                <button 
                  style={{
                    padding: "0.5rem 1rem",
                    borderRadius: "0.5rem",
                    fontWeight: "500",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    backgroundColor: currentView === 'dashboard' 
                      ? "rgba(117, 49, 253, 0.2)" 
                      : "transparent",
                    border: currentView === 'dashboard' 
                      ? "1px solid #7531fd" 
                      : "1px solid #363952",
                    color: currentView === 'dashboard' 
                      ? "#d9fbff" 
                      : "#ffffff",
                    cursor: "pointer"
                  }}
                  onClick={() => setCurrentView('dashboard')}
                >
                  <FiUser />
                  My Dashboard
                </button>
              </div>
            </nav>
          </div>
        </header>
        
        <main style={{
          marginTop: "2rem"
        }}>
          {currentView === 'asset' && (
            <div style={{
              marginBottom: "1.5rem"
            }}>
              <button 
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  backgroundColor: "transparent",
                  color: "#8a8dff",
                  border: "none",
                  padding: "0.5rem",
                  borderRadius: "0.375rem",
                  fontWeight: "500",
                  cursor: "pointer"
                }}
                onClick={() => setCurrentView('markets')}
              >
                <FiChevronLeft />
                Back to Markets
              </button>
            </div>
          )}
          
          <div className="glass-panel" style={{
            padding: "1.5rem"
          }}>
            {renderView()}
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
