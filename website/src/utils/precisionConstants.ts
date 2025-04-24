/**
 * Constants related to numeric precision in the application
 */

import { parseUnits } from 'ethers';

// Price precision used in price oracle feeds (the number of decimals in price values)
export const PRICE_PRECISION = 9;
export const PRICE_PRECISION_FACTOR = 10n ** BigInt(PRICE_PRECISION);

// Percentage precision used for representing loan-to-value, interest rates, etc.
export const PERCENTAGE_PRECISION = 4; // 10000 = 100.00%
export const PERCENTAGE_PRECISION_FACTOR = 10n ** BigInt(PERCENTAGE_PRECISION);

// Utility functions for precision conversions
export const tokenToUsd = (tokenAmount: bigint, tokenDecimals: number, price: bigint): bigint => {
  return (tokenAmount * price) / (10n ** BigInt(tokenDecimals));
};

export const usdToToken = (usdAmount: bigint, tokenDecimals: number, price: bigint): bigint => {
  return (usdAmount * (10n ** BigInt(tokenDecimals))) / price;
};

// Apply LTV to a USD value
export const applyLtv = (usdValue: bigint, ltvPercentage: number): bigint => {
  // Convert decimal ltvPercentage to a string and parse with ethers.js for exact precision
  // e.g., 0.75 (75% LTV) becomes 7500 basis points with PERCENTAGE_PRECISION of 4
  const ltvBps = parseUnits(ltvPercentage.toString(), PERCENTAGE_PRECISION);
  return (usdValue * ltvBps) / PERCENTAGE_PRECISION_FACTOR;
}; 