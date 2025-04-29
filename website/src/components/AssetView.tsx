import { useState } from 'react';
import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv } from '../utils/precisionConstants';
import ActionModal from './ActionModal';
import { FiArrowLeft, FiDollarSign, FiPercent, FiActivity, FiTrendingUp, FiLock, FiUnlock, FiLoader } from 'react-icons/fi';
import './AssetView.css';

interface AssetViewProps {
  assetId: string;
  onBack: () => void;
  previousView?: string;
}

const AssetView = ({ assetId, onBack, previousView = 'markets' }: AssetViewProps) => {
  const { assets, isLoading, depositAsset, withdrawAsset, borrowAsset, repayAsset, userPosition } = useLending();
  
  const [modalOpen, setModalOpen] = useState(false);
  const [actionType, setActionType] = useState<'deposit' | 'withdraw' | 'borrow' | 'repay'>('deposit');
  const [maxAmount, setMaxAmount] = useState<bigint>(0n);

  const getBackButtonText = () => {
    return `Back to ${previousView === 'dashboard' ? 'Dashboard' : 'Markets'}`;
  };

  if (isLoading) {
    return (
      <div className="asset-view-container">
        <button 
          onClick={onBack}
          className="back-button"
        >
          <FiArrowLeft /> {getBackButtonText()}
        </button>
        
        <div className="loading-container">
          <FiLoader className="spinning" />
          <span>Loading asset data...</span>
        </div>
      </div>
    );
  }

  const asset = assets.find(a => a.id === assetId);
  
  if (!asset) {
    return (
      <div className="asset-view-container">
        <button 
          onClick={onBack}
          className="back-button"
        >
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
  
  const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
  const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
  
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
    <div className="asset-view-container">
      <div className="asset-header">
        <button 
          onClick={onBack} 
          className="back-button"
        >
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
        <div className="stat-card">
          <div className="stat-label">
            <FiDollarSign size={14} />
            <span>Total Supplied</span>
          </div>
          <div className="stat-value">
            {formatTokenAmount(asset.total_supplied_with_interest, asset.decimals)} {asset.ticker}
          </div>
          <div className="stat-subvalue">
            ${formatUsdValue(totalSuppliedUsd, asset.decimals)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiDollarSign size={14} />
            <span>Total Borrowed</span>
          </div>
          <div className="stat-value">
            {formatTokenAmount(asset.total_borrowed_with_interest, asset.decimals)} {asset.ticker}
          </div>
          <div className="stat-subvalue">
            ${formatUsdValue(totalBorrowedUsd, asset.decimals)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiDollarSign size={14} />
            <span>Market Liquidity</span>
          </div>
          <div className="stat-value">
            {formatTokenAmount(asset.market_liquidity, asset.decimals)} {asset.ticker}
          </div>
          <div className="stat-subvalue">
            ${formatUsdValue(tokenToUsd(asset.market_liquidity, asset.decimals, asset.price), asset.decimals)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiActivity size={14} />
            <span>Utilization Rate</span>
          </div>
          <div className="stat-value">
            {formatPercentage(asset.utilization_rate * 100)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiPercent size={14} />
            <span>Loan to Value</span>
          </div>
          <div className="stat-value">
            {formatPercentage(asset.loan_to_value * 100)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiTrendingUp size={14} />
            <span>Supply Rate</span>
          </div>
          <div className="stat-value-highlight">
            {formatPercentage(asset.supply_rate * 100)}
          </div>
        </div>
        
        <div className="stat-card">
          <div className="stat-label">
            <FiTrendingUp size={14} />
            <span>Borrow Rate</span>
          </div>
          <div className="stat-value-highlight">
            {formatPercentage(asset.borrow_rate * 100)}
          </div>
        </div>
      </div>
      
      <div className="action-grid">
        <div className="action-card">
          <div>
            <div className="card-title">
              Wallet Balance
            </div>
            <div>
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
            </div>
          </div>
          
          <button 
            onClick={() => openModal('deposit')}
            disabled={asset.wallet_balance === 0n && asset.wallet_balance_private === 0n}
            title={(asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? "No tokens in wallet to supply" : ""}
            className={`action-button ${(asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? '' : 'primary-gradient-button'}`}
          >
            Supply
          </button>
        </div>
        
        <div className="action-card">
          <div>
            <div className="card-title">
              Your Deposits
            </div>
            <div>
              <div className="balance-value">
                {formatTokenAmount(asset.user_supplied_with_interest, asset.decimals)} {asset.ticker}
              </div>
              <div className="balance-usd-value">
                ${formatUsdValue(userSuppliedUsd, asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('withdraw')}
            disabled={availableToWithdraw === 0n}
            title={availableToWithdraw === 0n ? "No funds available to withdraw" : ""}
            className={`action-button ${availableToWithdraw === 0n ? '' : 'secondary-button'}`}
          >
            Withdraw
          </button>
        </div>
        
        <div className="action-card">
          <div>
            <div className="card-title">
              Available to Borrow
            </div>
            <div>
              <div className="balance-value">
                {formatTokenAmount(availableToBorrow, asset.decimals)} {asset.ticker}
              </div>
              <div className="balance-usd-value">
                ${formatUsdValue(tokenToUsd(availableToBorrow, asset.decimals, asset.price), asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('borrow')}
            disabled={!asset.is_borrowable || availableToBorrow === 0n}
            title={!asset.is_borrowable ? "Asset not borrowable" : availableToBorrow === 0n ? "No assets available to borrow" : ""}
            className={`action-button ${(!asset.is_borrowable || availableToBorrow === 0n) ? '' : 'primary-gradient-button'}`}
          >
            Borrow
          </button>
        </div>
        
        <div className="action-card">
          <div>
            <div className="card-title">
              Your Borrows
            </div>
            <div>
              <div className="balance-value">
                {formatTokenAmount(asset.user_borrowed_with_interest, asset.decimals)} {asset.ticker}
              </div>
              <div className="balance-usd-value">
                ${formatUsdValue(userBorrowedUsd, asset.decimals)}
              </div>
            </div>
          </div>
          
          <button 
            onClick={() => openModal('repay')}
            disabled={asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)}
            title={asset.user_borrowed_with_interest === 0n ? "No outstanding debt to repay" : (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n) ? "No tokens in wallet to repay with" : ""}
            className={`action-button ${(asset.user_borrowed_with_interest === 0n || (asset.wallet_balance === 0n && asset.wallet_balance_private === 0n)) ? '' : 'secondary-button'}`}
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