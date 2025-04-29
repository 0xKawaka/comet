import { useState } from 'react';
import { useLending, Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiDollarSign, FiTrendingUp, FiLoader } from 'react-icons/fi';
import HealthFactorIndicator from './HealthFactorIndicator';
import './UserDashboardView.css';

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
      <div className="loading-container">
        <h2 className="dashboard-heading">Your Dashboard</h2>
        <div className="loading-text">
          <FiLoader className="loading-icon" />
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
    
    return (
      <div className="position-overview">
        <div className="position-header">
          <h3 className="position-title">
            Position Overview
          </h3>
        </div>
        
        <div className="position-metrics">
          <div className="metric-card">
            <HealthFactorIndicator 
              healthFactor={healthFactor} 
              size="large" 
            />
          </div>
          
          <div className="metric-card">
            <div className="metric-label">
              <FiDollarSign />
              <span>Total Supplied</span>
            </div>
            <div className="metric-value-positive">
              ${formatUsdValue(userPosition.total_supplied_value, 9)}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">
              <FiDollarSign />
              <span>Total Borrowed</span>
            </div>
            <div className="metric-value-negative">
              ${formatUsdValue(userPosition.total_borrowed_value, 9)}
            </div>
          </div>
        </div>
      </div>
    );
  };
  
  const renderEmptyState = () => (
    <div className="empty-state">
      <p className="empty-state-title">
        You don't have any active positions yet.
      </p>
      <p>Select an asset from the Markets tab to start lending or borrowing.</p>
    </div>
  );

  return (
    <div className="user-dashboard">
      <h2 className="dashboard-heading">Your Dashboard</h2>
      
      {userPosition.total_borrowed_value > 0 && renderHealthFactor()}
      
      {depositedAssets.length === 0 && borrowedAssets.length === 0 ? (
        renderEmptyState()
      ) : (
        <>
          <div className="section-content">
            <div className="section-header">
              <h3 className="section-title">
                Your Deposits
              </h3>
              <div className={`section-total positive-total`}>
                <FiDollarSign size={14} />
                <span>Total: ${formatUsdValue(userPosition.total_supplied_value, 9)}</span>
              </div>
            </div>
            
            {depositedAssets.length === 0 ? (
              <div className="empty-section">
                You haven't deposited any assets yet.
              </div>
            ) : (
              <div className="table-container">
                <table className="assets-table">
                  <thead className="table-header">
                    <tr>
                      <th>Asset</th>
                      <th className="right-align">Deposited Amount</th>
                      <th className="right-align">Supply Rate</th>
                      <th className="right-align">Actions</th>
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
                          className="asset-row"
                        >
                          <td>
                            <div className="asset-info">
                              <div className="asset-icon">
                                {asset.ticker.charAt(0)}
                              </div>
                              <div>
                                <div className="asset-name">{asset.name}</div>
                                <div className="asset-ticker">{asset.ticker}</div>
                              </div>
                            </div>
                          </td>
                          <td className="amount-cell">
                            <div className="amount-primary">{suppliedFormatted} {asset.ticker}</div>
                            <div className="amount-secondary">${suppliedValueUsd}</div>
                          </td>
                          <td>
                            <div className="rate-cell positive-rate">
                              {supplyRate}
                            </div>
                          </td>
                          <td 
                            onClick={() => onAssetSelect(asset.id)} 
                            className="action-cell"
                          >
                            <div className="action-buttons">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(asset, 'deposit');
                                }}
                                disabled={asset.wallet_balance === 0n}
                                className="primary-button"
                              >
                                Supply
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(asset, 'withdraw');
                                }}
                                disabled={availableToWithdraw === 0n}
                                className="secondary-button"
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
          
          <div className="section-content">
            <div className="section-header">
              <h3 className="section-title">
                Your Borrows
              </h3>
              <div className={`section-total negative-total`}>
                <FiDollarSign size={14} />
                <span>Total: ${formatUsdValue(userPosition.total_borrowed_value, 9)}</span>
              </div>
            </div>
            
            {borrowedAssets.length === 0 ? (
              <div className="empty-section">
                You haven't borrowed any assets yet.
              </div>
            ) : (
              <div className="table-container">
                <table className="assets-table">
                  <thead className="table-header">
                    <tr>
                      <th>Asset</th>
                      <th className="right-align">Borrowed Amount</th>
                      <th className="right-align">Borrow Rate</th>
                      <th className="right-align">Actions</th>
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
                      const availableToBorrow = borrowableAmount < asset.market_liquidity ? borrowableAmount : asset.market_liquidity;

                      
                      return (
                        <tr 
                          key={asset.id} 
                          onClick={() => onAssetSelect(asset.id)}
                          className="asset-row"
                        >
                          <td>
                            <div className="asset-info">
                              <div className="asset-icon">
                                {asset.ticker.charAt(0)}
                              </div>
                              <div>
                                <div className="asset-name">{asset.name}</div>
                                <div className="asset-ticker">{asset.ticker}</div>
                              </div>
                            </div>
                          </td>
                          <td className="amount-cell">
                            <div className="amount-primary">{borrowedFormatted} {asset.ticker}</div>
                            <div className="amount-secondary">${borrowedValueUsd}</div>
                          </td>
                          <td>
                            <div className="rate-cell negative-rate">
                              {borrowRate}
                            </div>
                          </td>
                          <td 
                            onClick={() => onAssetSelect(asset.id)} 
                            className="action-cell"
                          >
                            <div className="action-buttons">
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(asset, 'borrow');
                                }}
                                disabled={!asset.is_borrowable || availableToBorrow === 0n}
                                title={!asset.is_borrowable ? "Asset not borrowable" : availableToBorrow === 0n ? "No assets available to borrow" : ""}
                                className="primary-button"
                              >
                                Borrow
                              </button>
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openModal(asset, 'repay');
                                }}
                                disabled={asset.wallet_balance === 0n}
                                className="secondary-button"
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