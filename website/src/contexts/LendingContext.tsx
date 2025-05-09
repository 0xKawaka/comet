import { ReactNode, createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { parseUnits, formatUnits } from 'ethers';
import { useWallet } from '../hooks';
import { LendingContract } from '../blockchain/contracts/Lending';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import devContracts from '../blockchain/dev-contracts.json';
import allAssets from '../blockchain/dev-all-assets.json';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';
import { tokenToUsd, usdToToken, applyLtv, PERCENTAGE_PRECISION_FACTOR, PERCENTAGE_PRECISION, PRICE_PRECISION_FACTOR, INTEREST_PRECISION_FACTOR } from '../utils/precisionConstants';
import { useAbortController } from '../hooks/useAbortController';
import { asyncWithAbort } from '../utils/asyncWithAbort';
import { calculateInterestAccrued, calculateInterestRates } from '../utils/interestCalculations';

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
  // Action max amounts
  max_deposit_public: bigint;
  max_deposit_private: bigint;
  max_withdraw: bigint;
  max_borrow: bigint;
  max_repay_public: bigint;
  max_repay_private: bigint;
}

export interface UserPosition {
  health_factor: number;
  total_supplied_value: bigint;
  total_borrowed_value: bigint;
}

// Add interfaces for token and price feed contract mappings
interface TokenContracts {
  [assetId: string]: TokenContract;
}

interface PriceFeedContracts {
  [assetId: string]: PriceFeedContract;
}

interface LendingContextType {
  assets: Asset[];
  userPosition: UserPosition;
  lendingContract: LendingContract | null;
  isLoading: boolean;
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
  refreshData: async () => {},
  refreshAssetData: async () => {}
};

export const LendingContext = createContext<LendingContextType>(defaultContext);

export const useLending = () => useContext(LendingContext);

interface LendingProviderProps {
  children: ReactNode;
}

export const LendingProvider = ({ children }: LendingProviderProps) => {
  const { wallet, address, selectedAddress } = useWallet();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [lendingContract, setLendingContract] = useState<LendingContract | null>(null);
  const [tokenContracts, setTokenContracts] = useState<TokenContracts>({});
  const [priceFeedContracts, setPriceFeedContracts] = useState<PriceFeedContracts>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [userPosition, setUserPosition] = useState<UserPosition>({
    health_factor: Infinity,
    total_supplied_value: 0n,
    total_borrowed_value: 0n
  });
  
  // Replace the refs with our new hook
  const abortController = useAbortController();
  
  // Store current assets in a ref to access from the interval without dependencies
  const assetsRef = useRef<Asset[]>([]);
  
  // Update assets ref whenever assets change
  useEffect(() => {
    assetsRef.current = assets;
  }, [assets]);

  // Separate effect for contract initialization
  useEffect(() => {
    if (!wallet) {
      return;
    }    
    console.log('Initializing contracts');

    const initializeContracts = async () => {
      try {
        // Initialize lending contract
        const contract = await LendingContract.at(
          AztecAddress.fromString(devContracts.lending),
          wallet
        );
        setLendingContract(contract);
        
        // Initialize token and price feed contracts
        const assetsData = allAssets as Record<string, AssetMetadata>;
        const newTokenContracts: TokenContracts = {};
        const newPriceFeedContracts: PriceFeedContracts = {};
        
        // Process assets in parallel
        const initPromises = Object.entries(assetsData).map(async ([id, data]) => {
          const assetAddress = AztecAddress.fromString(id);
          const oracleAddress = AztecAddress.fromString(data.oracle);
          
          const [tokenContract, priceFeedContract] = await Promise.all([
            TokenContract.at(assetAddress, wallet),
            PriceFeedContract.at(oracleAddress, wallet)
          ]);
          
          return { id, tokenContract, priceFeedContract };
        });
        
        // Wait for all contracts to be initialized
        const results = await Promise.all(initPromises);
        
        // Store contracts in state
        results.forEach(({ id, tokenContract, priceFeedContract }) => {
          newTokenContracts[id] = tokenContract;
          newPriceFeedContracts[id] = priceFeedContract;
        });
        
        setTokenContracts(newTokenContracts);
        setPriceFeedContracts(newPriceFeedContracts);
        
      } catch (error) {
        console.error("Failed to initialize contracts:", error);
      }
    };

    initializeContracts();
  }, [wallet]);

  // Separate effect for data fetching
  useEffect(() => {
    if (!lendingContract || !selectedAddress || Object.keys(tokenContracts).length === 0 || Object.keys(priceFeedContracts).length === 0) {
      return;
    }
    console.log('Fetching asset data');

    const fetchData = async () => {
      try {
        setIsLoading(true);
        const assetsArray = await fetchAssetData(lendingContract);
        setAssets(assetsArray);
        updateUserPosition(assetsArray);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Data fetch aborted');
        } else {
          console.error("Failed to fetch asset data:", error);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [lendingContract, tokenContracts, priceFeedContracts]);

  // Effect for handling address changes
  useEffect(() => {
    // Abort any previous fetch when address changes
    if (selectedAddress) {
      abortController.updateAddress(selectedAddress);
      abortController.abortCurrent();
      
      // If we have a lending contract and selected address, trigger a refresh
      if (lendingContract && Object.keys(tokenContracts).length > 0 && Object.keys(priceFeedContracts).length > 0) {
        refreshData();
      }
    }
  }, [selectedAddress]); // Only depend on selectedAddress

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
      withdrawable_amount: 0n, // Will be calculated in updateUserPosition
      max_deposit_public: walletBalance,
      max_deposit_private: walletBalancePrivate,
      max_withdraw: 0n, // Will be calculated in updateUserPosition
      max_borrow: 0n, // Will be calculated in updateUserPosition
      max_repay_public: userBorrowedWithInterest < walletBalance ? userBorrowedWithInterest : walletBalance,
      max_repay_private: userBorrowedWithInterest < walletBalancePrivate ? userBorrowedWithInterest : walletBalancePrivate
    };
  };

  // Helper function to fetch all asset data - modified to use pre-initialized contracts
  const fetchAssetData = async (contract: LendingContract): Promise<Asset[]> => {
    if (!wallet || !selectedAddress || !address || Object.keys(tokenContracts).length === 0 || Object.keys(priceFeedContracts).length === 0) return [];
    console.log('fetchAssetData called with:', {
      hasContract: !!contract,
      currentAddress: selectedAddress?.toString()
    });
    
    // Parse asset metadata from JSON
    const assetsData = allAssets as Record<string, AssetMetadata>;
    
    // For each asset, prepare all data fetch promises
    const assetDataPromises = Object.entries(assetsData).map(async ([id, data]) => {
      const assetAddress = AztecAddress.fromString(id);
      const tokenContract = tokenContracts[id];
      const priceFeedContract = priceFeedContracts[id];
      
      if (!tokenContract || !priceFeedContract) {
        console.error(`Missing contract for asset ${id}`);
        return null;
      }
      
      // Bundle all the async calls for this asset
      const result = await Promise.all([
        // Get wallet balances - use address instead of selectedAddress for balances
        tokenContract.methods.balance_of_public(address).simulate(),
        tokenContract.methods.balance_of_private(address).simulate(),
        
        // Get user position - keep using selectedAddress for everything else
        contract.methods.get_position(selectedAddress, marketId, assetAddress).simulate(),
        
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
    
    // Wait for all asset data to be fetched
    const assetsResults = await Promise.all(assetDataPromises);
    
    // Filter out null results (if any) and return valid assets
    return assetsResults.filter((asset): asset is Asset => asset !== null);
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
          
        // Convert borrowable USD value to token amount
        const borrowableAmount = usdToToken(asset.borrowable_value_usd, asset.decimals, asset.price);
        asset.max_borrow = borrowableAmount < asset.market_liquidity ? borrowableAmount : asset.market_liquidity;
      } else {
        asset.borrowable_value_usd = 0n;
        asset.max_borrow = 0n;
      }

      // Update withdrawable amount
      if (asset.user_supplied_with_interest === 0n) {
        // If user hasn't supplied this asset, they can't withdraw any
        asset.withdrawable_amount = 0n;
        asset.max_withdraw = 0n;
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
        
        // Set max_withdraw based on withdrawable_amount and market_liquidity
        asset.max_withdraw = asset.withdrawable_amount < asset.market_liquidity 
          ? asset.withdrawable_amount 
          : asset.market_liquidity;
      }
      
      // Update max repay amounts in case user borrowed/repaid outside of our app
      asset.max_repay_public = asset.user_borrowed_with_interest < asset.wallet_balance 
        ? asset.user_borrowed_with_interest 
        : asset.wallet_balance;
      
      asset.max_repay_private = asset.user_borrowed_with_interest < asset.wallet_balance_private 
        ? asset.user_borrowed_with_interest 
        : asset.wallet_balance_private;
    }
    
    setUserPosition({
      health_factor: healthFactor,
      total_supplied_value: totalSuppliedValue,
      total_borrowed_value: totalBorrowedValue
    });
  };

  // Function to fetch data for a single asset
  const fetchSingleAssetData = async (contract: LendingContract, assetId: string): Promise<Asset | null> => {
    // Check that wallet is available and we have a current address reference
    if (!wallet || !selectedAddress || !address) return null;
    
    // Get the contracts for this asset
    const tokenContract = tokenContracts[assetId];
    const priceFeedContract = priceFeedContracts[assetId];
    
    if (!tokenContract || !priceFeedContract) {
      console.error(`Missing contracts for asset ${assetId}`);
      return null;
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
    
    try {
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
        // Get wallet balances - use address instead of selectedAddress
        tokenContract.methods.balance_of_public(address).simulate(),
        tokenContract.methods.balance_of_private(address).simulate(),
        
        // Get user position - keep using selectedAddress
        contract.methods.get_position(selectedAddress, marketId, assetAddress).simulate(),
        
        // Get total supplied and borrowed
        contract.methods.get_total_deposited_assets(marketId, assetAddress).simulate(),
        contract.methods.get_total_borrowed_assets(marketId, assetAddress).simulate(),
        
        // Get price
        priceFeedContract.methods.get_price(0).simulate(),
        
        // Get accumulators
        contract.methods.get_accumulators(marketId, assetAddress).simulate()
      ]);
      
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

  const refreshData = async () => {
    if (!wallet || !selectedAddress || !lendingContract || Object.keys(tokenContracts).length === 0) return;
    
    // Update the current address
    abortController.updateAddress(selectedAddress);
    
    // Only set isLoading if we don't have any assets yet (initial load)
    // Otherwise use isRefreshing to indicate data is being updated
    if (assets.length === 0) {
      setIsLoading(true);
    } else {
      setIsRefreshing(true);
    }
    
    try {
      // Only clear assets on initial load, not during address switches
      if (assets.length === 0) {
        setAssets([]);
        setUserPosition({
          health_factor: Infinity,
          total_supplied_value: 0n,
          total_borrowed_value: 0n
        });
      }
      
      // Use our new utility to handle the async operation with abort checks
      console.log('Fetching asset data 2');
      const assetsArray = await asyncWithAbort(
        () => fetchAssetData(lendingContract),
        abortController,
        selectedAddress
      );
      
      // If null is returned, it means the operation was aborted or address changed
      if (assetsArray === null) {
        return;
      }
      
      // Update state with processed assets
      setAssets(assetsArray);
      
      // Calculate user position metrics
      updateUserPosition(assetsArray);
    } catch (error) {
      // Don't report errors for aborted operations
      if (error instanceof Error && error.name === 'AbortError') {
        console.log("Fetch operation aborted:", error.message);
      } else {
        console.error("Failed to refresh lending data:", error);
      }
    } finally {
      // Only set loading/refreshing to false if we're still fetching for the same address
      if (!abortController.isAborted() && !abortController.isAddressChanged(selectedAddress)) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  // Add the refreshAssetData function
  const refreshAssetData = async (assetId: string) => {
    if (!wallet || !selectedAddress || !lendingContract || !tokenContracts[assetId] || !priceFeedContracts[assetId]) {
      console.error("Cannot refresh asset data: required contracts not initialized");
      return;
    }
    
    // Update the current address
    abortController.updateAddress(selectedAddress);
    
    // Set the refreshing state
    setIsRefreshing(true);
    
    try {
      // Use our new utility to handle the async operation with abort checks
      const updatedAsset = await asyncWithAbort(
        () => fetchSingleAssetData(lendingContract, assetId),
        abortController,
        selectedAddress
      );
      
      // If null is returned, it means the operation was aborted or address changed
      if (updatedAsset === null) {
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
      // Only set refreshing to false if we're still fetching for the same address
      if (!abortController.isAborted() && !abortController.isAddressChanged(selectedAddress)) {
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
        refreshData,
        refreshAssetData
      }}
    >
      {children}
    </LendingContext.Provider>
  );
}; 