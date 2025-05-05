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
  refreshAssetData: (assetId: string) => Promise<void>;
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
  refreshData: async () => {},
  refreshAssetData: async () => {}
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
  const { wallet, address, selectedAddress } = useWallet();
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
  const [isRefreshing, setIsRefreshing] = useState(false); // New state to track when we're refreshing (vs. initial loading)
  const [userPosition, setUserPosition] = useState<UserPosition>({
    health_factor: Infinity,
    total_supplied_value: 0n,
    total_borrowed_value: 0n
  });
  // Store current assets in a ref to access from the interval without dependencies
  const assetsRef = useRef<Asset[]>([]);
  // Add a ref to track the current selected address for fetch operations
  const currentAddressRef = useRef<AztecAddress | undefined>(undefined);
  // Add a ref to track the current abort controller for cancelling in-progress fetches
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Update assets ref whenever assets change
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // Update the address ref whenever selectedAddress changes
  useEffect(() => {
    // Abort any previous fetch when address changes
    if (abortControllerRef.current) {
      console.log("Aborting previous fetch due to address change");
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    currentAddressRef.current = selectedAddress;
  }, [selectedAddress]);

  useEffect(() => {
    if (wallet && address) {
      initLendingContract();
    }
  }, [wallet, address]);

  // Add a new useEffect to refresh data when selectedAddress changes
  useEffect(() => {
    if (selectedAddress && lendingContract) {
      // Refresh market data when the selected address changes
      refreshData();
    }
  }, [selectedAddress, lendingContract]);

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

  // Helper function to fetch all asset data - modified to use selectedAddress
  const fetchAssetData = async (contract: LendingContract, signal?: AbortSignal): Promise<Asset[]> => {
    // Check that wallet is available and we have a current address reference
    if (!wallet || !currentAddressRef.current) return [];
    
    // Use the captured reference address for consistent fetching
    const currentAddress = currentAddressRef.current;
    
    // Check for abort before starting
    if (signal?.aborted) {
      throw new DOMException("Fetch aborted", "AbortError");
    }
    
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
    
    // Check for abort after contract initialization
    if (signal?.aborted) {
      throw new DOMException("Fetch aborted", "AbortError");
    }
    
    // Check if the address has changed during contract initialization
    if (!currentAddressRef.current || !currentAddress.equals(currentAddressRef.current)) {
      console.log("Address changed during contract initialization, aborting fetch");
      return [];
    }
    
    // For each asset, prepare all data fetch promises
    const assetDataPromises = assetEntries.map(async ([id, data], index) => {
      // Check for abort before each asset fetch
      if (signal?.aborted) {
        return null;
      }
      
      const assetAddress = assetAddresses[index];
      const tokenContract = tokenContracts[index];
      const priceFeedContract = priceFeedContracts[index];
      
      // Verify the address hasn't changed before each asset fetch
      if (!currentAddressRef.current || !currentAddress.equals(currentAddressRef.current)) {
        return null; // Will be filtered out later
      }
      
      // Bundle all the async calls for this asset
      return Promise.all([
        // Get wallet balances - use currentAddress
        tokenContract.methods.balance_of_public(currentAddress).simulate(),
        tokenContract.methods.balance_of_private(currentAddress).simulate(),
        
        // Get user position - use currentAddress
        contract.methods.get_position(currentAddress, marketId, assetAddress).simulate(),
        
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
    
    // Check for abort before waiting for asset data
    if (signal?.aborted) {
      throw new DOMException("Fetch aborted", "AbortError");
    }
    
    // Wait for all asset data to be fetched
    const assetResultsWithNulls = await Promise.all(assetDataPromises);
    
    // Check for abort after asset data fetch
    if (signal?.aborted) {
      throw new DOMException("Fetch aborted", "AbortError");
    }
    
    // Filter out any null results from address changes
    const assetsResults = assetResultsWithNulls.filter(result => result !== null) as any[];
    
    // Final check - if address changed during any of the fetches, return empty array
    if (!currentAddressRef.current || !currentAddress.equals(currentAddressRef.current)) {
      console.log("Address changed during data fetching, aborting");
      return [];
    }
    
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

  // Helper function to validate common transaction requirements - modified to use selectedAddress
  const validateTransaction = (assetId: string): Asset => {
    if (!lendingContract || !wallet || !selectedAddress) {
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
      
      // Refresh only the specific asset data after the transaction
      await refreshAssetData(assetId);
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
      
      // Refresh only the specific asset data after the transaction
      await refreshAssetData(assetId);
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
      
      // Refresh only the specific asset data after the transaction
      await refreshAssetData(assetId);
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
      
      // Refresh only the specific asset data after the transaction
      await refreshAssetData(assetId);
    } catch (error) {
      console.error(`Error repaying asset:`, error);
      throw error;
    }
  };

  const refreshData = async () => {
    if (!wallet || !selectedAddress || !lendingContract) return;
    
    // Abort any previous fetch operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller for this fetch operation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Store the address we're currently fetching for
    const fetchingForAddress = selectedAddress;
    // Update the reference to the current address
    currentAddressRef.current = fetchingForAddress;
    
    // Only set isLoading if we don't have any assets yet (initial load)
    // Otherwise use isRefreshing to indicate data is being updated
    if (assets.length === 0) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    
    try {
      // Check if the operation was aborted before we even started
      if (abortController.signal.aborted) {
        console.log("Fetch operation aborted before it started");
        return;
      }
      
      // Only clear assets on initial load, not during address switches
      // This prevents the "Asset not found" flash during address switching
      if (assets.length === 0) {
        setAssets([]);
        setUserPosition({
          health_factor: Infinity,
          total_supplied_value: 0n,
          total_borrowed_value: 0n
        });
      }
      
      // Fetch all asset data using the captured selectedAddress and abort signal
      const assetsArray = await fetchAssetData(lendingContract, abortController.signal);
      
      // Check if the operation was aborted during fetching
      if (abortController.signal.aborted) {
        console.log("Fetch operation aborted during execution");
        return;
      }
      
      // Check if the address we're fetching for is still the current selected address
      // If not, the data is stale and should be discarded - a new fetch will be triggered
      if (currentAddressRef.current && fetchingForAddress.equals(currentAddressRef.current)) {
        // Update state with processed assets
        setAssets(assetsArray);
        
        // Calculate user position metrics
        updateUserPosition(assetsArray);
      } else {
        // Address changed during fetch, discard results
        console.log("Address changed during data fetch, discarding results");
      }
    } catch (error) {
      // Don't report errors for aborted operations
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Fetch operation aborted:", error.message);
      } else {
        console.error("Failed to refresh lending data:", error);
      }
    } finally {
      // Clear the abort controller reference if it's still the same one
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      
      // Only set loading/refreshing to false if we're still fetching for the same address
      // and the operation wasn't aborted
      if (!abortController.signal.aborted && 
          currentAddressRef.current && 
          fetchingForAddress.equals(currentAddressRef.current)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Function to fetch data for a single asset
  const fetchSingleAssetData = async (contract: LendingContract, assetId: string, signal?: AbortSignal): Promise<Asset | null> => {
    // Check that wallet is available and we have a current address reference
    if (!wallet || !currentAddressRef.current) return null;
    
    // Use the captured reference address for consistent fetching
    const currentAddress = currentAddressRef.current;
    
    // Check for abort before starting
    if (signal?.aborted) {
      throw new DOMException("Fetch aborted", "AbortError");
    }
    
    // Parse asset metadata from JSON
    const assetsData = allAssets as Record<string, AssetMetadata>;
    
    // Get the specific asset data
    const data = assetsData[assetId];
    if (!data) {
      console.error(`Asset with ID ${assetId} not found in metadata`);
      return null;
    }
    
    const assetAddress = AztecAddress.fromString(assetId);
    const oracleAddress = AztecAddress.fromString(data.oracle);
    
    try {
      // Create token and price feed contracts
      const tokenContract = await TokenContract.at(assetAddress, wallet);
      const priceFeedContract = await PriceFeedContract.at(oracleAddress, wallet);
      
      // Check for abort after contract initialization
      if (signal?.aborted) {
        throw new DOMException("Fetch aborted", "AbortError");
      }
      
      // Check if the address has changed during contract initialization
      if (!currentAddressRef.current || !currentAddress.equals(currentAddressRef.current)) {
        console.log("Address changed during contract initialization, aborting fetch");
        return null;
      }
      
      // Bundle all the async calls for this asset
      const [
        walletBalance,
        walletBalancePrivate,
        userPosition,
        totalSupplied,
        totalBorrowed,
        priceResponse,
        accumulators
      ] = await Promise.all([
        // Get wallet balances - use currentAddress
        tokenContract.methods.balance_of_public(currentAddress).simulate(),
        tokenContract.methods.balance_of_private(currentAddress).simulate(),
        
        // Get user position - use currentAddress
        contract.methods.get_position(currentAddress, marketId, assetAddress).simulate(),
        
        // Get total supplied and borrowed
        contract.methods.get_total_deposited_assets(marketId, assetAddress).simulate(),
        contract.methods.get_total_borrowed_assets(marketId, assetAddress).simulate(),
        
        // Get price
        priceFeedContract.methods.get_price(0).simulate(),
        
        // Get accumulators
        contract.methods.get_accumulators(marketId, assetAddress).simulate()
      ]);
      
      // Check for abort after data fetching
      if (signal?.aborted) {
        throw new DOMException("Fetch aborted", "AbortError");
      }
      
      // Final check - if address changed during any of the fetches, return null
      if (!currentAddressRef.current || !currentAddress.equals(currentAddressRef.current)) {
        console.log("Address changed during data fetching, aborting");
        return null;
      }
      
      // Prepare the metadata object
      const metadata = { 
        id: assetId, 
        assetAddress, 
        data 
      };
      
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
    } catch (error) {
      console.error(`Error fetching data for asset ${assetId}:`, error);
      return null;
    }
  };

  // Add the refreshAssetData function
  const refreshAssetData = async (assetId: string) => {
    if (!wallet || !selectedAddress || !lendingContract) {
      console.error("Cannot refresh asset data: wallet, selectedAddress, or lendingContract is not initialized");
      return;
    }
    
    // Abort any previous fetch operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create a new abort controller for this fetch operation
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    // Store the address we're currently fetching for
    const fetchingForAddress = selectedAddress;
    // Update the reference to the current address
    currentAddressRef.current = fetchingForAddress;
    
    // Set the refreshing state
    setIsRefreshing(true);
    
    try {
      // Check if the operation was aborted before we even started
      if (abortController.signal.aborted) {
        console.log("Fetch operation aborted before it started");
        return;
      }
      
      // Fetch the single asset data
      const updatedAsset = await fetchSingleAssetData(lendingContract, assetId, abortController.signal);
      
      // Check if the operation was aborted during fetching
      if (abortController.signal.aborted) {
        console.log("Fetch operation aborted during execution");
        return;
      }
      
      // If the address changed or we couldn't fetch the asset, just return
      if (!currentAddressRef.current || 
          !fetchingForAddress.equals(currentAddressRef.current) || 
          !updatedAsset) {
        console.log("Address changed during data fetch or asset not found, discarding results");
        return;
      }
      
      // Update the assets array with the new asset data
      setAssets(prevAssets => {
        const updatedAssets = prevAssets.map(asset => 
          asset.id === assetId ? updatedAsset : asset
        );
        
        // Calculate user position metrics
        updateUserPosition(updatedAssets);
        
        return updatedAssets;
      });
    } catch (error) {
      // Don't report errors for aborted operations
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Fetch operation aborted:", error.message);
      } else {
        console.error(`Failed to refresh asset ${assetId}:`, error);
      }
    } finally {
      // Clear the abort controller reference if it's still the same one
      if (abortControllerRef.current === abortController) {
        abortControllerRef.current = null;
      }
      
      // Only set refreshing to false if we're still fetching for the same address
      // and the operation wasn't aborted
      if (!abortController.signal.aborted && 
          currentAddressRef.current && 
          fetchingForAddress.equals(currentAddressRef.current)) {
        setIsRefreshing(false);
      }
    }
  };

  return (
    <LendingContext.Provider
      value={{
        assets,
        userPosition,
        lendingContract,
        isLoading: isLoading || isRefreshing, // Combine both loading states for consumers
        depositAsset,
        withdrawAsset,
        borrowAsset,
        repayAsset,
        refreshData,
        refreshAssetData
      }}
    >
      {children}
    </LendingContext.Provider>
  );
}; 