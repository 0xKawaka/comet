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
      {/* <div>
        <div className="wallet-label">Connected to PXE as</div>
        <div className="wallet-address">{address?.toString()}</div>
      </div> */}
    </div>
  );
};

export default WalletInfo; 