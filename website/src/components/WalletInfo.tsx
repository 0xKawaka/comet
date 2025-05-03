import { useAddress } from '../hooks';
import WalletSelector from './WalletSelector';
import AddressSelector from './AddressSelector';
import { FiLoader } from 'react-icons/fi';
import './WalletInfo.css';

const WalletInfo = () => {
  const { address, isLoading } = useAddress();

  if (isLoading) {
    return (
      <div className="wallet-info-loading">
        <FiLoader className="wallet-info-loader" />
        <span>Loading wallet...</span>
      </div>
    );
  }

  return (
    <div className="wallet-info-container">
      <WalletSelector />
      <AddressSelector />
    </div>
  );
};

export default WalletInfo; 