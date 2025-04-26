import { useState } from 'react';
import { useLending, Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatHealthFactor, getHealthFactorClass, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiDollarSign, FiTrendingUp, FiLoader, FiShield, FiActivity } from 'react-icons/fi';

interface UserDashboardViewProps {
  onAssetSelect: (assetId: string) => void;
}

const UserDashboardView = ({ onAssetSelect }: UserDashboardViewProps) => {
  const { assets, userPosition, isLoading, depositAsset, withdrawAsset, borrowAsset, repayAsset } = useLending();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    asset: Asset;
    actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay';
    maxAmount: bigint;
  } | null>(null);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <h2 style={{ 
          fontSize: '1.75rem', 
          marginBottom: '1rem',
          fontWeight: '700',
          color: 'white' 
        }}>Your Dashboard</h2>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '0.75rem', 
          color: '#9fa1b2' 
        }}>
          <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading your positions...</span>
        </div>
      </div>
    );
  }

  // Filter assets where user has deposited or borrowed
  const depositedAssets = assets.filter(asset => asset.user_supplied_with_interest > 0n);
  const borrowedAssets = assets.filter(asset => asset.user_borrowed_with_interest > 0n);

  const openModal = (asset: Asset, actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay') => {
    let maxAmount = 0n;
    
    switch (actionType) {
      case 'deposit':
        maxAmount = asset.wallet_balance;
        break;
      case 'withdraw':
        // Consider withdrawable amount and market liquidity constraints
        const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity 
          ? asset.withdrawable_amount 
          : asset.market_liquidity;
        maxAmount = availableToWithdraw;
        break;
      case 'borrow':
        // Use borrowable_value_usd from the asset instead of manual calculation
        const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
        
        // Consider market liquidity constraints
        const availableToBorrow = borrowableAmount < asset.market_liquidity 
          ? borrowableAmount 
          : asset.market_liquidity;
        
        maxAmount = availableToBorrow;
        break;
      case 'repay':
        maxAmount = asset.user_borrowed_with_interest < asset.wallet_balance 
          ? asset.user_borrowed_with_interest 
          : asset.wallet_balance;
        break;
    }
    
    setModalConfig({ asset, actionType, maxAmount });
    setModalOpen(true);
  };

  const handleSubmit = async (amount: string, isPrivate: boolean) => {
    if (!modalConfig) return;
    
    const { asset, actionType } = modalConfig;
    
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

  const renderHealthFactor = () => {
    const healthFactor = userPosition.health_factor;
    
    // Define colors based on health factor
    let healthStyle = {
      background: 'rgba(16, 185, 129, 0.15)',
      borderColor: 'rgba(16, 185, 129, 0.5)',
      color: '#10b981'
    };
    
    if (healthFactor < 120n) {
      healthStyle = {
        background: 'rgba(239, 68, 68, 0.15)',
        borderColor: 'rgba(239, 68, 68, 0.5)',
        color: '#ef4444'
      };
    } else if (healthFactor < 200n) {
      healthStyle = {
        background: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.5)',
        color: '#f59e0b'
      };
    }
    
    return (
      <div style={{ 
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        backgroundColor: 'rgba(34, 37, 58, 0.5)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(54, 57, 82, 0.5)',
        margin: '0 0 2rem 0'
      }}>
        <div style={{ 
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <h3 style={{ 
            fontSize: '1.25rem',
            fontWeight: '600',
            color: 'white',
            margin: 0
          }}>
            Position Overview
          </h3>
        </div>
        
        <div style={{ 
          display: 'flex',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div style={{ 
            flex: '1 1 0',
            minWidth: '240px',
            padding: '1.25rem',
            borderRadius: '0.75rem',
            backgroundColor: healthStyle.background,
            border: `1px solid ${healthStyle.borderColor}`,
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: healthStyle.color,
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              <FiShield />
              <span>Health Factor</span>
            </div>
            <div style={{ 
              fontSize: '1.5rem',
              fontWeight: '700',
              color: healthStyle.color
            }}>
              {formatHealthFactor(healthFactor)}
            </div>
          </div>
          
          <div style={{ 
            flex: '1 1 0',
            minWidth: '240px',
            padding: '1.25rem',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(34, 37, 58, 0.5)',
            border: '1px solid rgba(54, 57, 82, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#9fa1b2',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              <FiDollarSign />
              <span>Total Supplied</span>
            </div>
            <div style={{ 
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#10b981'
            }}>
              ${formatUsdValue(userPosition.total_supplied_value, 9)}
            </div>
          </div>
          
          <div style={{ 
            flex: '1 1 0',
            minWidth: '240px',
            padding: '1.25rem',
            borderRadius: '0.75rem',
            backgroundColor: 'rgba(34, 37, 58, 0.5)',
            border: '1px solid rgba(54, 57, 82, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem'
          }}>
            <div style={{ 
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              color: '#9fa1b2',
              fontSize: '0.875rem',
              fontWeight: '500'
            }}>
              <FiDollarSign />
              <span>Total Borrowed</span>
            </div>
            <div style={{ 
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#ef4444'
            }}>
              ${formatUsdValue(userPosition.total_borrowed_value, 9)}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  const renderEmptyState = () => (
    <div style={{
      textAlign: 'center',
      padding: '3rem 1rem',
      backgroundColor: 'rgba(34, 37, 58, 0.5)',
      borderRadius: '0.75rem',
      color: '#9fa1b2',
      border: '1px solid rgba(54, 57, 82, 0.5)',
    }}>
      <p style={{ 
        fontSize: '1.125rem', 
        marginBottom: '1.5rem' 
      }}>
        You don't have any active positions yet.
      </p>
      <p>Select an asset from the Markets tab to start lending or borrowing.</p>
    </div>
  );

  return (
    <div>
      <h2 style={{ 
        fontSize: '1.75rem', 
        marginBottom: '1.5rem',
        fontWeight: '700',
        color: 'white' 
      }}>Your Dashboard</h2>
      
      {userPosition.total_borrowed_value > 0 && renderHealthFactor()}
      
      {depositedAssets.length === 0 && borrowedAssets.length === 0 ? (
        renderEmptyState()
      ) : (
        <>
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem'
            }}>
              <h3 style={{ 
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'white',
                margin: 0
              }}>
                Your Deposits
              </h3>
              <div style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                padding: '0.375rem 0.75rem',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <FiDollarSign size={14} />
                <span>Total: ${formatUsdValue(userPosition.total_supplied_value, 9)}</span>
              </div>
            </div>
            
            {depositedAssets.length === 0 ? (
              <div style={{
                padding: '1.5rem',
                backgroundColor: 'rgba(34, 37, 58, 0.5)',
                borderRadius: '0.75rem',
                color: '#9fa1b2',
                textAlign: 'center',
                border: '1px solid rgba(54, 57, 82, 0.5)',
              }}>
                You haven't deposited any assets yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: '0',
                  color: 'white'
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Asset</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Deposited Amount</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Supply Rate</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {depositedAssets.map(asset => {
                      const suppliedFormatted = formatTokenAmount(asset.user_supplied_with_interest, asset.decimals);
                      const suppliedValueUsd = formatUsdValue(
                        tokenToUsd(asset.user_supplied_with_interest, asset.decimals, asset.price),
                        asset.decimals
                      );
                      const supplyRate = formatPercentage(asset.supply_rate * 100);
                      
                      // Calculate withdrawable amount with constraints
                      const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity 
                        ? asset.withdrawable_amount 
                        : asset.market_liquidity;
                      
                      return (
                        <tr 
                          key={asset.id} 
                          onClick={() => onAssetSelect(asset.id)}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(117, 49, 253, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ 
                                backgroundColor: '#363952', 
                                width: '2.5rem', 
                                height: '2.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                borderRadius: '50%',
                                color: 'white'
                              }}>
                                {asset.ticker.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontWeight: '600', fontSize: '1rem' }}>{asset.name}</div>
                                <div style={{ color: '#9fa1b2', fontSize: '0.875rem', marginTop: '0.25rem' }}>{asset.ticker}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                            textAlign: 'right'
                          }}>
                            <div style={{ fontWeight: '500' }}>{suppliedFormatted} {asset.ticker}</div>
                            <div style={{ color: '#9fa1b2', fontSize: '0.75rem', marginTop: '0.25rem' }}>${suppliedValueUsd}</div>
                          </td>
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                            textAlign: 'right',
                            color: '#10b981',
                            fontWeight: '600',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                              <FiTrendingUp size={14} />
                              {supplyRate}
                            </div>
                          </td>
                          <td 
                            onClick={e => e.stopPropagation()} 
                            style={{
                              padding: '1rem 1.25rem',
                              borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                              textAlign: 'right'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => openModal(asset, 'deposit')}
                                disabled={asset.wallet_balance === 0n}
                                style={{
                                  background: 'linear-gradient(to right, #d9fbff, #7531fd)',
                                  color: '#ffffff',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  fontWeight: '500',
                                  border: 'none',
                                  cursor: asset.wallet_balance === 0n ? 'not-allowed' : 'pointer',
                                  opacity: asset.wallet_balance === 0n ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                              >
                                Supply
                              </button>
                              <button 
                                onClick={() => openModal(asset, 'withdraw')}
                                disabled={availableToWithdraw === 0n}
                                style={{
                                  backgroundColor: '#363952',
                                  color: '#ffffff',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  fontWeight: '500',
                                  border: 'none',
                                  cursor: availableToWithdraw === 0n ? 'not-allowed' : 'pointer',
                                  opacity: availableToWithdraw === 0n ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                              >
                                Withdraw
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          
          <div style={{ marginBottom: '2rem' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '1rem'
            }}>
              <h3 style={{ 
                fontSize: '1.25rem',
                fontWeight: '600',
                color: 'white',
                margin: 0
              }}>
                Your Borrows
              </h3>
              <div style={{
                fontSize: '0.875rem',
                fontWeight: '600',
                color: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                padding: '0.375rem 0.75rem',
                borderRadius: '0.5rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}>
                <FiDollarSign size={14} />
                <span>Total: ${formatUsdValue(userPosition.total_borrowed_value, 9)}</span>
              </div>
            </div>
            
            {borrowedAssets.length === 0 ? (
              <div style={{
                padding: '1.5rem',
                backgroundColor: 'rgba(34, 37, 58, 0.5)',
                borderRadius: '0.75rem',
                color: '#9fa1b2',
                textAlign: 'center',
                border: '1px solid rgba(54, 57, 82, 0.5)',
              }}>
                You haven't borrowed any assets yet.
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{
                  width: '100%',
                  borderCollapse: 'separate',
                  borderSpacing: '0',
                  color: 'white'
                }}>
                  <thead>
                    <tr>
                      <th style={{
                        textAlign: 'left',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Asset</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Borrowed Amount</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Borrow Rate</th>
                      <th style={{
                        textAlign: 'right',
                        padding: '1rem 1.25rem',
                        borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                        fontWeight: '600',
                        color: '#9fa1b2',
                        fontSize: '0.875rem'
                      }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {borrowedAssets.map(asset => {
                      const borrowedFormatted = formatTokenAmount(asset.user_borrowed_with_interest, asset.decimals);
                      const borrowedValueUsd = formatUsdValue(
                        tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price),
                        asset.decimals
                      );
                      const borrowRate = formatPercentage(asset.borrow_rate * 100);
                      
                      // Calculate borrowable amount with constraints
                      const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
                      const availableToBorrow = borrowableAmount < asset.market_liquidity 
                        ? borrowableAmount 
                        : asset.market_liquidity;
                      
                      return (
                        <tr 
                          key={asset.id} 
                          onClick={() => onAssetSelect(asset.id)}
                          style={{ 
                            cursor: 'pointer',
                            transition: 'background-color 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.backgroundColor = 'rgba(117, 49, 253, 0.1)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.backgroundColor = 'transparent';
                          }}
                        >
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                              <div style={{ 
                                backgroundColor: '#363952', 
                                width: '2.5rem', 
                                height: '2.5rem', 
                                display: 'flex', 
                                alignItems: 'center', 
                                justifyContent: 'center',
                                borderRadius: '50%',
                                color: 'white'
                              }}>
                                {asset.ticker.charAt(0)}
                              </div>
                              <div>
                                <div style={{ fontWeight: '600', fontSize: '1rem' }}>{asset.name}</div>
                                <div style={{ color: '#9fa1b2', fontSize: '0.875rem', marginTop: '0.25rem' }}>{asset.ticker}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                            textAlign: 'right'
                          }}>
                            <div style={{ fontWeight: '500' }}>{borrowedFormatted} {asset.ticker}</div>
                            <div style={{ color: '#9fa1b2', fontSize: '0.75rem', marginTop: '0.25rem' }}>${borrowedValueUsd}</div>
                          </td>
                          <td style={{
                            padding: '1rem 1.25rem',
                            borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                            textAlign: 'right',
                            color: '#ef4444',
                            fontWeight: '600',
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                              <FiTrendingUp size={14} />
                              {borrowRate}
                            </div>
                          </td>
                          <td 
                            onClick={e => e.stopPropagation()} 
                            style={{
                              padding: '1rem 1.25rem',
                              borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                              textAlign: 'right'
                            }}
                          >
                            <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                              <button 
                                onClick={() => openModal(asset, 'borrow')}
                                disabled={userPosition.health_factor < 105n || availableToBorrow === 0n}
                                title={userPosition.health_factor < 105n ? "Health factor too low" : availableToBorrow === 0n ? "No assets available to borrow" : ""}
                                style={{
                                  background: 'linear-gradient(to right, #d9fbff, #7531fd)',
                                  color: '#ffffff',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  fontWeight: '500',
                                  border: 'none',
                                  cursor: userPosition.health_factor < 105n || availableToBorrow === 0n ? 'not-allowed' : 'pointer',
                                  opacity: userPosition.health_factor < 105n || availableToBorrow === 0n ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                              >
                                Borrow
                              </button>
                              <button 
                                onClick={() => openModal(asset, 'repay')}
                                disabled={asset.wallet_balance === 0n}
                                style={{
                                  backgroundColor: '#363952',
                                  color: '#ffffff',
                                  padding: '0.5rem 1rem',
                                  borderRadius: '0.5rem',
                                  fontWeight: '500',
                                  border: 'none',
                                  cursor: asset.wallet_balance === 0n ? 'not-allowed' : 'pointer',
                                  opacity: asset.wallet_balance === 0n ? 0.5 : 1,
                                  transition: 'all 0.2s'
                                }}
                              >
                                Repay
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
      
      {modalOpen && modalConfig && (
        <ActionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          asset={modalConfig.asset}
          actionType={modalConfig.actionType}
          maxAmount={modalConfig.maxAmount}
          onSubmit={handleSubmit}
        />
      )}
    </div>
  );
};

export default UserDashboardView; 