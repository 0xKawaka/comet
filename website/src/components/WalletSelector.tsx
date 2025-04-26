import { useState } from 'react';
import { useWalletUtils } from '../hooks';
import { FiLoader, FiChevronDown, FiUser } from 'react-icons/fi';

/**
 * A reusable wallet selector component
 */
const WalletSelector = () => {
  const { availableWallets, switchWallet, isLoading } = useWalletUtils();
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  const handleWalletChange = (index: number) => {
    setSelectedIndex(index);
    switchWallet(index);
    setIsOpen(false);
  };

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#9fa1b2'
      }}>
        <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading wallets...</span>
      </div>
    );
  }

  // Get current wallet info
  const currentWallet = availableWallets[selectedIndex];
  const address = currentWallet.getAddress().toString();
  const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

  return (
    <div style={{ position: 'relative' }}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          backgroundColor: 'rgba(54, 57, 82, 0.3)',
          border: '1px solid #363952',
          borderRadius: '0.5rem',
          color: '#ffffff',
          fontSize: '0.875rem',
          cursor: 'pointer',
          transition: 'all 0.2s'
        }}
      >
        <div style={{
          backgroundColor: '#7531fd',
          width: '1.5rem',
          height: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%'
        }}>
          <FiUser size={12} />
        </div>
        <span>{shortAddress}</span>
        <FiChevronDown size={16} style={{ 
          transform: isOpen ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform 0.2s ease'
        }} />
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 0.5rem)',
          left: 0,
          width: '100%',
          backgroundColor: '#22253a',
          borderRadius: '0.5rem',
          border: '1px solid #363952',
          zIndex: 10,
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
          padding: '0.5rem'
        }}>
          {availableWallets.map((wallet, index) => {
            const walletAddress = wallet.getAddress().toString();
            const walletShortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
            
            return (
              <button
                key={walletAddress}
                onClick={() => handleWalletChange(index)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem',
                  width: '100%',
                  textAlign: 'left',
                  backgroundColor: index === selectedIndex ? 'rgba(117, 49, 253, 0.2)' : 'transparent',
                  border: 'none',
                  borderRadius: '0.25rem',
                  color: index === selectedIndex ? '#d9fbff' : '#ffffff',
                  cursor: 'pointer',
                  fontSize: '0.875rem'
                }}
              >
                <div style={{
                  backgroundColor: index === selectedIndex ? '#7531fd' : '#363952',
                  width: '1.5rem',
                  height: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '50%'
                }}>
                  <FiUser size={12} />
                </div>
                <span>Account {index + 1} ({walletShortAddress})</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default WalletSelector; 