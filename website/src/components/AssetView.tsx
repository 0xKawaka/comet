import { useState } from 'react';
import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatUtilizationRate, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv } from '../utils/precisionConstants';
import ActionModal from './ActionModal';

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
      <div className="asset-view">
        <div className="asset-view-header">
          <button className="back-button" onClick={onBack}>← Back to Markets</button>
        </div>
        <div className="loading-indicator">Loading asset data...</div>
      </div>
    );
  }

  const asset = assets.find(a => a.id === assetId);
  
  if (!asset) {
    return (
      <div className="asset-view">
        <div className="asset-view-header">
          <button className="back-button" onClick={onBack}>← Back to Markets</button>
        </div>
        <div className="error-message">Asset not found.</div>
      </div>
    );
  }

  // Calculate USD values
  const totalSuppliedUsd = tokenToUsd(asset.total_supplied, asset.decimals, asset.price);
  const totalBorrowedUsd = tokenToUsd(asset.total_borrowed, asset.decimals, asset.price);
  const userSuppliedUsd = tokenToUsd(asset.user_supplied, asset.decimals, asset.price);
  const userBorrowedUsd = tokenToUsd(asset.user_borrowed, asset.decimals, asset.price);
  
  const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
  const borrowableValueUsd = asset.borrowable_value_usd;
  const borrowableAmount = usdToToken(borrowableValueUsd, asset.decimals, asset.price);
  
  // Check if there's enough liquidity in the market
  const marketLiquidity = asset.total_supplied > asset.total_borrowed 
    ? asset.total_supplied - asset.total_borrowed 
    : 0n;
  
  const availableToBorrow = borrowableAmount < marketLiquidity ? borrowableAmount : marketLiquidity;

  const openModal = (type: 'deposit' | 'withdraw' | 'borrow' | 'repay') => {
    let max = 0n;
    
    switch (type) {
      case 'deposit':
        max = asset.wallet_balance;
        break;
      case 'withdraw':
        max = asset.user_supplied;
        break;
      case 'borrow':
        max = availableToBorrow;
        break;
      case 'repay':
        max = asset.user_borrowed < asset.wallet_balance ? asset.user_borrowed : asset.wallet_balance;
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
    <div className="asset-view">
      <div className="asset-view-header">
        <button className="back-button" onClick={onBack}>← Back to Markets</button>
        <h2>{asset.name} ({asset.ticker})</h2>
      </div>
      
      <div className="asset-overview">
        <div className="overview-item">
          <div className="overview-label">Price</div>
          <div className="overview-value">${formatUsdValue(asset.price, asset.decimals)}</div>
        </div>
        
        <div className="overview-item">
          <div className="overview-label">Total Supplied</div>
          <div className="overview-value">
            {formatTokenAmount(asset.total_supplied, asset.decimals)} {asset.ticker}
            <div className="secondary-value">${formatUsdValue(totalSuppliedUsd, asset.decimals)}</div>
          </div>
        </div>
        
        <div className="overview-item">
          <div className="overview-label">Total Borrowed</div>
          <div className="overview-value">
            {formatTokenAmount(asset.total_borrowed, asset.decimals)} {asset.ticker}
            <div className="secondary-value">${formatUsdValue(totalBorrowedUsd, asset.decimals)}</div>
          </div>
        </div>
        
        <div className="overview-item">
          <div className="overview-label">Utilization Rate</div>
          <div className="overview-value">
            {formatUtilizationRate(asset.total_borrowed, asset.total_supplied)}
          </div>
        </div>
        
        <div className="overview-item">
          <div className="overview-label">Loan to Value</div>
          <div className="overview-value">
            {formatPercentage(asset.loan_to_value * 100)}
          </div>
        </div>
      </div>
      
      <div className="asset-actions">
        <div className="action-card">
          <div className="action-info">
            <div className="action-label">Wallet Balance</div>
            <div className="action-value">
              {formatTokenAmount(asset.wallet_balance, asset.decimals)} {asset.ticker}
              <div className="secondary-value">
                ${formatUsdValue(tokenToUsd(asset.wallet_balance, asset.decimals, asset.price), asset.decimals)}
              </div>
            </div>
          </div>
          <button 
            className="action-button supply-button" 
            onClick={() => openModal('deposit')}
            disabled={asset.wallet_balance === 0n}
          >
            Supply
          </button>
        </div>
        
        <div className="action-card">
          <div className="action-info">
            <div className="action-label">Your Deposits</div>
            <div className="action-value">
              {formatTokenAmount(asset.user_supplied, asset.decimals)} {asset.ticker}
              <div className="secondary-value">${formatUsdValue(userSuppliedUsd, asset.decimals)}</div>
            </div>
          </div>
          <button 
            className="action-button withdraw-button" 
            onClick={() => openModal('withdraw')}
            disabled={asset.user_supplied === 0n}
          >
            Withdraw
          </button>
        </div>
        
        <div className="action-card">
          <div className="action-info">
            <div className="action-label">Available to Borrow</div>
            <div className="action-value">
              {formatTokenAmount(availableToBorrow, asset.decimals)} {asset.ticker}
              <div className="secondary-value">
                ${formatUsdValue(tokenToUsd(availableToBorrow, asset.decimals, asset.price), asset.decimals)}
              </div>
            </div>
          </div>
          <button 
            className="action-button borrow-button" 
            onClick={() => openModal('borrow')}
            disabled={!asset.is_borrowable || availableToBorrow === 0n}
          >
            Borrow
          </button>
        </div>
        
        <div className="action-card">
          <div className="action-info">
            <div className="action-label">Your Borrows</div>
            <div className="action-value">
              {formatTokenAmount(asset.user_borrowed, asset.decimals)} {asset.ticker}
              <div className="secondary-value">${formatUsdValue(userBorrowedUsd, asset.decimals)}</div>
            </div>
          </div>
          <button 
            className="action-button repay-button" 
            onClick={() => openModal('repay')}
            disabled={asset.user_borrowed === 0n || asset.wallet_balance === 0n}
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