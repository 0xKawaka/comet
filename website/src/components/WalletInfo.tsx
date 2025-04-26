import { useAddress } from '../hooks';
import WalletSelector from './WalletSelector';
import { FiLoader } from 'react-icons/fi';

const WalletInfo = () => {
  const { address, isLoading } = useAddress();

  if (isLoading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        color: '#9fa1b2'
      }}>
        <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
        <span>Loading wallet...</span>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      <WalletSelector />
    </div>
  );
};

export default WalletInfo; 