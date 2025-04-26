import { useMemo } from 'react';
import { useLending, Asset } from '../contexts/LendingContext';
import { formatTokenAmount, formatHealthFactor } from '../utils/formatters';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR } from '../utils/precisionConstants';
import { parseUnits } from 'ethers';
import './HealthFactorPreview.css';

interface HealthFactorPreviewProps {
  asset: Asset;
  actionType: 'deposit' | 'withdraw' | 'borrow' | 'repay';
  amount: string;
}

const HealthFactorPreview = ({ asset, actionType, amount }: HealthFactorPreviewProps) => {
  const { userPosition, assets } = useLending();
  
  // Calculate new health factor based on the action
  const { newHealthFactor, healthFactorChange, isImproving } = useMemo(() => {
    // If amount is empty or 0, return current health factor
    if (!amount || parseFloat(amount) <= 0) {
      return { 
        newHealthFactor: userPosition.health_factor,
        healthFactorChange: 0,
        isImproving: false
      };
    }

    // Create a simulation of assets and user position after action
    const simulatedAssets = [...assets];
    const assetIndex = simulatedAssets.findIndex(a => a.id === asset.id);
    
    if (assetIndex === -1) {
      return { 
        newHealthFactor: userPosition.health_factor,
        healthFactorChange: 0,
        isImproving: false
      };
    }

    // Convert input amount to bigint with proper decimals
    const amountBigInt = parseUnits(amount, asset.decimals);
    
    // Simulate the user action
    const simulatedAsset = { ...simulatedAssets[assetIndex] };
    
    switch (actionType) {
      case 'deposit':
        simulatedAsset.user_supplied_with_interest += amountBigInt;
        break;
      case 'withdraw':
        simulatedAsset.user_supplied_with_interest -= amountBigInt > simulatedAsset.user_supplied_with_interest 
          ? simulatedAsset.user_supplied_with_interest 
          : amountBigInt;
        break;
      case 'borrow':
        simulatedAsset.user_borrowed_with_interest += amountBigInt;
        break;
      case 'repay':
        simulatedAsset.user_borrowed_with_interest -= amountBigInt > simulatedAsset.user_borrowed_with_interest 
          ? simulatedAsset.user_borrowed_with_interest 
          : amountBigInt;
        break;
    }
    
    simulatedAssets[assetIndex] = simulatedAsset;

    // Calculate total values after the simulation
    const totalSuppliedValue = simulatedAssets.reduce((sum, asset) => {
      const value = tokenToUsd(asset.user_supplied_with_interest, asset.decimals, asset.price);
      return sum + value;
    }, 0n);
    
    const totalBorrowedValue = simulatedAssets.reduce((sum, asset) => {
      const value = tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
      return sum + value;
    }, 0n);
    
    // Calculate collateral value needed based on the formula
    let collateralValueNeeded = 0n;
    for (const asset of simulatedAssets) {
      if (asset.user_borrowed_with_interest > 0n) {
        const borrowedValue = tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
        const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
        collateralValueNeeded += (borrowedValue * BigInt(PERCENTAGE_PRECISION_FACTOR)) / ltvBps;
      }
    }
    
    // Calculate simulated health factor
    const simHealthFactor = collateralValueNeeded > 0n
      ? Number(totalSuppliedValue * BigInt(PERCENTAGE_PRECISION_FACTOR) / collateralValueNeeded) / 10000
      : Infinity;
    
    // Calculate the change from the current health factor
    const healthFactorChange = simHealthFactor - userPosition.health_factor;
    const isImproving = healthFactorChange > 0;
    
    return {
      newHealthFactor: simHealthFactor,
      healthFactorChange: Math.abs(healthFactorChange),
      isImproving
    };
  }, [amount, actionType, asset, assets, userPosition]);

  // Don't render if no borrow position exists and not borrowing
  if (userPosition.total_borrowed_value === 0n && actionType !== 'borrow') {
    return null;
  }

  // Define health factor class based on value
  const getHealthFactorClass = (factor: number) => {
    if (factor >= 2.0) { // Safe
      return 'safe';
    } else if (factor >= 1.2) { // Warning
      return 'warning';
    } else { // Danger
      return 'danger';
    }
  };

  const currentHealthClass = getHealthFactorClass(userPosition.health_factor);
  const newHealthClass = getHealthFactorClass(newHealthFactor);

  return (
    <div className="health-factor-preview">
      <div className="health-factor-preview-title">
        Health Factor Preview
      </div>
      
      <div className="health-factor-preview-comparison">
        <div className="health-factor-preview-values">
          <span className={`health-factor-value ${currentHealthClass}`}>
            {formatHealthFactor(userPosition.health_factor)}
          </span>
          <span className="health-factor-preview-arrow">→</span>
          <span className={`health-factor-value ${newHealthClass}`}>
            {formatHealthFactor(newHealthFactor)}
          </span>
        </div>
        
        {healthFactorChange > 0.01 && (
          <div className={`health-factor-preview-change ${isImproving ? 'improving' : 'declining'}`}>
            {isImproving ? '↑' : '↓'}
            {formatHealthFactor(healthFactorChange)}
          </div>
        )}
      </div>
      
      {newHealthFactor < 1.2 && (
        <div className={`health-factor-preview-warning ${newHealthFactor < 1.0 ? 'danger' : 'caution'}`}>
          {newHealthFactor < 1.0 
            ? 'Warning: This action would put your position at risk of liquidation!'
            : 'Caution: Low health factor increases liquidation risk'}
        </div>
      )}
    </div>
  );
};

export default HealthFactorPreview; 