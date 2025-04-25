import { useState } from 'react';
import { Asset } from '../contexts/LendingContext';
import { formatTokenAmount } from '../utils/formatters';
import HealthFactorPreview from './HealthFactorPreview';

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

  if (!isOpen) return null;

  const handleSetMax = () => {
    setAmount(formatTokenAmount(maxAmount, asset.decimals));
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
      case 'deposit': return 'Deposit';
      case 'withdraw': return 'Withdraw';
      case 'borrow': return 'Borrow';
      case 'repay': return 'Repay';
      default: return 'Action';
    }
  };

  const getActionButton = () => {
    switch (actionType) {
      case 'deposit': return 'supply-button';
      case 'withdraw': return 'withdraw-button';
      case 'borrow': return 'borrow-button';
      case 'repay': return 'repay-button';
      default: return 'action-button';
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">
            {getActionTitle()} {asset.name} ({asset.ticker})
          </h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="input-with-max">
            <input
              type="text"
              placeholder="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={isSubmitting}
            />
            <button 
              className="max-button"
              onClick={handleSetMax}
              disabled={maxAmount === 0n || isSubmitting}
            >
              MAX
            </button>
          </div>
          
          <HealthFactorPreview 
            asset={asset}
            actionType={actionType}
            amount={amount}
          />
          
          <div className="privacy-toggle-container" style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>Private Transaction</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ 
                marginRight: '10px', 
                fontWeight: isPrivate ? 'bold' : 'normal',
                color: isPrivate ? '#2196F3' : '#666'
              }}>
                {isPrivate ? 'Privacy ON' : 'Privacy OFF'}
              </span>
              <label className="toggle-switch" style={{ position: 'relative', display: 'inline-block', width: '60px', height: '34px' }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(!isPrivate)}
                  disabled={isSubmitting}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span 
                  className="toggle-slider" 
                  style={{
                    position: 'absolute',
                    cursor: 'pointer',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: isPrivate ? '#2196F3' : '#ccc',
                    transition: '.4s',
                    borderRadius: '34px',
                  }}
                >
                  <span 
                    style={{
                      position: 'absolute',
                      content: '""',
                      height: '26px',
                      width: '26px',
                      left: isPrivate ? '30px' : '4px',
                      bottom: '4px',
                      backgroundColor: 'white',
                      transition: '.4s',
                      borderRadius: '50%',
                    }}
                  />
                </span>
              </label>
            </div>
          </div>
          
          {error && (
            <div className="error-message" style={{ color: 'red', marginTop: '12px' }}>
              {error}
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            className="modal-button modal-cancel" 
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button 
            className={`modal-button modal-action ${getActionButton()}`}
            onClick={handleSubmit}
            disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
          >
            {isSubmitting ? 'Processing...' : getActionTitle()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal; 