import { useState, useEffect } from 'react';
import { useLending } from '../hooks/useLending';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiArrowLeft, FiDollarSign, FiPercent, FiActivity, FiTrendingUp, FiLock, FiUnlock, FiLoader } from 'react-icons/fi';
import { useTransaction, useWallet } from '../hooks';
import { AztecAddress } from '@aztec/aztec.js';
import './AssetView.css';

interface AssetViewProps {
  assetId: string;
  onBack: () => void;
  previousView?: string;
}

type ActionType = 'deposit' | 'withdraw' | 'borrow' | 'repay';

const AssetView = ({ assetId, onBack, previousView = 'markets' }: AssetViewProps) => {
  const { isSecretAdrsSelected } = useWallet();
  const { assets, isLoading, refreshAssetData } = useLending();
  const { depositAsset, withdrawAsset, borrowAsset, repayAsset } = useTransaction();
  const [lastFoundAsset, setLastFoundAsset] = useState<any>(null);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType>('deposit');
  const [maxAmount, setMaxAmount] = useState<bigint>(0n);
  const [isPrivate, setIsPrivate] = useState(false);

  const getBackButtonText = () => `Back to ${previousView === 'dashboard' ? 'Dashboard' : 'Markets'}`;

  // Store the last found asset to prevent flickering during transitions
  useEffect(() => {
    const foundAsset = assets.find(a => a.id === assetId);
    if (foundAsset) {
      setLastFoundAsset(foundAsset);
    }
  }, [assets, assetId]);

  // True loading state - first load with no previous data
  if (isLoading && assets.length === 0 && !lastFoundAsset) {
    return (
      <div className="asset-view-container">
        <button onClick={onBack} className="back-button">
          <FiArrowLeft /> {getBackButtonText()}
        </button>
        
        <div className="loading-container">
          <FiLoader className="spinning" />
          <span>Loading asset data...</span>
        </div>
      </div>
    );
  }

  // Get current asset from assets or use the last found asset during transitions
  const asset = assets.find(a => a.id === assetId) || lastFoundAsset;
  
  if (!asset) {
    return (
      <div className="asset-view-container">
        <button onClick={onBack} className="back-button">
          <FiArrowLeft /> {getBackButtonText()}
        </button>
        
        <div className="not-found-container">
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
  
  const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
  
  const availableToBorrow = borrowableAmount < asset.market_liquidity ? borrowableAmount : asset.market_liquidity;
  const availableToWithdraw = asset.withdrawable_amount < asset.market_liquidity ? asset.withdrawable_amount : asset.market_liquidity;

  // Calculate the maximum amount for different action types
  const calculateMaxAmount = (type: ActionType): bigint => {
    switch (type) {
      case 'deposit':
        return isPrivate ? asset.max_deposit_private : asset.max_deposit_public;
      case 'withdraw':
        return asset.max_withdraw;
      case 'borrow':
        return asset.max_borrow;
      case 'repay':
        return isPrivate ? asset.max_repay_private : asset.max_repay_public;
      default:
        return 0n;
    }
  };

  // Show loading indicator overlay when refreshing data for an already loaded asset
  const showLoadingOverlay = isLoading && asset !== undefined;

  const openModal = (type: ActionType) => {
    setActionType(type);
    setMaxAmount(calculateMaxAmount(type));
    setModalOpen(true);
  };

  // Map of action types to their handler functions
  const actionHandlers = {
    deposit: depositAsset,
    withdraw: withdrawAsset,
    borrow: borrowAsset,
    repay: repayAsset
  };

  const handleSubmit = async (amount: string, isPrivateAction: boolean, privateRecipient?: AztecAddress, secret?: any) => {
    const handler = actionHandlers[actionType];
    await handler(asset.id, amount, isPrivateAction, privateRecipient, secret);
  };

  // Helper to render a stat card
  const renderStatCard = (label: string, value: string, subvalue?: string, icon = <FiDollarSign size={14} />, isHighlight = false) => (
    <div className="stat-card">
      <div className="stat-label">
        {icon}
        <span>{label}</span>
      </div>
      <div className={isHighlight ? "stat-value-highlight" : "stat-value"}>
        {value}
      </div>
      {subvalue && <div className="stat-subvalue">{subvalue}</div>}
    </div>
  );

  // Helper to render a balance with public/private toggle
  const renderBalanceWithToggle = () => (
    <div className="balance-container">
      <div>
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
      
      <div>
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
  );

  // Helper to render a basic balance
  const renderBalance = (amount: bigint, isUsd = false) => (
    <>
      <div className="balance-value">
        {isUsd 
          ? `$${formatUsdValue(amount, asset.decimals)}`
          : `${formatTokenAmount(amount, asset.decimals)} ${asset.ticker}`}
      </div>
      {!isUsd && (
        <div className="balance-usd-value">
          ${formatUsdValue(tokenToUsd(amount, asset.decimals, asset.price), asset.decimals)}
        </div>
      )}
    </>
  );

  // Helper to render an action card
  const renderActionCard = (
    title: string, 
    amount: bigint,
    actionLabel: string,
    actionType: ActionType,
    isDisabled: boolean,
    disabledReason: string,
    isPrimary = true,
    showToggle = false
  ) => (
    <div className="action-card">
      <div>
        <div className="card-title">{title}</div>
        <div>
          {showToggle ? renderBalanceWithToggle() : renderBalance(amount)}
        </div>
      </div>
      
      <button 
        onClick={() => openModal(actionType)}
        disabled={isDisabled}
        title={isDisabled ? disabledReason : ""}
        className={`action-button ${isDisabled ? '' : (isPrimary ? 'primary-gradient-button' : 'secondary-button')}`}
      >
        {actionLabel}
      </button>
    </div>
  );

  const noWalletBalance = asset.wallet_balance === 0n && asset.wallet_balance_private === 0n;

  return (
    <div className="asset-view-container">
      {showLoadingOverlay && (
        <div className="loading-overlay">
          <FiLoader className="spinning" />
          <span>Loading asset data...</span>
        </div>
      )}
      
      <div className="asset-header">
        <button onClick={onBack} className="back-button">
          <FiArrowLeft /> {getBackButtonText()}
        </button>
        <div className="asset-title-container">
          <div className="asset-icon">
            {asset.ticker.charAt(0)}
          </div>
          <div>
            <h1 className="asset-title">
              {asset.name} <span className="asset-ticker">({asset.ticker})</span>
            </h1>
            <div className="asset-price">
              <FiDollarSign />
              {formatUsdValue(asset.price, asset.decimals)}
            </div>
          </div>
        </div>
      </div>
      
      <div className="stats-grid">
        {renderStatCard(
          "Total Supplied", 
          `${formatTokenAmount(asset.total_supplied_with_interest, asset.decimals)} ${asset.ticker}`,
          `$${formatUsdValue(totalSuppliedUsd, asset.decimals)}`
        )}
        
        {renderStatCard(
          "Total Borrowed", 
          `${formatTokenAmount(asset.total_borrowed_with_interest, asset.decimals)} ${asset.ticker}`,
          `$${formatUsdValue(totalBorrowedUsd, asset.decimals)}`
        )}
        
        {renderStatCard(
          "Market Liquidity", 
          `${formatTokenAmount(asset.market_liquidity, asset.decimals)} ${asset.ticker}`,
          `$${formatUsdValue(tokenToUsd(asset.market_liquidity, asset.decimals, asset.price), asset.decimals)}`
        )}
        
        {renderStatCard(
          "Utilization Rate", 
          formatPercentage(asset.utilization_rate * 100),
          undefined,
          <FiActivity size={14} />
        )}
        
        {renderStatCard(
          "Loan to Value", 
          formatPercentage(asset.loan_to_value * 100),
          undefined,
          <FiPercent size={14} />
        )}
        
        {renderStatCard(
          "Supply APY", 
          formatPercentage(asset.supply_rate * 100),
          undefined,
          <FiTrendingUp size={14} />,
          true
        )}
        
        {renderStatCard(
          "Borrow APY", 
          formatPercentage(asset.borrow_rate * 100),
          undefined,
          <FiTrendingUp size={14} />,
          true
        )}
      </div>
      
      <h2 className="section-title">Your Position</h2>
      
      <div className="position-grid">
        {renderActionCard(
          "Your Wallet Balance", 
          asset.wallet_balance + asset.wallet_balance_private,
          "Deposit",
          "deposit",
          noWalletBalance,
          "No balance available to deposit",
          true,
          true // Show balance toggle
        )}
        
        {renderActionCard(
          "Your Supplied", 
          asset.user_supplied_with_interest,
          "Withdraw",
          "withdraw",
          asset.user_supplied_with_interest === 0n,
          "No balance to withdraw",
          false
        )}
        
        {renderActionCard(
          "Available to Borrow", 
          availableToBorrow,
          "Borrow",
          "borrow",
          !asset.is_borrowable || availableToBorrow === 0n,
          !asset.is_borrowable 
            ? "Asset is not borrowable"
            : "No borrow capacity available",
          true
        )}
        
        {renderActionCard(
          "Your Borrowed", 
          asset.user_borrowed_with_interest,
          "Repay",
          "repay",
          asset.user_borrowed_with_interest === 0n,
          "No debt to repay",
          false
        )}
      </div>
      
      {modalOpen && (
        <ActionModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSubmit={handleSubmit}
          asset={asset}
          actionType={actionType}
          maxAmount={maxAmount}
        />
      )}
    </div>
  );
};

export default AssetView; 