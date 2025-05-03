import { ReactNode, createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { parseUnits, formatUnits } from 'ethers';
import { useWallet, useTransaction } from '../hooks';
import { LendingContract } from '../blockchain/contracts/Lending';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import devContracts from '../blockchain/dev-contracts.json';
import allAssets from '../blockchain/dev-all-assets.json';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR, PERCENTAGE_PRECISION, PRICE_PRECISION_FACTOR, INTEREST_PRECISION_FACTOR } from '../utils/precisionConstants';
import { computePrivateAddress } from '../utils/privacy';

const marketId = 1; // This should eventually be derived from the asset or configuration

// Define type for asset data from JSON
interface AssetMetadata {
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
}

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
  total_supplied_with_interest: bigint;
  total_borrowed_with_interest: bigint;
  utilization_rate: number;
  borrow_rate: number;
  supply_rate: number;
  user_supplied: bigint;
  user_borrowed: bigint;
  user_supplied_with_interest: bigint;
  user_borrowed_with_interest: bigint;
  wallet_balance: bigint;
  wallet_balance_private: bigint;
  borrowable_value_usd: bigint;
  market_liquidity: bigint;
  deposit_accumulator: {
    value: bigint;
    last_updated_ts: number;
  };
  borrow_accumulator: {
    value: bigint;
    last_updated_ts: number;
  };
  withdrawable_amount: bigint;
}

interface UserPosition {
  health_factor: number;
  total_supplied_value: bigint;
  total_borrowed_value: bigint;
}

interface LendingContextType {
  assets: Asset[];
  userPosition: UserPosition;
  lendingContract: LendingContract | null;
  isLoading: boolean;
  depositAsset: (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => Promise<void>;
  withdrawAsset: (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => Promise<void>;
  borrowAsset: (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => Promise<void>;
  repayAsset: (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => Promise<void>;
  refreshData: () => Promise<void>;
}

// Interface for fetched asset data structure
interface AssetDataResult {
  walletBalance: bigint;
  walletBalancePrivate: bigint;
  userPosition: {
    collateral?: bigint;
    debt?: bigint;
  };
  totalSupplied: bigint;
  totalBorrowed: bigint;
  priceResponse: {
    price: bigint;
  };
  accumulators: Array<{
    value: bigint;
    last_updated_ts: number;
  }>;
  metadata: {
    id: string;
    assetAddress: AztecAddress;
    data: AssetMetadata;
  };
}

const defaultContext: LendingContextType = {
  assets: [],
  lendingContract: null,
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

export const LendingContext = createContext<LendingContextType>(defaultContext);

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

// Helper function to calculate interest rates based on utilization
const calculateInterestRates = (
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

interface LendingProviderProps {
  children: ReactNode;
}

export const LendingProvider = ({ children }: LendingProviderProps) => {
  const { wallet, address } = useWallet();
  const { 
    depositAsset: txDepositAsset, 
    withdrawAsset: txWithdrawAsset, 
    borrowAsset: txBorrowAsset, 
    repayAsset: txRepayAsset,
    privateAddresses 
  } = useTransaction();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [lendingContract, setLendingContract] = useState<LendingContract | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [userPosition, setUserPosition] = useState<UserPosition>({
    health_factor: Infinity,
    total_supplied_value: 0n,
    total_borrowed_value: 0n
  });
  // Store current assets in a ref to access from the interval without dependencies
  const assetsRef = useRef<Asset[]>([]);
  
  // Update assets ref whenever assets change
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

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

  // Add new useEffect for the interval to update interest accruals
  useEffect(() => {
    // Only start the interval if we have assets loaded
    if (assets.length === 0) return;

    // Set up interval to update interest calculations every 5 seconds
    const intervalId = setInterval(() => {
      updateInterestAccruals();
    }, 5000); // 5000 milliseconds = 5 seconds

    // Clean up the interval when the component unmounts
    return () => {
      clearInterval(intervalId);
    };
  }, [assets.length]); // Only re-create when assets length changes (i.e., when assets are first loaded)

  // Function to update interest accruals without querying the blockchain
  const updateInterestAccruals = useCallback(() => {
    // If no assets, nothing to update
    if (assetsRef.current.length === 0) return;

    // Create a copy of current assets to work with
    const updatedAssets = assetsRef.current.map(asset => {
      // Clone the asset to avoid mutating state directly
      const updatedAsset = { ...asset };
      
      // Calculate updated interest for user deposits
      updatedAsset.user_supplied_with_interest = calculateInterestAccrued(
        updatedAsset.user_supplied,
        updatedAsset.supply_rate,
        updatedAsset.deposit_accumulator.last_updated_ts
      );
      
      // Calculate updated interest for user borrows
      updatedAsset.user_borrowed_with_interest = calculateInterestAccrued(
        updatedAsset.user_borrowed,
        updatedAsset.borrow_rate,
        updatedAsset.borrow_accumulator.last_updated_ts
      );
      
      // Calculate updated interest for total supplies and borrows
      updatedAsset.total_supplied_with_interest = calculateInterestAccrued(
        updatedAsset.total_supplied,
        updatedAsset.supply_rate,
        updatedAsset.deposit_accumulator.last_updated_ts
      );
      
      updatedAsset.total_borrowed_with_interest = calculateInterestAccrued(
        updatedAsset.total_borrowed,
        updatedAsset.borrow_rate,
        updatedAsset.borrow_accumulator.last_updated_ts
      );
      
      // Recalculate market liquidity
      updatedAsset.market_liquidity = updatedAsset.total_supplied_with_interest > updatedAsset.total_borrowed_with_interest
        ? updatedAsset.total_supplied_with_interest - updatedAsset.total_borrowed_with_interest
        : 0n;
      
      return updatedAsset;
    });
    
    // Update state with the new asset values
    setAssets(updatedAssets);
    
    // Update user position metrics
    updateUserPosition(updatedAssets);
  }, []);

  // Utility function to process asset data into Asset objects
  const processAssetData = (result: AssetDataResult): Asset => {
    const {
      walletBalance,
      walletBalancePrivate,
      userPosition,
      totalSupplied,
      totalBorrowed,
      priceResponse,
      accumulators,
      metadata
    } = result;
    
    const { id, assetAddress, data } = metadata;
    
    // Calculate utilization rate
    const utilizationRate = totalSupplied > 0 
      ? Number((totalBorrowed * 10000n) / totalSupplied) / 10000 
      : 0;
      
    // Calculate rates using helper function
    const { borrowRate, supplyRate } = calculateInterestRates(
      utilizationRate,
      data.optimal_utilization_rate,
      data.under_optimal_slope,
      data.over_optimal_slope
    );
    
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
    
    // Calculate market liquidity (available liquidity)
    const marketLiquidity = totalSuppliedWithInterest > totalBorrowedWithInterest 
      ? totalSuppliedWithInterest - totalBorrowedWithInterest 
      : 0n;
    
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
      borrowable_value_usd: 0n, // Will be updated in updateUserPosition
      market_liquidity: marketLiquidity,
      deposit_accumulator: {
        value: accumulators[0]?.value || 0n,
        last_updated_ts: Number(accumulators[0]?.last_updated_ts) || 0
      },
      borrow_accumulator: {
        value: accumulators[1]?.value || 0n,
        last_updated_ts: Number(accumulators[1]?.last_updated_ts) || 0
      },
      withdrawable_amount: 0n // Will be calculated in updateUserPosition
    };
  };

  // Helper function to fetch all asset data
  const fetchAssetData = async (contract: LendingContract): Promise<Asset[]> => {
    if (!wallet || !address) return [];
    
    // Parse asset metadata from JSON
    const assetsData = allAssets as Record<string, AssetMetadata>;
    
    // Initialize all contracts in parallel
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
    const assetDataPromises = assetEntries.map(async ([id, data], index) => {
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
    
    // Process results into Asset objects
    return assetsResults.map(result => {
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
      
      // Process asset data into an Asset object
      return processAssetData({
        walletBalance,
        walletBalancePrivate,
        userPosition,
        totalSupplied,
        totalBorrowed,
        priceResponse,
        accumulators,
        metadata
      });
    });
  };

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
      
      // Fetch all asset data
      const assetsArray = await fetchAssetData(contract);
      
      // Update state with processed assets
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
    
    // Calculate excess collateral value
    const excessCollateralValueUsd = totalSuppliedValue > collateralValueNeeded
      ? totalSuppliedValue - collateralValueNeeded
      : 0n;

    // Update borrowable value and withdrawable amount for each asset
    for (const asset of assetsArray) {
      // Update borrowable value
      if (asset.is_borrowable) {
        // Convert market liquidity to USD using the asset's price and decimals
        const marketLiquidityUsd = tokenToUsd(asset.market_liquidity, asset.decimals, asset.price);
        
        // Calculate maximum amount user can borrow based on collateral and this asset's LTV
        const maxBorrowableUsd = applyLtv(excessCollateralValueUsd, asset.loan_to_value);
        
        // Borrowable value is the minimum of market liquidity (in USD) and maximum borrowable based on collateral
        asset.borrowable_value_usd = marketLiquidityUsd < maxBorrowableUsd 
          ? marketLiquidityUsd 
          : maxBorrowableUsd;
      } else {
        asset.borrowable_value_usd = 0n;
      }

      // Update withdrawable amount
      if (asset.user_supplied_with_interest === 0n) {
        // If user hasn't supplied this asset, they can't withdraw any
        asset.withdrawable_amount = 0n;
      } else {
        // Convert asset-specific supplied value to USD
        const assetSuppliedValueUsd = tokenToUsd(
          asset.user_supplied_with_interest, 
          asset.decimals, 
          asset.price
        );
        
        if (assetSuppliedValueUsd > excessCollateralValueUsd) {
          asset.withdrawable_amount = usdToToken(excessCollateralValueUsd, asset.decimals, asset.price);
        } else {
          asset.withdrawable_amount = asset.user_supplied_with_interest;
        }
      }
    }
    
    setUserPosition({
      health_factor: healthFactor,
      total_supplied_value: totalSuppliedValue,
      total_borrowed_value: totalBorrowedValue
    });
  };

  // Helper function to validate common transaction requirements
  const validateTransaction = (assetId: string): Asset => {
    if (!lendingContract || !wallet || !address) {
      throw new Error("Wallet or lending contract not initialized");
    }
    
    const asset = assets.find(a => a.id === assetId);
    if (!asset) throw new Error("Asset not found");
    
    return asset;
  };

  const depositAsset = async (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => {
    try {
      const asset = validateTransaction(assetId);
      
      if (!lendingContract) {
        throw new Error("Lending contract not initialized");
      }
      
      // Use the transaction context to perform the deposit
      await txDepositAsset(
        lendingContract, 
        asset, 
        amount, 
        isPrivate,
        privateRecipient,
        secret,
        marketId
      );
      
      // Refresh data after the transaction
      await refreshData();
    } catch (error) {
      console.error(`Error depositing asset:`, error);
      throw error;
    }
  };

  const withdrawAsset = async (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => {
    try {
      const asset = validateTransaction(assetId);
      
      if (!lendingContract) {
        throw new Error("Lending contract not initialized");
      }
      
      // Use the transaction context to perform the withdrawal
      await txWithdrawAsset(
        lendingContract, 
        asset, 
        amount, 
        isPrivate,
        privateRecipient,
        secret,
        marketId
      );
      
      // Refresh data after the transaction
      await refreshData();
    } catch (error) {
      console.error(`Error withdrawing asset:`, error);
      throw error;
    }
  };

  const borrowAsset = async (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => {
    try {
      const asset = validateTransaction(assetId);
      
      if (!lendingContract) {
        throw new Error("Lending contract not initialized");
      }
      
      // Use the transaction context to perform the borrow
      await txBorrowAsset(
        lendingContract, 
        asset, 
        amount, 
        isPrivate,
        privateRecipient,
        secret,
        marketId
      );
      
      // Refresh data after the transaction
      await refreshData();
    } catch (error) {
      console.error(`Error borrowing asset:`, error);
      throw error;
    }
  };

  const repayAsset = async (assetId: string, amount: string, isPrivate: boolean, privateRecipient?: AztecAddress, secret?: Fr | bigint) => {
    try {
      const asset = validateTransaction(assetId);
      
      if (!lendingContract) {
        throw new Error("Lending contract not initialized");
      }
      
      // Use the transaction context to perform the repay
      await txRepayAsset(
        lendingContract, 
        asset, 
        amount, 
        isPrivate,
        privateRecipient,
        secret,
        marketId
      );
      
      // Refresh data after the transaction
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
      // Fetch all asset data
      const assetsArray = await fetchAssetData(lendingContract);
      
      // Update state with processed assets
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
        lendingContract,
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