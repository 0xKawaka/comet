import { useState } from 'react';
import { useLending, Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatHealthFactor, getHealthFactorClass, formatPercentage } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR } from '../utils/precisionConstants';
import ActionModal from './ActionModal';

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
      <div className="user-dashboard">
        <h2>Your Dashboard</h2>
        <div className="loading-indicator">Loading your positions...</div>
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
        maxAmount = asset.user_supplied_with_interest;
        break;
      case 'borrow':
        // Calculate max borrowable based on collateral and LTV
        const collateralValue = depositedAssets.reduce((total, asset) => {
          const value = tokenToUsd(asset.user_supplied_with_interest, asset.decimals, asset.price);
          const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
          return total + (value * ltvBps) / PERCENTAGE_PRECISION_FACTOR;
        }, 0n);
        
        // Subtract already borrowed value
        const borrowedValue = borrowedAssets.reduce((total, asset) => {
          return total + tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
        }, 0n);
        
        const maxBorrowableValue = collateralValue > borrowedValue 
          ? collateralValue - borrowedValue 
          : 0n;
        
        // Convert max borrowable value back to asset tokens
        maxAmount = usdToToken(maxBorrowableValue, asset.decimals, asset.price);
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
    const healthClass = getHealthFactorClass(healthFactor);
    
    return (
      <div className="position-summary" style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px'
      }}>
        <div className="position-summary-item health-factor" style={{ flex: 1, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '1rem', color: '#444' }}>Health Factor</h3>
          <div className={`health-factor-value ${healthClass}`}>
            {formatHealthFactor(healthFactor)}
          </div>
        </div>
        
        <div className="position-summary-item" style={{ flex: 1, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '1rem', color: '#444' }}>Total Supplied</h3>
          <div className="position-value" style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#2e7d32' }}>
            ${formatUsdValue(userPosition.total_supplied_value, 9)}
          </div>
        </div>
        
        <div className="position-summary-item" style={{ flex: 1, textAlign: 'center' }}>
          <h3 style={{ fontWeight: 600, marginBottom: '8px', fontSize: '1rem', color: '#444' }}>Total Borrowed</h3>
          <div className="position-value" style={{ fontWeight: 'bold', fontSize: '1.1rem', color: '#d32f2f' }}>
            ${formatUsdValue(userPosition.total_borrowed_value, 9)}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="user-dashboard">
      {userPosition.total_borrowed_value > 0 && 
        <div style={{ 
          marginBottom: '20px', 
          padding: '15px', 
          borderRadius: '8px', 
          backgroundColor: '#f9fafb', 
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' 
        }}>
          {renderHealthFactor()}
        </div>
      }
      
      <div className="dashboard-panel">
        <div className="panel-header">
          <h3 className="panel-title">Your Deposits</h3>
          <div>
            Total: ${formatUsdValue(userPosition.total_supplied_value, 9)}
          </div>
        </div>
        
        {depositedAssets.length === 0 ? (
          <div className="panel-empty">You haven't deposited any assets yet.</div>
        ) : (
          <table className="markets-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Deposited Amount</th>
                <th>Supply Rate</th>
                <th>Actions</th>
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
                
                return (
                  <tr key={asset.id} onClick={() => onAssetSelect(asset.id)}>
                    <td>
                      <span className="asset-name">{asset.name}</span>
                      <span className="asset-ticker">{asset.ticker}</span>
                    </td>
                    <td>
                      <div className="token-amount">{suppliedFormatted} {asset.ticker}</div>
                      <div className="secondary-value">${suppliedValueUsd}</div>
                    </td>
                    <td>
                      <div className="supply-rate"><span className="supply-rate-value">{supplyRate}</span></div>
                    </td>
                    <td onClick={e => e.stopPropagation()} className="action-buttons">
                      <button 
                        className="action-button supply-button" 
                        onClick={() => openModal(asset, 'deposit')}
                        disabled={asset.wallet_balance === 0n}
                      >
                        Supply
                      </button>
                      <button 
                        className="action-button withdraw-button" 
                        onClick={() => openModal(asset, 'withdraw')}
                      >
                        Withdraw
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
      <div className="dashboard-panel" style={{ marginTop: '20px' }}>
        <div className="panel-header">
          <h3 className="panel-title">Your Borrows</h3>
          <div>
            Total: ${formatUsdValue(userPosition.total_borrowed_value, 9)}
          </div>
        </div>
        
        {borrowedAssets.length === 0 ? (
          <div className="panel-empty">You haven't borrowed any assets yet.</div>
        ) : (
          <table className="markets-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Borrowed Amount</th>
                <th>Borrow Rate</th>
                <th>Actions</th>
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
                
                return (
                  <tr key={asset.id} onClick={() => onAssetSelect(asset.id)}>
                    <td>
                      <span className="asset-name">{asset.name}</span>
                      <span className="asset-ticker">{asset.ticker}</span>
                    </td>
                    <td>
                      <div className="token-amount">{borrowedFormatted} {asset.ticker}</div>
                      <div className="secondary-value">${borrowedValueUsd}</div>
                    </td>
                    <td>
                      <div className="borrow-rate"><span className="borrow-rate-value">{borrowRate}</span></div>
                    </td>
                    <td onClick={e => e.stopPropagation()} className="action-buttons">
                      <button 
                        className="action-button borrow-button" 
                        onClick={() => openModal(asset, 'borrow')}
                        disabled={userPosition.health_factor < 1.05}
                      >
                        Borrow
                      </button>
                      <button 
                        className="action-button repay-button" 
                        onClick={() => openModal(asset, 'repay')}
                        disabled={asset.wallet_balance === 0n}
                      >
                        Repay
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      
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