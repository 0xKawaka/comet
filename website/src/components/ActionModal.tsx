import { useState, useEffect } from 'react';
import { Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';
import { FiUnlock, FiLock } from 'react-icons/fi';
import HealthFactorPreview from './HealthFactorPreview';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { generateRandomSecret, createPrivateAddress } from '../utils/privateAddresses';
import { useWallet, useTransaction } from '../hooks';
import './ActionModal.css';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay';
  maxAmount: bigint;
  onSubmit: (amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => Promise<void>;
}

// Action title mapping
const ACTION_TITLES = {
  deposit: 'Supply',
  withdraw: 'Withdraw',
  borrow: 'Borrow',
  repay: 'Repay'
};

const ActionModal = ({ 
  isOpen, 
  onClose, 
  asset, 
  actionType, 
  maxAmount,
  onSubmit
}: ActionModalProps) => {
  const { address: userAddress } = useWallet();
  const { privateAddresses, refreshAddresses } = useTransaction();
  
  const [amount, setAmount] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMaxAmount, setCurrentMaxAmount] = useState<bigint>(maxAmount);
  const [selectedPrivateAddress, setSelectedPrivateAddress] = useState<typeof privateAddresses[0] | null>(null);
  const [showNewSecretOption, setShowNewSecretOption] = useState(false);

  // Refresh the private addresses list when modal is opened
  useEffect(() => {
    if (isOpen) {
      refreshAddresses();
    }
  }, [isOpen, refreshAddresses]);

  useEffect(() => {
    // Update max amount when privacy toggle changes, but only for deposit action
    if (actionType === 'deposit') {
      setCurrentMaxAmount(isPrivate ? asset.wallet_balance_private : asset.wallet_balance);
    } else {
      setCurrentMaxAmount(maxAmount);
    }
  }, [isPrivate, actionType, asset, maxAmount]);

  useEffect(() => {
    // Reset selected private address when privacy toggle changes
    if (!isPrivate) {
      setSelectedPrivateAddress(null);
      setShowNewSecretOption(false);
    }
  }, [isPrivate]);

  if (!isOpen) return null;

  const handleSetMax = () => {
    setAmount(formatTokenAmount(currentMaxAmount, asset.decimals));
  };

  const handleCreateNewSecret = () => {
    setShowNewSecretOption(true);
    setSelectedPrivateAddress(null);
  };

  // Get action title (Supply, Withdraw, etc.)
  const getActionTitle = () => ACTION_TITLES[actionType] || 'Action';

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      // Determine what to pass to onSubmit based on privacy settings
      let recipient: AztecAddress | undefined;
      let secretValue: Fr | bigint | undefined;
      
      if (isPrivate) {
        if (showNewSecretOption) {
          // Create a new secret account
          secretValue = generateRandomSecret();
          if (!userAddress) throw new Error('User address not available');
          recipient = createPrivateAddress(secretValue, userAddress);
        } else if (selectedPrivateAddress) {
          // Use selected private address
          recipient = selectedPrivateAddress.address;
          secretValue = selectedPrivateAddress.secret;
        } else if (userAddress) {
          // Use user's public address as private recipient with secret 0n
          recipient = userAddress;
          secretValue = 0n;
        } else {
          throw new Error('No address selected for private transaction');
        }
      }
      
      await onSubmit(amount, isPrivate, recipient, secretValue);
      onClose();
      setAmount('');
    } catch (error) {
      console.error(`Error during ${actionType}:`, error);
      setError(`Transaction failed. ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderPrivateAddressOptions = () => {
    if (!isPrivate) return null;
    
    return (
      <div className="private-address-section">
        <h3 className="private-address-title">Private Recipient</h3>
        <div className="private-address-options">
          <div 
            className={`private-address-option ${!selectedPrivateAddress && !showNewSecretOption ? 'selected' : ''}`}
            onClick={() => {
              setSelectedPrivateAddress(null);
              setShowNewSecretOption(false);
            }}
          >
            <div className="address-label">Public Address (Private Mode)</div>
            <div className="address-value">{userAddress?.toString().substring(0, 10)}...</div>
          </div>
          
          <div 
            className={`private-address-option ${showNewSecretOption ? 'selected' : ''}`}
            onClick={handleCreateNewSecret}
          >
            <div className="address-label">New Secret Account</div>
            <div className="address-value">Generate new private address</div>
          </div>
          
          {privateAddresses.map((addr, index) => (
            <div 
              key={index}
              className={`private-address-option ${selectedPrivateAddress?.address.equals(addr.address) ? 'selected' : ''}`}
              onClick={() => {
                setSelectedPrivateAddress(addr);
                setShowNewSecretOption(false);
              }}
            >
              <div className="address-label">Secret Account {index + 1}</div>
              <div className="address-value">{addr.address.toString().substring(0, 10)}...</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Helper to render wallet balance item
  const renderWalletBalanceItem = (isPrivateBalance: boolean) => {
    const balance = isPrivateBalance ? asset.wallet_balance_private : asset.wallet_balance;
    return (
      <div className="wallet-balance-item">
        <div className="balance-type-label">
          {isPrivateBalance ? <FiLock size={12} /> : <FiUnlock size={12} />}
          <span>{isPrivateBalance ? 'Private' : 'Public'}</span>
        </div>
        <div className="balance-value">
          {formatTokenAmount(balance, asset.decimals)} {asset.ticker}
        </div>
        <div className="balance-usd-value">
          ${formatUsdValue(tokenToUsd(balance, asset.decimals, asset.price), asset.decimals)}
        </div>
      </div>
    );
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {getActionTitle()} {asset.name} ({asset.ticker})
          </h2>
          <button 
            className="close-button"
            onClick={onClose}
          >
            &times;
          </button>
        </div>
        
        <div className="modal-body">
          <div className="amount-input-container">
            <input
              type="text"
              placeholder="Amount"
              value={amount}
              onChange={e => {
                // Only allow digits and at most one decimal point
                const newValue = e.target.value;
                const regex = /^(\d*\.?\d*)$/;
                if (newValue === '' || regex.test(newValue)) {
                  setAmount(newValue);
                }
              }}
              disabled={isSubmitting}
              className="amount-input"
            />
            <button 
              onClick={handleSetMax}
              disabled={currentMaxAmount === 0n || isSubmitting}
              className="max-button"
            >
              MAX
            </button>
          </div>
          
          {actionType === 'deposit' && (
            <div className="wallet-balance-section">
              <h3 className="wallet-balance-title">Wallet Balance</h3>
              <div className="wallet-balance-container">
                {renderWalletBalanceItem(false)}
                {renderWalletBalanceItem(true)}
              </div>
            </div>
          )}
          
          <div className="health-factor-container">
            <HealthFactorPreview 
              asset={asset}
              actionType={actionType}
              amount={amount}
            />
          </div>
          
          <div className="privacy-toggle-container">
            <span className="privacy-label">Private Transaction</span>
            <div className="privacy-toggle-wrapper">
              <span className={`privacy-status ${isPrivate ? 'privacy-status-on' : 'privacy-status-off'}`}>
                {isPrivate ? 'ON' : 'OFF'}
              </span>
              <label className={`toggle-switch ${isSubmitting ? 'toggle-switch-disabled' : ''}`}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(!isPrivate)}
                  disabled={isSubmitting}
                />
                <span className={`toggle-slider ${isSubmitting ? 'toggle-slider-disabled' : ''}`}>
                </span>
              </label>
            </div>
          </div>
          
          {renderPrivateAddressOptions()}
          
          {error && (
            <div className="error-message">
              {error}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            className="cancel-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
            className="action-button-modal"
          >
            {isSubmitting ? 'Processing...' : getActionTitle()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal; 