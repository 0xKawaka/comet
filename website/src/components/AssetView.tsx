import { useState } from 'react';
import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiArrowLeft, FiDollarSign, FiPercent, FiActivity, FiTrendingUp, FiLock, FiUnlock, FiLoader } from 'react-icons/fi';

interface AssetViewProps {
  assetId: string;
  onBack: () => void;
}

const AssetView = ({ assetId, onBack }: AssetViewProps) => {
  const { assets, isLoading, depositAsset, withdrawAsset, borrowAsset, repayAsset, userPosition } = useLending();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'deposit' | 'withdraw' | 'borrow' | 'repay'>('deposit');
  const [maxAmount, setMaxAmount] = useState<bigint>(0n);

  if (isLoading) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <button 
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'transparent',
              color: '#8a8dff',
              border: 'none',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
          </button>
        </div>
        
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '0.75rem', 
          color: '#9fa1b2',
          padding: '3rem 0' 
        }}>
          <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading asset data...</span>
        </div>
      </div>
    );
  }

  const asset = assets.find(a => a.id === assetId);
  
  if (!asset) {
    return (
      <div style={{ padding: '1rem 0' }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          marginBottom: '1rem'
        }}>
          <button 
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'transparent',
              color: '#8a8dff',
              border: 'none',
              padding: '0.5rem',
              borderRadius: '0.375rem',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
          </button>
        </div>
        
        <div style={{
          textAlign: 'center',
          padding: '2rem',
          borderRadius: '0.5rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          color: '#9fa1b2'
        }}>
          Asset not found.
        </div>
      </div>
    );
  }

  // Calculate USD values
  const totalSuppliedUsd = tokenToUsd(asset.total_supplied_with_interest, asset.decimals, asset.price);
  const totalBorrowedUsd = tokenToUsd(asset.total_borrowed_with_interest, asset.decimals, asset.price);
  const userSuppliedUsd = tokenToUsd(asset.user_supplied_with_interest, asset.decimals, asset.price);
  const userBorrowedUsd = tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
  
  const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
  const borrowableValueUsd = asset.borrowable_value_usd;
  const borrowableAmount = usdToToken(borrowableValueUsd, asset.decimals, asset.price);
  
  const availableToBorrow = borrowableAmount < asset.market_liquidity ? borrowableAmount : asset.market_liquidity;
  const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity ? asset.withdrawable_amount : asset.market_liquidity;

  const openModal = (type: 'deposit' | 'withdraw' | 'borrow' | 'repay') => {
    let max = 0n;
    
    switch (type) {
      case 'deposit':
        // The actual max value will be updated in ActionModal component based on isPrivate
        max = asset.wallet_balance;
        break;
      case 'withdraw':
        max = availableToWithdraw;
        break;
      case 'borrow':
        max = availableToBorrow;
        break;
      case 'repay':
        max = asset.user_borrowed_with_interest < asset.wallet_balance ? asset.user_borrowed_with_interest : asset.wallet_balance;
        break;
    }
    
    setActionType(type);
    setMaxAmount(max);
    setModalOpen(true);
  };

  const handleSubmit = async (amount: string, isPrivate: boolean) => {
    switch (actionType) {
      case 'deposit':
        await depositAsset(asset.id, amount, isPrivate);
        break;
      case 'withdraw':
        await withdrawAsset(asset.id, amount, isPrivate);
        break;
      case 'borrow':
        await borrowAsset(asset.id, amount, isPrivate);
        break;
      case 'repay':
        await repayAsset(asset.id, amount, isPrivate);
        break;
    }
  };

  return (
    <div style={{ 
      minHeight: '100%',
      width: '100%',
      paddingBottom: '1rem'
    }}>
      <div style={{ 
        display: 'flex',
        alignItems: 'center',
        flexDirection: 'column',
        marginBottom: '1.5rem'
      }}>

        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          width: '100%'
        }}>
          <div style={{ 
            backgroundColor: '#363952', 
            width: '3rem', 
            height: '3rem', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center',
            borderRadius: '50%',
            color: 'white',
            fontSize: '1.125rem',
            fontWeight: '700'
          }}>
            {asset.ticker.charAt(0)}
          </div>
          <div>
            <h1 style={{ 
              fontSize: '1.5rem',
              fontWeight: '700',
              margin: '0 0 0.25rem 0',
              color: 'white'
            }}>
              {asset.name} <span style={{ color: '#9fa1b2', fontWeight: '500' }}>({asset.ticker})</span>
            </h1>
            <div style={{ 
              fontSize: '1.125rem',
              color: '#d9fbff',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem'
            }}>
              <FiDollarSign />
              {formatUsdValue(asset.price, asset.decimals)}
            </div>
          </div>
        </div>
      </div>
      
      <div style={{ 
        marginBottom: '2rem',
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
        gap: '1rem'
      }}>
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiDollarSign size={14} />
            <span>Total Supplied</span>
          </div>
          <div style={{ 
            fontSize: '1.125rem',
            fontWeight: '600',
            color: 'white',
            marginBottom: '0.25rem'
          }}>
            {formatTokenAmount(asset.total_supplied_with_interest, asset.decimals)} {asset.ticker}
          </div>
          <div style={{ 
            fontSize: '0.875rem',
            color: '#10b981'
          }}>
            ${formatUsdValue(totalSuppliedUsd, asset.decimals)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiDollarSign size={14} />
            <span>Total Borrowed</span>
          </div>
          <div style={{ 
            fontSize: '1.125rem',
            fontWeight: '600',
            color: 'white',
            marginBottom: '0.25rem'
          }}>
            {formatTokenAmount(asset.total_borrowed_with_interest, asset.decimals)} {asset.ticker}
          </div>
          <div style={{ 
            fontSize: '0.875rem',
            color: '#ef4444'
          }}>
            ${formatUsdValue(totalBorrowedUsd, asset.decimals)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiDollarSign size={14} />
            <span>Market Liquidity</span>
          </div>
          <div style={{ 
            fontSize: '1.125rem',
            fontWeight: '600',
            color: 'white',
            marginBottom: '0.25rem'
          }}>
            {formatTokenAmount(asset.market_liquidity, asset.decimals)} {asset.ticker}
          </div>
          <div style={{ 
            fontSize: '0.875rem',
            color: '#9fa1b2'
          }}>
            ${formatUsdValue(tokenToUsd(asset.market_liquidity, asset.decimals, asset.price), asset.decimals)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiActivity size={14} />
            <span>Utilization Rate</span>
          </div>
          <div style={{ 
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#8a8dff'
          }}>
            {formatPercentage(asset.utilization_rate * 100)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiTrendingUp size={14} />
            <span>Supply Rate</span>
          </div>
          <div style={{ 
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#10b981',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            {formatPercentage(asset.supply_rate * 100)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiTrendingUp size={14} />
            <span>Borrow Rate</span>
          </div>
          <div style={{ 
            fontSize: '1.25rem',
            fontWeight: '600',
            color: '#ef4444',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            {formatPercentage(asset.borrow_rate * 100)}
          </div>
        </div>
        
        <div style={{ 
          padding: '1.25rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.6)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
        }}>
          <div style={{ 
            color: '#9fa1b2',
            fontSize: '0.875rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <FiPercent size={14} />
            <span>Loan to Value</span>
          </div>
          <div style={{ 
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem'
          }}>
            {formatPercentage(asset.loan_to_value * 100)}
          </div>
        </div>
      </div>
      
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
        gap: '1rem',
        marginTop: '1rem',
        width: '100%'
      }}>
        <div style={{ 
          padding: '0.75rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%'
        }}>
          <div>
            <div style={{ 
              fontSize: '1rem',
              fontWeight: '600',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Wallet Balance
            </div>
            <div>
              <div style={{ 
                display: 'flex',
                justifyContent: 'flex-start',
                gap: '2rem',
                marginBottom: '0.5rem'
              }}>
                <div>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#9fa1b2',
                    fontSize: '0.75rem',
                    marginBottom: '0.25rem'
                  }}>
                    <FiUnlock size={12} />
                    <span>Public</span>
                  </div>
                  <div style={{ 
                    fontSize: '1rem',
                    fontWeight: '500',
                    color: 'white'
                  }}>
                    {formatTokenAmount(asset.wallet_balance, asset.decimals)} {asset.ticker}
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem',
                    color: '#9fa1b2',
                    marginTop: '0.25rem'
                  }}>
                    ${formatUsdValue(tokenToUsd(asset.wallet_balance, asset.decimals, asset.price), asset.decimals)}
                  </div>
                </div>
                
                <div>
                  <div style={{ 
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    color: '#9fa1b2',
                    fontSize: '0.75rem',
                    marginBottom: '0.25rem'
                  }}>
                    <FiLock size={12} />
                    <span>Private</span>
                  </div>
                  <div style={{ 
                    fontSize: '1rem',
                    fontWeight: '500',
                    color: 'white'
                  }}>
                    {formatTokenAmount(asset.wallet_balance_private, asset.decimals)} {asset.ticker}
                  </div>
                  <div style={{ 
                    fontSize: '0.875rem',
                    color: '#9fa1b2',
                    marginTop: '0.25rem'
                  }}>
                    ${formatUsdValue(tokenToUsd(asset.wallet_balance_private, asset.decimals, asset.price), asset.decimals)}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('deposit')}
            disabled={asset.wallet_balance === 0n && asset.wallet_balance_private === 0n}
            title={(asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? "No tokens in wallet to supply" : ""}
            style={{
              background: (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) 
                ? '#363952' 
                : 'linear-gradient(to right, #d9fbff, #7531fd)',
              color: '#ffffff',
              padding: '0.5rem',
              marginTop: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: '600',
              border: 'none',
              cursor: (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? 'not-allowed' : 'pointer',
              opacity: (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? 0.5 : 1,
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
          >
            Supply
          </button>
        </div>
        
        <div style={{ 
          padding: '0.75rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%'
        }}>
          <div>
            <div style={{ 
              fontSize: '1rem',
              fontWeight: '600',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Your Deposits
            </div>
            <div>
              <div style={{ 
                fontSize: '1rem',
                fontWeight: '500',
                color: 'white'
              }}>
                {formatTokenAmount(asset.user_supplied_with_interest, asset.decimals)} {asset.ticker}
              </div>
              <div style={{ 
                fontSize: '0.875rem',
                color: '#9fa1b2',
                marginTop: '0.25rem'
              }}>
                ${formatUsdValue(userSuppliedUsd, asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('withdraw')}
            disabled={availableToWithdraw === 0n}
            title={availableToWithdraw === 0n ? "No funds available to withdraw" : ""}
            style={{
              backgroundColor: availableToWithdraw === 0n ? '#363952' : '#5f61aa',
              color: '#ffffff',
              padding: '0.5rem',
              marginTop: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: '600',
              border: 'none',
              cursor: availableToWithdraw === 0n ? 'not-allowed' : 'pointer',
              opacity: availableToWithdraw === 0n ? 0.5 : 1,
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
          >
            Withdraw
          </button>
        </div>
        
        <div style={{ 
          padding: '0.75rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%'
        }}>
          <div>
            <div style={{ 
              fontSize: '1rem',
              fontWeight: '600',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Available to Borrow
            </div>
            <div>
              <div style={{ 
                fontSize: '1rem',
                fontWeight: '500',
                color: 'white'
              }}>
                {formatTokenAmount(availableToBorrow, asset.decimals)} {asset.ticker}
              </div>
              <div style={{ 
                fontSize: '0.875rem',
                color: '#9fa1b2',
                marginTop: '0.25rem'
              }}>
                ${formatUsdValue(tokenToUsd(availableToBorrow, asset.decimals, asset.price), asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('borrow')}
            disabled={!asset.is_borrowable || availableToBorrow === 0n}
            title={!asset.is_borrowable ? "Asset not borrowable" : availableToBorrow === 0n ? "No assets available to borrow" : ""}
            style={{
              background: (!asset.is_borrowable || availableToBorrow === 0n) 
                ? '#363952' 
                : 'linear-gradient(to right, #d9fbff, #7531fd)',
              color: '#ffffff',
              padding: '0.5rem',
              marginTop: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: '600',
              border: 'none',
              cursor: (!asset.is_borrowable || availableToBorrow === 0n) ? 'not-allowed' : 'pointer',
              opacity: (!asset.is_borrowable || availableToBorrow === 0n) ? 0.5 : 1,
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
          >
            Borrow
          </button>
        </div>
        
        <div style={{ 
          padding: '0.75rem',
          borderRadius: '0.75rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          backdropFilter: 'blur(4px)',
          border: '1px solid rgba(54, 57, 82, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          height: '100%'
        }}>
          <div>
            <div style={{ 
              fontSize: '1rem',
              fontWeight: '600',
              color: 'white',
              marginBottom: '0.5rem'
            }}>
              Your Borrows
            </div>
            <div>
              <div style={{ 
                fontSize: '1rem',
                fontWeight: '500',
                color: 'white'
              }}>
                {formatTokenAmount(asset.user_borrowed_with_interest, asset.decimals)} {asset.ticker}
              </div>
              <div style={{ 
                fontSize: '0.875rem',
                color: '#9fa1b2',
                marginTop: '0.25rem'
              }}>
                ${formatUsdValue(userBorrowedUsd, asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('repay')}
            disabled={asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)}
            title={asset.user_borrowed_with_interest === 0n ? "No outstanding debt to repay" : (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? "No tokens in wallet to repay with" : ""}
            style={{
              backgroundColor: (asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)) 
                ? '#363952' 
                : '#5f61aa',
              color: '#ffffff',
              padding: '0.5rem',
              marginTop: '0.75rem',
              borderRadius: '0.5rem',
              fontWeight: '600',
              border: 'none',
              cursor: (asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)) ? 'not-allowed' : 'pointer',
              opacity: (asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)) ? 0.5 : 1,
              transition: 'all 0.2s',
              fontSize: '0.875rem'
            }}
          >
            Repay
          </button>
        </div>
      </div>
      
      {modalOpen && (
        <ActionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          asset={asset}
          actionType={actionType}
          maxAmount={maxAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

export default AssetView; 