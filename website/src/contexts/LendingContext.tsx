import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { parseUnits, formatUnits } from 'ethers';
import { useWallet } from '../hooks';
import { LendingContract } from '../blockchain/contracts/Lending';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import devContracts from '../blockchain/dev-contracts.json';
import allAssets from '../blockchain/dev-all-assets.json';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR, PERCENTAGE_PRECISION, PRICE_PRECISION_FACTOR, INTEREST_PRECISION_FACTOR } from '../utils/precisionConstants';

const marketId = 1; // This should eventually be derived from the asset or configuration

// Define the shape of our asset data
export interface Asset {
  id: string;
  address: AztecAddress;
  name: string;
  ticker: string;
  decimals: number;
  oracle: string;
  loan_to_value: number;
  is_borrowable: boolean;
  deposit_cap: string;
  price: bigint;
  total_supplied: bigint;
  total_borrowed: bigint;
  total_supplied_with_interest: bigint; // New field for total supplied amount with accrued interest
  total_borrowed_with_interest: bigint; // New field for total borrowed amount with accrued interest
  utilization_rate: number;
  borrow_rate: number;
  supply_rate: number;
  user_supplied: bigint;
  user_borrowed: bigint;
  user_supplied_with_interest: bigint; // New field for supplied amount with accrued interest
  user_borrowed_with_interest: bigint; // New field for borrowed amount with accrued interest
  wallet_balance: bigint;
  wallet_balance_private: bigint;
  borrowable_value_usd: bigint; // Added field for globally calculated borrowable value in USD
  deposit_accumulator: {
    value: bigint;
    last_updated_ts: number;
  };
  borrow_accumulator: {
    value: bigint;
    last_updated_ts: number;
  };
}

interface UserPosition {
  health_factor: number;
  total_supplied_value: bigint;
  total_borrowed_value: bigint;
}

interface LendingContextType {
  assets: Asset[];
  userPosition: UserPosition;
  isLoading: boolean;
  depositAsset: (assetId: string, amount: string, isPrivate: boolean) => Promise<void>;
  withdrawAsset: (assetId: string, amount: string, isPrivate: boolean) => Promise<void>;
  borrowAsset: (assetId: string, amount: string, isPrivate: boolean) => Promise<void>;
  repayAsset: (assetId: string, amount: string, isPrivate: boolean) => Promise<void>;
  refreshData: () => Promise<void>;
}

const defaultContext: LendingContextType = {
  assets: [],
  userPosition: {
    health_factor: Infinity,
    total_supplied_value: 0n,
    total_borrowed_value: 0n
  },
  isLoading: true,
  depositAsset: async () => {},
  withdrawAsset: async () => {},
  borrowAsset: async () => {},
  repayAsset: async () => {},
  refreshData: async () => {}
};

const LendingContext = createContext<LendingContextType>(defaultContext);

export const useLending = () => useContext(LendingContext);

// Define a utility function to calculate accrued interest based on rate and time
const calculateInterestAccrued = (
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

interface LendingProviderProps {
  children: ReactNode;
}

export const LendingProvider = ({ children }: LendingProviderProps) => {
  const { wallet, address } = useWallet();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [lendingContract, setLendingContract] = useState<LendingContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userPosition, setUserPosition] = useState<UserPosition>({
    health_factor: Infinity,
    total_supplied_value: 0n,
    total_borrowed_value: 0n
  });

  useEffect(() => {
    if (wallet && address) {
      initLendingContract();
    }
  }, [wallet, address]);

  // Add a new useEffect to refresh data when address changes
  useEffect(() => {
    if (address && lendingContract) {
      // Refresh market data when the address changes
      refreshData();
    }
  }, [address]);

  const initLendingContract = async () => {
    if (!wallet || !address) return;
    
    setIsLoading(true);
    try {
      // Initialize the lending contract
      const contract = await LendingContract.at(
        AztecAddress.fromString(devContracts.lending),
        wallet
      );
      setLendingContract(contract);
      
      // Convert the all assets JSON to a typed object
      const assetsData = allAssets as Record<string, {
        name: string;
        ticker: string;
        decimals: number;
        oracle: string;
        loan_to_value: number;
        is_borrowable: boolean;
        deposit_cap: string;
        optimal_utilization_rate: number;
        under_optimal_slope: number;
        over_optimal_slope: number;
      }>;
      
      // Initialize all contracts in parallel first
      const assetEntries = Object.entries(assetsData);
      const assetAddresses = assetEntries.map(([id]) => AztecAddress.fromString(id));
      const oracleAddresses = assetEntries.map(([_, data]) => AztecAddress.fromString(data.oracle));
      
      // Create token and price feed contracts in parallel
      const tokenContractPromises = assetAddresses.map(addr => TokenContract.at(addr, wallet));
      const priceFeedPromises = oracleAddresses.map(addr => PriceFeedContract.at(addr, wallet));
      
      // Wait for all contracts to be initialized
      const [tokenContracts, priceFeedContracts] = await Promise.all([
        Promise.all(tokenContractPromises),
        Promise.all(priceFeedPromises)
      ]);
      
      // For each asset, prepare all data fetch promises
      const assetDataPromises = assetEntries.map(([id, data], index) => {
        const assetAddress = assetAddresses[index];
        const tokenContract = tokenContracts[index];
        const priceFeedContract = priceFeedContracts[index];
        
        // Bundle all the async calls for this asset
        return Promise.all([
          // Get wallet balances
          tokenContract.methods.balance_of_public(address).simulate(),
          tokenContract.methods.balance_of_private(address).simulate(),
          
          // Get user position
          contract.methods.get_position(address, marketId, assetAddress).simulate(),
          
          // Get total supplied and borrowed
          contract.methods.get_total_deposited_assets(marketId, assetAddress).simulate(),
          contract.methods.get_total_borrowed_assets(marketId, assetAddress).simulate(),
          
          // Get price
          priceFeedContract.methods.get_price(0).simulate(),
          
          // Get accumulators
          contract.methods.get_accumulators(marketId, assetAddress).simulate(),
          
          // Return asset metadata
          Promise.resolve({ 
            id, 
            assetAddress, 
            data 
          })
        ]);
      });
      
      // Wait for all asset data to be fetched
      const assetsResults = await Promise.all(assetDataPromises);
      
      // Process the results into Asset objects
      const assetsArray: Asset[] = assetsResults.map(result => {
        const [
          walletBalance,
          walletBalancePrivate,
          userPosition,
          totalSupplied,
          totalBorrowed,
          priceResponse,
          accumulators,
          metadata
        ] = result;
        
        const { id, assetAddress, data } = metadata;
        
        // Calculate utilization rate
        const utilizationRate = totalSupplied > 0 
          ? Number((totalBorrowed * 10000n) / totalSupplied) / 10000 
          : 0;
        // Calculate borrow rate
        let borrowRate = 0;
        const optimalRate = data.optimal_utilization_rate;
        const underSlope = data.under_optimal_slope;
        const overSlope = data.over_optimal_slope;

        if (utilizationRate < optimalRate) {
          borrowRate = (utilizationRate * underSlope) / optimalRate;
        } else {
          borrowRate = underSlope + 
            ((utilizationRate - optimalRate) * overSlope) / 
            (1 - optimalRate);
        }
        
        // Calculate supply rate
        const supplyRate = borrowRate * utilizationRate;
        
        // Calculate supplied and borrowed amounts with accrued interest (user specific)
        const userSuppliedWithInterest = calculateInterestAccrued(
          userPosition.collateral || 0n,
          supplyRate,
          accumulators[0]?.last_updated_ts || 0
        );
        
        const userBorrowedWithInterest = calculateInterestAccrued(
          userPosition.debt || 0n,
          borrowRate,
          accumulators[1]?.last_updated_ts || 0
        );

        // Calculate total supplied and borrowed with accrued interest (global pool)
        const totalSuppliedWithInterest = calculateInterestAccrued(
          totalSupplied,
          supplyRate,
          accumulators[0]?.last_updated_ts || 0
        );
        
        const totalBorrowedWithInterest = calculateInterestAccrued(
          totalBorrowed,
          borrowRate,
          accumulators[1]?.last_updated_ts || 0
        );
        
        return {
          id,
          address: assetAddress,
          name: data.name,
          ticker: data.ticker,
          decimals: data.decimals,
          oracle: data.oracle,
          loan_to_value: data.loan_to_value,
          is_borrowable: data.is_borrowable,
          deposit_cap: data.deposit_cap,
          price: priceResponse.price,
          total_supplied: totalSupplied,
          total_borrowed: totalBorrowed,
          total_supplied_with_interest: totalSuppliedWithInterest,
          total_borrowed_with_interest: totalBorrowedWithInterest,
          utilization_rate: utilizationRate,
          borrow_rate: borrowRate,
          supply_rate: supplyRate,
          user_supplied: userPosition.collateral || 0n,
          user_borrowed: userPosition.debt || 0n,
          user_supplied_with_interest: userSuppliedWithInterest,
          user_borrowed_with_interest: userBorrowedWithInterest,
          wallet_balance: walletBalance,
          wallet_balance_private: walletBalancePrivate,
          borrowable_value_usd: 0n, // Add default value, will be updated in updateUserPosition
          deposit_accumulator: {
            value: accumulators[0]?.value || 0n,
            last_updated_ts: Number(accumulators[0]?.last_updated_ts) || 0
          },
          borrow_accumulator: {
            value: accumulators[1]?.value || 0n,
            last_updated_ts: Number(accumulators[1]?.last_updated_ts) || 0
          }
        };
      });

      setAssets(assetsArray);
      
      // Calculate user position metrics
      updateUserPosition(assetsArray);
      
    } catch (error) {
      console.error("Failed to initialize lending contract:", error);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper function to calculate and update user position
  const updateUserPosition = (assetsArray: Asset[]) => {
    // Calculate total values using the interest-accrued amounts
    const totalSuppliedValue = assetsArray.reduce((sum, asset) => {
      const value = tokenToUsd(asset.user_supplied_with_interest, asset.decimals, asset.price);
      return sum + value;
    }, 0n);
    
    const totalBorrowedValue = assetsArray.reduce((sum, asset) => {
      const value = tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
      return sum + value;
    }, 0n);
    
    // Calculate collateral value needed based on the new formula
    let collateralValueNeeded = 0n;
    for (const asset of assetsArray) {
      if (asset.user_borrowed_with_interest > 0n) {
        const borrowedValue = tokenToUsd(asset.user_borrowed_with_interest, asset.decimals, asset.price);
        const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
        collateralValueNeeded += (borrowedValue * BigInt(PERCENTAGE_PRECISION_FACTOR)) / ltvBps;
      }
    }
    
    // Calculate health factor according to the new formula
    const healthFactor = collateralValueNeeded > 0n
      ? parseFloat(formatUnits(totalSuppliedValue * BigInt(PERCENTAGE_PRECISION_FACTOR) / collateralValueNeeded, PERCENTAGE_PRECISION))
      : Infinity;
    
    // Calculate maximum borrowable value based on user's supplied collateral
    const maxBorrowableValueFromCollateral = totalSuppliedValue > collateralValueNeeded 
      ? totalSuppliedValue - collateralValueNeeded 
      : 0n;

    // Update borrowable value for each asset based on both available liquidity and user's borrowing capacity
    for (const asset of assetsArray) {
      if (asset.is_borrowable) {
        // Calculate available liquidity of the asset in the pool (in USD)
        const availableLiquidity = asset.total_supplied > asset.total_borrowed 
          ? asset.total_supplied - asset.total_borrowed 
          : 0n;
        const availableLiquidityUsd = tokenToUsd(availableLiquidity, asset.decimals, asset.price);
        
        // Calculate maximum amount user can borrow based on collateral and this asset's LTV
        const maxBorrowableUsd = applyLtv(maxBorrowableValueFromCollateral, asset.loan_to_value);
        
        // Borrowable value is the minimum of available liquidity and maximum borrowable based on collateral
        asset.borrowable_value_usd = availableLiquidityUsd < maxBorrowableUsd 
          ? availableLiquidityUsd 
          : maxBorrowableUsd;
      } else {
        asset.borrowable_value_usd = 0n;
      }
    }
    
    setUserPosition({
      health_factor: healthFactor,
      total_supplied_value: totalSuppliedValue,
      total_borrowed_value: totalBorrowedValue
    });
  };

  const depositAsset = async (assetId: string, amount: string, isPrivate: boolean) => {
    if (!lendingContract || !wallet || !address) return;
    
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");
      
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      const nonce = Fr.random();
      
      
      const tokenContract = await TokenContract.at(asset.address, wallet);
      
      if (isPrivate) {
        const transferToPublicAuthwit = await wallet.createAuthWit({
          caller: lendingContract.address,
          action: tokenContract.methods.transfer_to_public(
            address,
            lendingContract.address,
            amountBigInt,
            nonce,
          ),
        });
        
        await lendingContract.methods.deposit_private(
          address,
          amountBigInt,
          nonce,
          wallet.getSecretKey(),
          address,
          marketId,
          asset.address
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
      } else {
        const validateAction = await wallet.setPublicAuthWit(
          {
            caller: lendingContract.address,
            action: tokenContract.methods.transfer_in_public(
              address,
              lendingContract.address,
              amountBigInt,
              nonce,
            ),
          },
          true,
        );
        await validateAction.send().wait();

        await lendingContract.methods.deposit_public(
          amountBigInt,
          nonce,
          address,
          marketId,
          asset.address
        ).send().wait();
      }
      
      await refreshData();
    } catch (error) {
      console.error(`Error depositing asset:`, error);
      throw error;
    }
  };

  const withdrawAsset = async (assetId: string, amount: string, isPrivate: boolean) => {
    if (!lendingContract || !wallet || !address) return;
    
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");
      
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        await lendingContract.methods.withdraw_private(
          wallet.getSecretKey(),
          address,
          amountBigInt,
          marketId,
          asset.address
        ).send().wait();
      } else {
        await lendingContract.methods.withdraw_public(
          address,
          amountBigInt,
          marketId,
          asset.address
        ).send().wait();
      }
      
      await refreshData();
    } catch (error) {
      console.error(`Error withdrawing asset:`, error);
      throw error;
    }
  };

  const borrowAsset = async (assetId: string, amount: string, isPrivate: boolean) => {
    if (!lendingContract || !wallet || !address) return;
    
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");
      
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        await lendingContract.methods.borrow_private(
          wallet.getSecretKey(),
          address,
          amountBigInt,
          marketId,
          asset.address
        ).send().wait();
      } else {
        await lendingContract.methods.borrow_public(
          address,
          amountBigInt,
          marketId,
          asset.address
        ).send().wait();
      }
      
      await refreshData();
    } catch (error) {
      console.error(`Error borrowing asset:`, error);
      throw error;
    }
  };

  const repayAsset = async (assetId: string, amount: string, isPrivate: boolean) => {
    if (!lendingContract || !wallet || !address) return;
    
    try {
      const asset = assets.find(a => a.id === assetId);
      if (!asset) throw new Error("Asset not found");
      
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      const nonce = Fr.random();
      
      const tokenContract = await TokenContract.at(asset.address, wallet);
      
      if (isPrivate) {
        const transferToPublicAuthwit = await wallet.createAuthWit({
          caller: lendingContract.address,
          action: tokenContract.methods.transfer_to_public(
            address,
            lendingContract.address,
            amountBigInt,
            nonce,
          ),
        });
        
        await lendingContract.methods.repay_private(
          address,
          amountBigInt,
          nonce,
          wallet.getSecretKey(),
          address,
          marketId,
          asset.address
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
      } else {
        const validateAction = await wallet.setPublicAuthWit(
          {
            caller: lendingContract.address,
            action: tokenContract.methods.transfer_in_public(
              address,
              lendingContract.address,
              amountBigInt,
              nonce,
            ),
          },
          true,
        );
        await validateAction.send().wait();

        await lendingContract.methods.repay_public(
          amountBigInt,
          nonce,
          address,
          marketId,
          asset.address
        ).send().wait();
      }
      
      await refreshData();
    } catch (error) {
      console.error(`Error repaying asset:`, error);
      throw error;
    }
  };

  const refreshData = async () => {
    if (!wallet || !address || !lendingContract) return;
    
    setIsLoading(true);
    try {
      // Convert the all assets JSON to a typed object
      const assetsData = allAssets as Record<string, {
        name: string;
        ticker: string;
        decimals: number;
        oracle: string;
        loan_to_value: number;
        is_borrowable: boolean;
        deposit_cap: string;
        optimal_utilization_rate: number;
        under_optimal_slope: number;
        over_optimal_slope: number;
      }>;
      
      // Initialize all contracts in parallel first
      const assetEntries = Object.entries(assetsData);
      const assetAddresses = assetEntries.map(([id]) => AztecAddress.fromString(id));
      const oracleAddresses = assetEntries.map(([_, data]) => AztecAddress.fromString(data.oracle));
      
      // Create token and price feed contracts in parallel
      const tokenContractPromises = assetAddresses.map(addr => TokenContract.at(addr, wallet));
      const priceFeedPromises = oracleAddresses.map(addr => PriceFeedContract.at(addr, wallet));
      
      // Wait for all contracts to be initialized
      const [tokenContracts, priceFeedContracts] = await Promise.all([
        Promise.all(tokenContractPromises),
        Promise.all(priceFeedPromises)
      ]);
      
      // For each asset, prepare all data fetch promises
      const assetDataPromises = assetEntries.map(([id, data], index) => {
        const assetAddress = assetAddresses[index];
        const tokenContract = tokenContracts[index];
        const priceFeedContract = priceFeedContracts[index];
        
        // Bundle all the async calls for this asset
        return Promise.all([
          // Get wallet balances
          tokenContract.methods.balance_of_public(address).simulate(),
          tokenContract.methods.balance_of_private(address).simulate(),
          
          // Get user position
          lendingContract.methods.get_position(address, marketId, assetAddress).simulate(),
          
          // Get total supplied and borrowed
          lendingContract.methods.get_total_deposited_assets(marketId, assetAddress).simulate(),
          lendingContract.methods.get_total_borrowed_assets(marketId, assetAddress).simulate(),
          
          // Get price
          priceFeedContract.methods.get_price(0).simulate(),
          
          // Get accumulators
          lendingContract.methods.get_accumulators(marketId, assetAddress).simulate(),
          
          // Return asset metadata
          Promise.resolve({ 
            id, 
            assetAddress, 
            data 
          })
        ]);
      });
      
      // Wait for all asset data to be fetched
      const assetsResults = await Promise.all(assetDataPromises);
      // Process the results into Asset objects
      const assetsArray: Asset[] = assetsResults.map(result => {
        const [
          walletBalance,
          walletBalancePrivate,
          userPosition,
          totalSupplied,
          totalBorrowed,
          priceResponse,
          accumulators,
          metadata
        ] = result;
        
        const { id, assetAddress, data } = metadata;
        
        // Calculate utilization rate
        const utilizationRate = totalSupplied > 0 
          ? Number((totalBorrowed * 10000n) / totalSupplied) / 10000 
          : 0;

        // Calculate borrow rate
        let borrowRate = 0;
        const optimalRate = data.optimal_utilization_rate;
        const underSlope = data.under_optimal_slope;
        const overSlope = data.over_optimal_slope;
        
        if (utilizationRate < optimalRate) {
          borrowRate = (utilizationRate * underSlope) / optimalRate;
        } else {
          borrowRate = underSlope + 
            ((utilizationRate - optimalRate) * overSlope) / 
            (1 - optimalRate);
        }
        // Calculate supply rate
        const supplyRate = borrowRate * utilizationRate;
        
        // Calculate supplied and borrowed amounts with accrued interest (user specific)
        const userSuppliedWithInterest = calculateInterestAccrued(
          userPosition.collateral || 0n,
          supplyRate,
          accumulators[0]?.last_updated_ts || 0
        );
        
        const userBorrowedWithInterest = calculateInterestAccrued(
          userPosition.debt || 0n,
          borrowRate,
          accumulators[1]?.last_updated_ts || 0
        );
        
        // Calculate total supplied and borrowed with accrued interest (global pool)
        const totalSuppliedWithInterest = calculateInterestAccrued(
          totalSupplied,
          supplyRate,
          accumulators[0]?.last_updated_ts || 0
        );
        
        const totalBorrowedWithInterest = calculateInterestAccrued(
          totalBorrowed,
          borrowRate,
          accumulators[1]?.last_updated_ts || 0
        );
        
        return {
          id,
          address: assetAddress,
          name: data.name,
          ticker: data.ticker,
          decimals: data.decimals,
          oracle: data.oracle,
          loan_to_value: data.loan_to_value,
          is_borrowable: data.is_borrowable,
          deposit_cap: data.deposit_cap,
          price: priceResponse.price,
          total_supplied: totalSupplied,
          total_borrowed: totalBorrowed,
          total_supplied_with_interest: totalSuppliedWithInterest,
          total_borrowed_with_interest: totalBorrowedWithInterest,
          utilization_rate: utilizationRate,
          borrow_rate: borrowRate,
          supply_rate: supplyRate,
          user_supplied: userPosition.collateral || 0n,
          user_borrowed: userPosition.debt || 0n,
          user_supplied_with_interest: userSuppliedWithInterest,
          user_borrowed_with_interest: userBorrowedWithInterest,
          wallet_balance: walletBalance,
          wallet_balance_private: walletBalancePrivate,
          borrowable_value_usd: 0n,
          deposit_accumulator: {
            value: accumulators[0]?.value || 0n,
            last_updated_ts: Number(accumulators[0]?.last_updated_ts) || 0
          },
          borrow_accumulator: {
            value: accumulators[1]?.value || 0n,
            last_updated_ts: Number(accumulators[1]?.last_updated_ts) || 0
          }
        };
      });
      
      setAssets(assetsArray);
      
      // Calculate user position metrics
      updateUserPosition(assetsArray);
      
    } catch (error) {
      console.error("Failed to refresh lending data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <LendingContext.Provider
      value={{
        assets,
        userPosition,
        isLoading,
        depositAsset,
        withdrawAsset,
        borrowAsset,
        repayAsset,
        refreshData
      }}
    >
      {children}
    </LendingContext.Provider>
  );
}; 