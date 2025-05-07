/**
 * Utility functions for interest calculations in the lending protocol
 */

import { INTEREST_PRECISION_FACTOR } from './precisionConstants';

/**
 * Calculate accrued interest based on rate and time
 * @param amount The principal amount
 * @param rate The interest rate as a decimal (e.g., 0.05 for 5%)
 * @param lastUpdatedTimestamp The timestamp when the interest was last updated
 * @returns The amount with accrued interest
 */
export const calculateInterestAccrued = (
  amount: bigint, 
  rate: number, 
  lastUpdatedTimestamp: number | bigint
): bigint => {
  // Convert lastUpdatedTimestamp to number if it's a bigint
  const lastUpdatedTs = typeof lastUpdatedTimestamp === 'bigint' 
    ? Number(lastUpdatedTimestamp) 
    : lastUpdatedTimestamp;
  
  const currentTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds
  
  // Calculate time elapsed in seconds since last update
  const timeElapsedSeconds = currentTimestamp - lastUpdatedTs;
  
  // If no time has elapsed or the timestamp is invalid, return the original amount
  if (timeElapsedSeconds <= 0) return amount;
  
  // Convert rate from percentage to decimal (e.g., 5% -> 0.05)
  // Then calculate seconds in a year and adjust rate accordingly
  const secondsInYear = 365 * 24 * 60 * 60;

  // Calculate interest factor (1 + rate * time)
  const interestFactor = 1 + (rate * timeElapsedSeconds) / secondsInYear;
  // Apply interest factor to the amount
  // Convert the interest factor to a BigInt with appropriate precision
  const factorBigInt = BigInt(Math.floor(interestFactor * Number(INTEREST_PRECISION_FACTOR)));
  return (amount * factorBigInt) / INTEREST_PRECISION_FACTOR;
};

/**
 * Calculate interest rates based on utilization
 * @param utilizationRate The current utilization rate of the market (0-1)
 * @param optimalRate The optimal utilization rate for the market (0-1)
 * @param underSlope The slope for interest rate when utilization is under optimal
 * @param overSlope The slope for interest rate when utilization is over optimal
 * @returns Object containing borrowRate and supplyRate
 */
export const calculateInterestRates = (
  utilizationRate: number,
  optimalRate: number,
  underSlope: number,
  overSlope: number
): { borrowRate: number, supplyRate: number } => {
  let borrowRate = 0;

  if (utilizationRate < optimalRate) {
    borrowRate = (utilizationRate * underSlope) / optimalRate;
  } else {
    borrowRate = underSlope + 
      ((utilizationRate - optimalRate) * overSlope) / 
      (1 - optimalRate);
  }
  
  // Calculate supply rate
  const supplyRate = borrowRate * utilizationRate;
  
  return { borrowRate, supplyRate };
}; 