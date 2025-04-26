import { useState, useEffect } from 'react';
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

  const getActionButtonStyle = () => {
    switch (actionType) {
      case 'deposit':
      case 'borrow':
        return {
          background: 'linear-gradient(to right, #d9fbff, #7531fd)',
          color: '#ffffff'
        };
      case 'withdraw':
      case 'repay':
        return {
          backgroundColor: '#5f61aa',
          color: '#ffffff'
        };
      default:
        return {
          backgroundColor: '#363952',
          color: '#ffffff'
        };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(16, 18, 29, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      backdropFilter: 'blur(4px)'
    }} onClick={onClose}>
      <div style={{
        backgroundColor: 'rgba(25, 27, 42, 0.95)',
        borderRadius: '1rem',
        width: '90%',
        maxWidth: '480px',
        boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
        border: '1px solid rgba(54, 57, 82, 0.5)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          padding: '1.25rem',
          borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h2 style={{
            margin: 0,
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'white'
          }}>
            {getActionTitle()} {asset.name} ({asset.ticker})
          </h2>
          <button style={{
            background: 'none',
            border: 'none',
            fontSize: '1.5rem',
            color: '#9fa1b2',
            cursor: 'pointer',
            padding: '0.25rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '50%',
            width: '2rem',
            height: '2rem',
            transition: 'all 0.2s'
          }} 
          onClick={onClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(54, 57, 82, 0.5)';
            e.currentTarget.style.color = 'white';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'transparent';
            e.currentTarget.style.color = '#9fa1b2';
          }}>
            &times;
          </button>
        </div>
        
        <div style={{
          padding: '1.5rem',
          flex: 1
        }}>
          <div style={{
            display: 'flex',
            gap: '0.5rem',
            marginBottom: '1rem'
          }}>
            <input
              type="text"
              placeholder="Amount"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              disabled={isSubmitting}
              style={{
                flex: 1,
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid rgba(54, 57, 82, 0.8)',
                backgroundColor: 'rgba(34, 37, 58, 0.6)',
                color: 'white',
                fontSize: '1rem',
                outline: 'none',
                transition: 'border-color 0.2s'
              }}
              onFocus={(e) => {
                e.target.style.borderColor = '#8a8dff';
              }}
              onBlur={(e) => {
                e.target.style.borderColor = 'rgba(54, 57, 82, 0.8)';
              }}
            />
            <button 
              onClick={handleSetMax}
              disabled={currentMaxAmount === 0n || isSubmitting}
              style={{
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                border: 'none',
                backgroundColor: currentMaxAmount === 0n || isSubmitting ? '#363952' : '#5f61aa',
                color: 'white',
                fontWeight: '600',
                cursor: currentMaxAmount === 0n || isSubmitting ? 'not-allowed' : 'pointer',
                opacity: currentMaxAmount === 0n || isSubmitting ? 0.5 : 1,
                transition: 'all 0.2s'
              }}
            >
              MAX
            </button>
          </div>
          
          <div style={{ 
            marginBottom: '1.25rem',
            backgroundColor: 'rgba(34, 37, 58, 0.4)',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(54, 57, 82, 0.5)'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '0.5rem'
            }}>
              <span style={{ color: '#9fa1b2', fontSize: '0.875rem' }}>Public Balance:</span>
              <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>
                {formatTokenAmount(asset.wallet_balance, asset.decimals)} {asset.ticker}
              </span>
            </div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between'
            }}>
              <span style={{ color: '#9fa1b2', fontSize: '0.875rem' }}>Private Balance:</span>
              <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: '500' }}>
                {formatTokenAmount(asset.wallet_balance_private, asset.decimals)} {asset.ticker}
              </span>
            </div>
          </div>
          
          <div style={{ marginBottom: '1.25rem' }}>
            <HealthFactorPreview 
              asset={asset}
              actionType={actionType}
              amount={amount}
            />
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between',
            backgroundColor: 'rgba(34, 37, 58, 0.4)',
            padding: '0.75rem',
            borderRadius: '0.5rem',
            border: '1px solid rgba(54, 57, 82, 0.5)'
          }}>
            <span style={{ color: 'white', fontSize: '0.875rem' }}>Private Transaction</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ 
                marginRight: '10px', 
                fontSize: '0.875rem',
                fontWeight: isPrivate ? '600' : 'normal',
                color: isPrivate ? '#d9fbff' : '#9fa1b2'
              }}>
                {isPrivate ? 'ON' : 'OFF'}
              </span>
              <label style={{ 
                position: 'relative', 
                display: 'inline-block', 
                width: '48px', 
                height: '24px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={isPrivate}
                  onChange={() => setIsPrivate(!isPrivate)}
                  disabled={isSubmitting}
                  style={{ opacity: 0, width: 0, height: 0 }}
                />
                <span style={{
                  position: 'absolute',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: isPrivate ? '#8a8dff' : '#363952',
                  transition: '.3s',
                  borderRadius: '24px',
                }}>
                  <span style={{
                    position: 'absolute',
                    content: '""',
                    height: '18px',
                    width: '18px',
                    left: isPrivate ? '27px' : '3px',
                    bottom: '3px',
                    backgroundColor: 'white',
                    transition: '.3s',
                    borderRadius: '50%',
                  }}/>
                </span>
              </label>
            </div>
          </div>
          
          {error && (
            <div style={{ 
              color: '#ef4444', 
              marginTop: '1rem',
              padding: '0.75rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              borderRadius: '0.5rem',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              fontSize: '0.875rem'
            }}>
              {error}
            </div>
          )}
        </div>
        
        <div style={{
          padding: '1.25rem',
          borderTop: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '0.75rem'
        }}>
          <button 
            onClick={onClose}
            disabled={isSubmitting}
            style={{
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: '1px solid rgba(54, 57, 82, 0.8)',
              backgroundColor: 'transparent',
              color: '#9fa1b2',
              fontWeight: '600',
              cursor: isSubmitting ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
            onMouseEnter={(e) => {
              if (!isSubmitting) {
                e.currentTarget.style.backgroundColor = 'rgba(54, 57, 82, 0.3)';
                e.currentTarget.style.color = 'white';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent';
              e.currentTarget.style.color = '#9fa1b2';
            }}
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            disabled={isSubmitting || !amount || parseFloat(amount) <= 0}
            style={{
              ...getActionButtonStyle(),
              padding: '0.625rem 1.25rem',
              borderRadius: '0.5rem',
              border: 'none',
              fontWeight: '600',
              cursor: (isSubmitting || !amount || parseFloat(amount) <= 0) ? 'not-allowed' : 'pointer',
              opacity: (isSubmitting || !amount || parseFloat(amount) <= 0) ? 0.5 : 1,
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
          >
            {isSubmitting ? 'Processing...' : getActionTitle()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ActionModal; 