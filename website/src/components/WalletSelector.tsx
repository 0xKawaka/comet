import { useState } from 'react';
import { useWalletUtils } from '../hooks';
import { FiLoader, FiChevronDown, FiUser } from 'react-icons/fi';
import './WalletSelector.css';

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
      <div className="wallet-info-loading">
        <FiLoader className="wallet-info-loader" />
        <span>Loading wallets...</span>
      </div>
    );
  }

  // Get current wallet info
  const currentWallet = availableWallets[selectedIndex];
  const address = currentWallet.getAddress().toString();
  const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;

  return (
    <div className="wallet-selector">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="wallet-connected"
      >
        <div className="wallet-icon">
          <FiUser size={12} />
        </div>
        <span className="wallet-address">{shortAddress}</span>
        <FiChevronDown size={16} className={`wallet-dropdown-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="wallet-dropdown">
          {availableWallets.map((wallet, index) => {
            const walletAddress = wallet.getAddress().toString();
            const walletShortAddress = `${walletAddress.substring(0, 6)}...${walletAddress.substring(walletAddress.length - 4)}`;
            
            return (
              <button
                key={walletAddress}
                onClick={() => handleWalletChange(index)}
                className={`wallet-option ${index === selectedIndex ? 'selected' : ''}`}
              >
                <div className={`wallet-option-icon ${index === selectedIndex ? 'selected' : ''}`}>
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