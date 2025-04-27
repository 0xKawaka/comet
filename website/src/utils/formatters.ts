import { PERCENTAGE_PRECISION_FACTOR } from './precisionConstants';

/**
 * Format a token amount to a human-readable string with specified decimals
 */
export const formatTokenAmount = (amount: bigint, decimals: number): string => {
  // Ensure amount is a BigInt
  const amountBigInt = BigInt(amount.toString());
  
  // Special case for zero
  if (amountBigInt === 0n) return '0';
  
  // Ensure decimals is a number
  const decimalsNum = Number(decimals);
  
  const divisor = 10n ** BigInt(decimalsNum);
  const integerPart = amountBigInt / divisor;
  const fractionalPart = amountBigInt % divisor;
  
  let fractionalString = fractionalPart.toString();
  // Pad with leading zeros if needed
  while (fractionalString.length < decimalsNum) {
    fractionalString = '0' + fractionalString;
  }
  
  // Remove trailing zeros
  fractionalString = fractionalString.replace(/0+$/, '');
  
  return fractionalString.length > 0 
    ? `${integerPart}.${fractionalString}` 
    : integerPart.toString();
};

/**
 * Format a USD value with specified decimals
 */
export const formatUsdValue = (amount: bigint, decimals: number): string => {
  // Handle special case for zero or undefined values
  if (!amount || amount === 0n) return '0.00';
  
  const formattedValue = formatTokenAmount(amount, decimals);
  
  // Ensure it has at least 2 decimal places for USD values
  const parts = formattedValue.split('.');
  if (parts.length === 1) {
    return `${parts[0]}.00`;
  } else if (parts[1].length === 1) {
    return `${parts[0]}.${parts[1]}0`;
  }
  
  return formattedValue;
};

/**
 * Parse a string token amount to bigint with specified decimals
 */
export const parseTokenAmount = (amount: string, decimals: number): bigint => {
  if (!amount || amount === '') return 0n;
  
  const parts = amount.split('.');
  const integerPart = parts[0] || '0';
  let fractionalPart = parts[1] || '';
  
  if (fractionalPart.length > decimals) {
    fractionalPart = fractionalPart.substring(0, decimals);
  } else {
    while (fractionalPart.length < decimals) {
      fractionalPart += '0';
    }
  }
  
  return BigInt(integerPart + fractionalPart);
};

/**
 * Calculate LTV (Loan to Value) ratio
 */
export const calculateLTV = (borrowedValue: bigint, collateralValue: bigint): number => {
  if (collateralValue === 0n) return 0;
  return Number((borrowedValue * 100n) / collateralValue) / 100;
};

/**
 * Get CSS class for health factor
 */
export const getHealthFactorClass = (healthFactor: number): string => {
  if (healthFactor === Infinity || healthFactor > 1.5) return 'health-factor-safe';
  if (healthFactor > 1.1) return 'health-factor-warning';
  return 'health-factor-danger';
};

/**
 * Format percentage value
 */
export const formatPercentage = (value: number): string => {
  return `${value.toFixed(2)}%`;
};

/**
 * Format health factor
 */
export const formatHealthFactor = (healthFactor: number): string => {
  if (healthFactor === Infinity) return '∞';
  return healthFactor.toFixed(2);
}; 