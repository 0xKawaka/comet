import { useAddress } from '../hooks';
import WalletSelector from './WalletSelector';
import './wallet.css';

const WalletInfo = () => {
  const { address, isLoading } = useAddress();

  if (isLoading) {
    return <div>Loading wallet...</div>;
  }

  return (
    <div className="wallet-info">
      <WalletSelector />
    </div>
  );
};

export default WalletInfo; 