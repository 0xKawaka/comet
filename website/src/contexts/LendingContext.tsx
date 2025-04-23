import { ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { useWallet } from '../hooks';
import { LendingContract } from '../blockchain/contracts/Lending';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import devContracts from '../blockchain/dev-contracts.json';
import allAssets from '../blockchain/dev-all-assets.json';
import { calculateHealthFactor } from '../utils/formatters';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';

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
  utilization_rate: number;
  user_supplied: bigint;
  user_borrowed: bigint;
  wallet_balance: bigint;
  wallet_balance_private: bigint;
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
          metadata
        ] = result;
        
        const { id, assetAddress, data } = metadata;
        
        // Calculate utilization rate
        const utilizationRate = totalSupplied > 0 
          ? Number((totalBorrowed * 10000n) / totalSupplied) / 100 
          : 0;
        
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
          utilization_rate: utilizationRate,
          user_supplied: userPosition.collateral || 0n,
          user_borrowed: userPosition.debt || 0n,
          wallet_balance: walletBalance,
          wallet_balance_private: walletBalancePrivate
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
    // Calculate total values
    const totalSuppliedValue = assetsArray.reduce((sum, asset) => {
      const value = (asset.user_supplied * asset.price) / (10n ** BigInt(asset.decimals));
      return sum + value;
    }, 0n);
    
    const totalBorrowedValue = assetsArray.reduce((sum, asset) => {
      const value = (asset.user_borrowed * asset.price) / (10n ** BigInt(asset.decimals));
      return sum + value;
    }, 0n);
    
    // Calculate weighted collateral value
    let weightedCollatValue = 0n;
    for (const asset of assetsArray) {
      const collatValue = (asset.user_supplied * asset.price) / (10n ** BigInt(asset.decimals));
      const ltvBps = BigInt(Math.floor(asset.loan_to_value * 10000));
      weightedCollatValue += (collatValue * ltvBps) / 10000n;
    }
    
    const healthFactor = totalBorrowedValue > 0 
      ? Number(weightedCollatValue * 100n / totalBorrowedValue) / 100 
      : Infinity;
    
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
      
      const amountBigInt = BigInt(amount) * (10n ** BigInt(asset.decimals));
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
      
      const amountBigInt = BigInt(amount) * (10n ** BigInt(asset.decimals));
      
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
      
      const amountBigInt = BigInt(amount) * (10n ** BigInt(asset.decimals));
      
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
      
      const amountBigInt = BigInt(amount) * (10n ** BigInt(asset.decimals));
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
          metadata
        ] = result;
        
        const { id, assetAddress, data } = metadata;
        
        // Calculate utilization rate
        const utilizationRate = totalSupplied > 0 
          ? Number((totalBorrowed * 10000n) / totalSupplied) / 100 
          : 0;
        
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
          utilization_rate: utilizationRate,
          user_supplied: userPosition.collateral || 0n,
          user_borrowed: userPosition.debt || 0n,
          wallet_balance: walletBalance,
          wallet_balance_private: walletBalancePrivate
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