import { useState, useEffect } from 'react';
import { Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';
import { FiUnlock, FiLock } from 'react-icons/fi';
import HealthFactorPreview from './HealthFactorPreview';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { generateRandomSecret, createPrivateAddress, addPrivateAddress } from '../utils/privateAddresses';
import { useWallet, useTransaction, usePrivateAddresses } from '../hooks';
import './ActionModal.css';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay';
  maxAmount: bigint;
  onSubmit: (amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint, fromPublicBalance?: boolean) => Promise<void>;
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
  const { addPrivateAddressWithSecret } = usePrivateAddresses();
  
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
    
    }
  }, [isOpen, refreshAddresses]);

  // Always force isPrivate to true if isSecretAdrsSelected is true
  useEffect(() => {
    if (isSecretAdrsSelected) {
      setIsPrivate(true);
    } else if (actionType !== 'deposit') {
      // Force isPrivate to false for non-deposit actions when not using a secret address
      setIsPrivate(false);
    }
  }, [isSecretAdrsSelected, actionType]);

  // Separate effect to handle private address matching
  useEffect(() => {
    if (isOpen && isSecretAdrsSelected && selectedAddress && selectedAddressSecret !== undefined) {
      setModalSelectedAddress(null);
      setShowNewSecretOption(false);
      // if (actionType === 'deposit' || actionType === 'borrow') {
      //   setModalSelectedAddress(null);
      //   setShowNewSecretOption(false);
      // } else {
      //   // For other actions, try to find matching private address
      //   const privateAddrMatch = privateAddresses.find(addr => 
      //     addr.address.equals(selectedAddress) && addr.secret === selectedAddressSecret
      //   );
        
      //   if (privateAddrMatch) {
      //     setModalSelectedAddress(privateAddrMatch);
      //     setShowNewSecretOption(false);
      //   }
      // }
    }
  }, [isOpen, isSecretAdrsSelected, selectedAddress, selectedAddressSecret, privateAddresses, actionType]);

  useEffect(() => {
    // Update max amount when privacy toggle changes
    if (actionType === 'deposit') {
      setCurrentMaxAmount(isPrivate ? asset.max_deposit_private : asset.max_deposit_public);
    } else if (actionType === 'repay') {
      setCurrentMaxAmount(isPrivate ? asset.max_repay_private : asset.max_repay_public);
    } else if (actionType === 'withdraw') {
      setCurrentMaxAmount(asset.max_withdraw);
    } else if (actionType === 'borrow') {
      setCurrentMaxAmount(asset.max_borrow);
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
      let fromPublicBalance = false;
      
      if (isPrivate) {
        // Determine fromPublicBalance based on conditions
        if (actionType === 'deposit' && isSecretAdrsSelected) {
          // When depositing with a selected secret account, use public balance
          fromPublicBalance = true;
        } else if (actionType === 'repay' && modalSelectedAddress) {
          // When repaying from a selected modal address
          fromPublicBalance = true;
        }
        
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
          const newAdrsSecret = generateRandomSecret();
          if(actionType === 'deposit') {
            secretValue = newAdrsSecret;
          } else {
            secretValue = selectedAddressSecret;
          }
          if(!secretValue) secretValue = 0n;
          if (userAddress === undefined) throw new Error('User address not available');
          recipient = createPrivateAddress(newAdrsSecret, userAddress);
          addPrivateAddressWithSecret(newAdrsSecret);
          refreshAddresses();
        } else if (userAddress) {
          // Use user's public address as private recipient with secret 0n
          recipient = userAddress;
          if (actionType === 'deposit' || actionType === 'repay') {
            secretValue = 0n;
          } else if (actionType === 'withdraw' || actionType === 'borrow') {
            secretValue = selectedAddressSecret;
          }
        } else {
          throw new Error('No modal address found for private transaction');
        }
      }
      
      // Set isLocalSubmitting to true right before starting the transaction
      setIsLocalSubmitting(true);
      
      // Call onSubmit which will trigger the transaction
      await onSubmit(amount, isPrivate, recipient, secretValue, fromPublicBalance);
      
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
          
          {/* Only show New Secret Account and private addresses options when not using a secret address selection 
              for supply and borrow actions */}
          {actionType !== 'repay' && !isSecretAdrsSelected && (
            <div 
              className={`private-address-option ${showNewSecretOption ? 'selected' : ''}`}
              onClick={handleCreateNewSecret}
            >
              <div className="address-label">New Secret Account</div>
              <div className="address-value">Generate new private address</div>
            </div>
          )}
          
          {/* Only show private addresses list when not using a secret address selection for supply and borrow actions */}
          {!isSecretAdrsSelected && privateAddresses.map((addr, index) => (
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
                  // Check if the new value exceeds max amount
                  if (newValue === '') {
                    setAmount(newValue);
                  } else {
                    const maxFormatted = formatTokenAmount(currentMaxAmount, asset.decimals);
                    if (parseFloat(newValue) <= parseFloat(maxFormatted)) {
                      setAmount(newValue);
                    } else {
                      setAmount(maxFormatted);
                    }
                  }
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
          
          {/* Hide health factor preview for private deposits to addresses other than current user */}
          {!(isPrivate && actionType === 'deposit' && ((modalSelectedAddress && userAddress && !modalSelectedAddress.address.equals(userAddress)) || showNewSecretOption)) && (
            <div className="health-factor-container">
              <HealthFactorPreview 
                asset={asset}
                actionType={actionType}
                amount={amount}
              />
            </div>
          )}
          
          {isSecretAdrsSelected ? (
            <div className="privacy-info-container">
              <div className="privacy-info">
                <FiLock size={14} className="privacy-lock-icon" />
                This transaction is private
              </div>
            </div>
          ) : actionType === 'deposit' ? (
            <div className="privacy-toggle-container">
              <div className="toggle-label">
                <FiLock size={14} className="privacy-lock-icon" />
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
          ) : (
            <div className="privacy-info-container">
              <div className="privacy-info">
                <FiUnlock size={14} className="privacy-lock-icon" />
                This transaction is public
              </div>
            </div>
          )}
          
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