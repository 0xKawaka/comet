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
  const { address: userAddress, isSecretAdrsSelected, selectedAddress, selectedAddressSecret } = useWallet();
  const { privateAddresses, refreshAddresses, isProcessing: isTransactionProcessing } = useTransaction();
  
  const [amount, setAmount] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isLocalSubmitting, setIsLocalSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMaxAmount, setCurrentMaxAmount] = useState<bigint>(maxAmount);
  const [modalSelectedAddress, setModalSelectedAddress] = useState<typeof privateAddresses[0] | null>(null);
  const [showNewSecretOption, setShowNewSecretOption] = useState(false);
  const [shouldCloseWhenDone, setShouldCloseWhenDone] = useState(false);

  // Combined processing state from both local component and TransactionContext
  const isSubmitting = isLocalSubmitting || isTransactionProcessing;

  // Refresh the private addresses list when modal is opened
  useEffect(() => {
    if (isOpen) {
      refreshAddresses();
      // Reset the close flag whenever the modal is opened
      setShouldCloseWhenDone(false);
      
      // Initialize isPrivate based on the global state if the modal is opened
      if (isSecretAdrsSelected) {
        setIsPrivate(true);
      }
    }
  }, [isOpen, refreshAddresses, isSecretAdrsSelected]);

  // Separate effect to handle private address matching
  useEffect(() => {
    if (isOpen && isSecretAdrsSelected && selectedAddress && selectedAddressSecret !== undefined) {
      const privateAddrMatch = privateAddresses.find(addr => 
        addr.address.equals(selectedAddress) && addr.secret === selectedAddressSecret
      );
      
      if (privateAddrMatch) {
        setModalSelectedAddress(privateAddrMatch);
        setShowNewSecretOption(false);
      }
    }
  }, [isOpen, isSecretAdrsSelected, selectedAddress, selectedAddressSecret, privateAddresses]);

  useEffect(() => {
    // Update max amount when privacy toggle changes, but only for deposit action
    if (actionType === 'deposit' || actionType === 'repay') {
      setCurrentMaxAmount(isPrivate ? asset.wallet_balance_private : asset.wallet_balance);
    } else {
      setCurrentMaxAmount(maxAmount);
    }
  }, [isPrivate, actionType, asset, maxAmount]);

  useEffect(() => {
    // Reset selected private address when privacy toggle changes
    if (!isPrivate) {
      setModalSelectedAddress(null);
      setShowNewSecretOption(false);
    }
  }, [isPrivate]);

  // Track transaction processing state and close modal only when transaction is complete
  useEffect(() => {
    if (isLocalSubmitting && isTransactionProcessing) {
      // Transaction is now processing, mark it to close when done
      setShouldCloseWhenDone(true);
    } else if (shouldCloseWhenDone && !isTransactionProcessing) {
      // Transaction has completed and we marked it to close
      setIsLocalSubmitting(false);
      setAmount('');
      // Close the modal now that processing is complete
      onClose();
    }
  }, [isTransactionProcessing, isLocalSubmitting, shouldCloseWhenDone, onClose]);

  if (!isOpen) return null;

  const handleSetMax = () => {
    setAmount(formatTokenAmount(currentMaxAmount, asset.decimals));
  };

  const handleCreateNewSecret = () => {
    setShowNewSecretOption(true);
    setModalSelectedAddress(null);
  };

  // Get action title (Supply, Withdraw, etc.)
  const getActionTitle = () => ACTION_TITLES[actionType] || 'Action';

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError(null);
    
    try {
      // Determine what to pass to onSubmit based on privacy settings
      let recipient: AztecAddress | undefined;
      let secretValue: Fr | bigint | undefined;
      
      if (isPrivate) {
        if (modalSelectedAddress) {
          // Always set recipient to modalSelectedAddress for private transactions
          recipient = modalSelectedAddress.address;
          
          // Set secretValue based on transaction type
          if (actionType === 'deposit' || actionType === 'repay') {
            secretValue = modalSelectedAddress.secret;
          } else if (actionType === 'withdraw' || actionType === 'borrow') {
            secretValue = selectedAddressSecret;
          }
        } else if (showNewSecretOption && actionType !== 'repay') {
          // Create a new secret account (only for non-repay actions)
          if(actionType === 'deposit') {
            secretValue = generateRandomSecret();
          } else {
            secretValue = selectedAddressSecret;
          }
          if(!secretValue) throw new Error('Secret value not available');
          if (!userAddress) throw new Error('User address not available');
          recipient = createPrivateAddress(secretValue, userAddress);
        } else if (userAddress) {
          // Use user's public address as private recipient with secret 0n
          recipient = userAddress;
          secretValue = 0n;
        } else {
          throw new Error('No modal address found for private transaction');
        }
      }
      
      // Set isLocalSubmitting to true right before starting the transaction
      setIsLocalSubmitting(true);
      
      // Call onSubmit which will trigger the transaction
      await onSubmit(amount, isPrivate, recipient, secretValue);
      
      // We don't close the modal here. The closing is handled in the useEffect
      // when isTransactionProcessing becomes false
    } catch (error) {
      console.error(`Error during ${actionType}:`, error);
      setError(`Transaction failed. ${error instanceof Error ? error.message : 'Please try again.'}`);
      setIsLocalSubmitting(false);
      // Reset the close flag since we had an error
      setShouldCloseWhenDone(false);
    }
  };

  const renderPrivateAddressOptions = () => {
    if (!isPrivate) return null;
    
    return (
      <div className="private-address-section">
        <h3 className="private-address-title">
          {actionType === 'repay' ? 'From Account' : 'Private Recipient'}
        </h3>
        <div className="private-address-options">
          <div 
            className={`private-address-option ${!modalSelectedAddress && !showNewSecretOption ? 'selected' : ''}`}
            onClick={() => {
              setModalSelectedAddress(null);
              setShowNewSecretOption(false);
            }}
          >
            <div className="address-label">Public Address (Private Mode)</div>
            <div className="address-value">{userAddress?.toString().substring(0, 10)}...</div>
          </div>
          
          {actionType !== 'repay' && (
            <div 
              className={`private-address-option ${showNewSecretOption ? 'selected' : ''}`}
              onClick={handleCreateNewSecret}
            >
              <div className="address-label">New Secret Account</div>
              <div className="address-value">Generate new private address</div>
            </div>
          )}
          
          {privateAddresses.map((addr, index) => (
            <div 
              key={index}
              className={`private-address-option ${modalSelectedAddress?.address.equals(addr.address) ? 'selected' : ''}`}
              onClick={() => {
                setModalSelectedAddress(addr);
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
            disabled={isSubmitting}
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
            <div className="toggle-label">
              Make this transaction private
            </div>
            <label className="toggle-switch">
              <input 
                type="checkbox" 
                checked={isPrivate} 
                onChange={() => setIsPrivate(!isPrivate)}
                disabled={isSubmitting}
              />
              <span className="toggle-slider"></span>
            </label>
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
            disabled={!amount || parseFloat(amount) <= 0 || currentMaxAmount === 0n || isSubmitting}
            className="action-button-modal"
          >
            {isSubmitting ? "Processing..." : getActionTitle()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal; 