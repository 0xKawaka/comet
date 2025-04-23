import { useState } from 'react';
import { useWalletUtils } from '../hooks';
import './wallet.css';

/**
 * A reusable wallet selector component
 */
const WalletSelector = () => {
  const { availableWallets, switchWallet, isLoading } = useWalletUtils();
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleWalletChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const index = parseInt(e.target.value, 10);
    setSelectedIndex(index);
    switchWallet(index);
  };

  if (isLoading) {
    return <div>Loading wallets...</div>;
  }

  return (
    <div>
      <select
        id="wallet-selector"
        value={selectedIndex}
        onChange={handleWalletChange}
        className="wallet-selector"
      >
        {availableWallets.map((wallet, index) => {
          const address = wallet.getAddress().toString();
          const shortAddress = `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
          return (
            <option key={address} value={index}>
              Account {index + 1} ({shortAddress})
            </option>
          );
        })}
      </select>
    </div>
  );
};

export default WalletSelector; 