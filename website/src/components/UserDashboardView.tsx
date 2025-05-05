import { useState, useEffect } from 'react';
import { useLending, Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiDollarSign, FiTrendingUp, FiLoader } from 'react-icons/fi';
import HealthFactorIndicator from './HealthFactorIndicator';
import { useTransaction } from '../hooks';
import { AztecAddress } from '@aztec/aztec.js';
import './UserDashboardView.css';

interface UserDashboardViewProps {
  onAssetSelect: (assetId: string) => void;
}

type ActionType = 'deposit' | 'withdraw' | 'borrow' | 'repay';

// Helper component for rendering asset info
const AssetInfo = ({ asset }: { asset: Asset }) => (
  <div className="asset-info">
    <div className="asset-icon">
      {asset.ticker.charAt(0)}
    </div>
    <div>
      <div className="asset-name">{asset.name}</div>
      <div className="asset-ticker">{asset.ticker}</div>
    </div>
  </div>
);

const UserDashboardView = ({ onAssetSelect }: UserDashboardViewProps) => {
  const { assets, userPosition, isLoading, depositAsset, withdrawAsset, borrowAsset, repayAsset } = useLending();
  const { privateAddresses } = useTransaction();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [modalConfig, setModalConfig] = useState<{
    asset: Asset;
    actionType: ActionType;
    maxAmount: bigint;
  } | null>(null);
  
  const [lastAssets, setLastAssets] = useState<Asset[]>([]);
  const [lastUserPosition, setLastUserPosition] = useState<typeof userPosition | null>(null);

  // Store the last loaded assets and position to prevent flickering during transitions
  useEffect(() => {
    if (assets.length > 0) {
      setLastAssets(assets);
    }
    if (userPosition) {
      setLastUserPosition(userPosition);
    }
  }, [assets, userPosition]);

  // True loading state - first load with no previous data
  if (isLoading && assets.length === 0 && lastAssets.length === 0) {
    return (
      <div className="dashboard-container">
        <div className="dashboard-heading">Your Dashboard</div>
        <div className="loading-container">
          <FiLoader className="spinning" />
          <span>Loading your positions...</span>
        </div>
      </div>
    );
  }

  // Use cached data during refreshes
  const displayAssets = assets.length > 0 ? assets : lastAssets;
  const displayUserPosition = userPosition && userPosition.total_supplied_value > 0n
    ? userPosition
    : lastUserPosition && lastUserPosition.total_supplied_value > 0n
      ? lastUserPosition
      : userPosition;
  
  // Show loading overlay during refreshes
  const showLoadingOverlay = isLoading && displayAssets.length > 0;

  // Filter assets where user has deposited or borrowed
  const depositedAssets = displayAssets.filter(asset => asset.user_supplied_with_interest > 0n);
  const borrowedAssets = displayAssets.filter(asset => asset.user_borrowed_with_interest > 0n);

  // Calculate the maximum amount for different action types
  const calculateMaxAmount = (asset: Asset, actionType: ActionType): bigint => {
    switch (actionType) {
      case 'deposit':
        return asset.wallet_balance;
      
      case 'withdraw': {
        // Consider withdrawable amount and market liquidity constraints
        const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity 
          ? asset.withdrawable_amount 
          : asset.market_liquidity;
        return availableToWithdraw;
      }
      
      case 'borrow': {
        // Use borrowable_value_usd from the asset
        const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
        // Consider market liquidity constraints
        return borrowableAmount < asset.market_liquidity 
          ? borrowableAmount 
          : asset.market_liquidity;
      }
      
      case 'repay':
        return asset.user_borrowed_with_interest < asset.wallet_balance 
          ? asset.user_borrowed_with_interest 
          : asset.wallet_balance;
      
      default:
        return 0n;
    }
  };

  const openModal = (asset: Asset, actionType: ActionType) => {
    const maxAmount = calculateMaxAmount(asset, actionType);
    setModalConfig({ asset, actionType, maxAmount });
    setModalOpen(true);
  };

  // Map of action types to their handler functions
  const actionHandlers = {
    deposit: depositAsset,
    withdraw: withdrawAsset,
    borrow: borrowAsset,
    repay: repayAsset
  };

  const handleSubmit = async (amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: any) => {
    if (!modalConfig) return;
    
    const { asset, actionType } = modalConfig;
    const handler = actionHandlers[actionType];
    
    await handler(asset.id, amount, isPrivate, privateRecipient, secret);
  };

  const renderHealthFactor = () => {
    if (!displayUserPosition) return null;
    
    const healthFactor = displayUserPosition.health_factor;
    
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
              ${formatUsdValue(displayUserPosition.total_supplied_value, 9)}
            </div>
          </div>
          
          <div className="metric-card">
            <div className="metric-label">
              <FiDollarSign />
              <span>Total Borrowed</span>
            </div>
            <div className="metric-value-negative">
              ${formatUsdValue(displayUserPosition.total_borrowed_value, 9)}
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

  // Render buttons for deposit/withdrawal or borrow/repay actions
  const renderActionButtons = (asset: Asset, actionType: 'supply' | 'borrow') => {
    if (actionType === 'supply') {
      const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity 
        ? asset.withdrawable_amount : asset.market_liquidity;
      
      return (
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
      );
    } else {
      const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
      const availableToBorrow = borrowableAmount < asset.market_liquidity ? borrowableAmount : asset.market_liquidity;
      
      return (
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
      );
    }
  };

  // Render a table for assets (deposits or borrows)
  const renderAssetTable = (
    assets: Asset[], 
    title: string, 
    totalValueUsd: bigint, 
    actionType: 'supply' | 'borrow'
  ) => {
    const isSupply = actionType === 'supply';
    const valueKey = isSupply ? 'user_supplied_with_interest' : 'user_borrowed_with_interest';
    const rateKey = isSupply ? 'supply_rate' : 'borrow_rate';
    
    return (
      <div className="section-content">
        <div className="section-header">
          <h3 className="section-title">{title}</h3>
          <div className={`section-total ${isSupply ? 'positive-total' : 'negative-total'}`}>
            <FiDollarSign size={14} />
            <span>Total: ${formatUsdValue(totalValueUsd, 9)}</span>
          </div>
        </div>
        
        {assets.length === 0 ? (
          <div className="empty-section">
            No {isSupply ? 'supplied' : 'borrowed'} assets.
          </div>
        ) : (
          <table className="asset-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th className="right">Balance</th>
                <th className="right">{isSupply ? 'Supply APY' : 'Borrow APY'}</th>
                <th className="right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assets.map(asset => {
                const tokenValue = asset[valueKey];
                const usdValue = tokenToUsd(tokenValue, asset.decimals, asset.price);
                const apy = formatPercentage(asset[rateKey] * 100);
                
                return (
                  <tr 
                    key={asset.id}
                    onClick={() => onAssetSelect(asset.id)}
                    className="asset-row"
                  >
                    <td>
                      <AssetInfo asset={asset} />
                    </td>
                    <td className="right">
                      <div className="token-value">
                        {formatTokenAmount(tokenValue, asset.decimals)} {asset.ticker}
                      </div>
                      <div className="usd-value">
                        ${formatUsdValue(usdValue, asset.decimals)}
                      </div>
                    </td>
                    <td className="right">
                      <div className="apy-display">
                        <FiTrendingUp size={14} />
                        <span>{apy}</span>
                      </div>
                    </td>
                    <td className="right action-cell">
                      {renderActionButtons(asset, actionType)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  };

  const hasPosition = depositedAssets.length > 0 || borrowedAssets.length > 0;

  return (
    <div className="dashboard-container">
      {showLoadingOverlay && (
        <div className="loading-overlay">
          <FiLoader className="spinning" />
          <span>Loading your positions...</span>
        </div>
      )}
      
      <h2 className="dashboard-heading">Your Dashboard</h2>
      
      {hasPosition ? (
        <>
          {renderHealthFactor()}
          
          {renderAssetTable(
            depositedAssets,
            "Your Supplied Assets",
            displayUserPosition?.total_supplied_value || 0n,
            'supply'
          )}
          
          {renderAssetTable(
            borrowedAssets,
            "Your Borrowed Assets",
            displayUserPosition?.total_borrowed_value || 0n,
            'borrow'
          )}
        </>
      ) : (
        renderEmptyState()
      )}
      
      {modalOpen && modalConfig && (
        <ActionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          asset={modalConfig.asset}
          actionType={modalConfig.actionType}
          maxAmount={modalConfig.maxAmount}
        />
      )}
    </div>
  );
};

export default UserDashboardView; 