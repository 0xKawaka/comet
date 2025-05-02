import { useState, useEffect } from 'react';
import { Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';
import { FiUnlock, FiLock } from 'react-icons/fi';
import HealthFactorPreview from './HealthFactorPreview';
import './ActionModal.css';

interface ActionModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: Asset;
  actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay';
  maxAmount: bigint;
  onSubmit: (amount: string, isPrivate: boolean) => Promise<void>;
}

const ActionModal = ({ 
  isOpen, 
  onClose, 
  asset, 
  actionType, 
  maxAmount,
  onSubmit 
}: ActionModalProps) => {
  const [amount, setAmount] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentMaxAmount, setCurrentMaxAmount] = useState<bigint>(maxAmount);

  useEffect(() => {
    // Update max amount when privacy toggle changes, but only for deposit action
    if (actionType === 'deposit') {
      setCurrentMaxAmount(isPrivate ? asset.wallet_balance_private : asset.wallet_balance);
    } else {
      setCurrentMaxAmount(maxAmount);
    }
  }, [isPrivate, actionType, asset, maxAmount]);

  if (!isOpen) return null;

  const handleSetMax = () => {
    setAmount(formatTokenAmount(currentMaxAmount, asset.decimals));
  };

  const handleSubmit = async () => {
    if (!amount || parseFloat(amount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }

    setError(null);
    setIsSubmitting(true);
    
    try {
      await onSubmit(amount, isPrivate);
      onClose();
      setAmount('');
    } catch (error) {
      console.error(`Error during ${actionType}:`, error);
      setError(`Transaction failed. ${error instanceof Error ? error.message : 'Please try again.'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getActionTitle = () => {
    switch (actionType) {
      case 'deposit': return 'Supply';
      case 'withdraw': return 'Withdraw';
      case 'borrow': return 'Borrow';
      case 'repay': return 'Repay';
      default: return 'Action';
    }
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
                <div className="wallet-balance-item">
                  <div className="balance-type-label">
                    <FiUnlock size={12} />
                    <span>Public</span>
                  </div>
                  <div className="balance-value">
                    {formatTokenAmount(asset.wallet_balance, asset.decimals)} {asset.ticker}
                  </div>
                  <div className="balance-usd-value">
                    ${formatUsdValue(tokenToUsd(asset.wallet_balance, asset.decimals, asset.price), asset.decimals)}
                  </div>
                </div>
                
                <div className="wallet-balance-item">
                  <div className="balance-type-label">
                    <FiLock size={12} />
                    <span>Private</span>
                  </div>
                  <div className="balance-value">
                    {formatTokenAmount(asset.wallet_balance_private, asset.decimals)} {asset.ticker}
                  </div>
                  <div className="balance-usd-value">
                    ${formatUsdValue(tokenToUsd(asset.wallet_balance_private, asset.decimals, asset.price), asset.decimals)}
                  </div>
                </div>
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