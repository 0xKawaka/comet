import { ReactNode, createContext, useContext, useState } from 'react';
import { AztecAddress, Fr, AuthWitness } from '@aztec/aztec.js';
import { parseUnits } from 'ethers';
import { useWallet } from '../hooks';
import { LendingContract } from '../blockchain/contracts/Lending';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { Asset } from './LendingContext';

interface TransactionContextType {
  isProcessing: boolean;
  depositAsset: (
    lendingContract: LendingContract,
    asset: Asset,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId?: number
  ) => Promise<void>;
  withdrawAsset: (
    lendingContract: LendingContract,
    asset: Asset,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId?: number
  ) => Promise<void>;
  borrowAsset: (
    lendingContract: LendingContract,
    asset: Asset,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId?: number
  ) => Promise<void>;
  repayAsset: (
    lendingContract: LendingContract,
    asset: Asset,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId?: number
  ) => Promise<void>;
}

const defaultContext: TransactionContextType = {
  isProcessing: false,
  depositAsset: async () => {},
  withdrawAsset: async () => {},
  borrowAsset: async () => {},
  repayAsset: async () => {},
};

export const TransactionContext = createContext<TransactionContextType>(defaultContext);

export const useTransaction = () => useContext(TransactionContext);

interface TransactionProviderProps {
  children: ReactNode;
}

export const TransactionProvider = ({ children }: TransactionProviderProps) => {
  const { wallet, address } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  // Helper function to set up token contract authorization
  const setupTokenAuthorization = async (
    tokenContract: TokenContract, 
    lendingContract: LendingContract,
    amount: bigint, 
    nonce: bigint, 
    isPrivate: boolean
  ): Promise<AuthWitness | undefined> => {
    if (!wallet || !address) {
      throw new Error("Wallet not initialized");
    }
    
    if (isPrivate) {
      return await wallet.createAuthWit({
        caller: lendingContract.address,
        action: tokenContract.methods.transfer_to_public(
          address,
          lendingContract.address,
          amount,
          nonce,
        ),
      });
    } else {
      const validateAction = await wallet.setPublicAuthWit(
        {
          caller: lendingContract.address,
          action: tokenContract.methods.transfer_in_public(
            address,
            lendingContract.address,
            amount,
            nonce,
          ),
        },
        true,
      );
      await validateAction.send().wait();
      return undefined;
    }
  };

  const depositAsset = async (
    lendingContract: LendingContract, 
    asset: Asset, 
    amount: string, 
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId = 1
  ) => {
    if (!wallet || !address) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      const nonce = BigInt(Fr.random().toString());
      
      const tokenContract = await TokenContract.at(asset.address, wallet);
      
      if (isPrivate) {
        const transferToPublicAuthwit = await setupTokenAuthorization(
          tokenContract, 
          lendingContract, 
          amountBigInt, 
          nonce, 
          true
        );
        
        if (!transferToPublicAuthwit) {
          throw new Error("Failed to create auth witness");
        }

        // Use privateRecipient if provided, otherwise use user's address
        const recipient = privateRecipient || address;
        
        // The secret is 0n when the privateRecipient is the user's public address
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.deposit_private(
          address,
          amountBigInt,
          nonce,
          secretValue,
          recipient,
          marketId,
          asset.address
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
      } else {
        await setupTokenAuthorization(tokenContract, lendingContract, amountBigInt, nonce, false);

        await lendingContract.methods.deposit_public(
          amountBigInt,
          nonce,
          address,
          marketId,
          asset.address
        ).send().wait();
      }
    } catch (error) {
      console.error(`Error depositing asset:`, error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const withdrawAsset = async (
    lendingContract: LendingContract, 
    asset: Asset, 
    amount: string, 
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId = 1
  ) => {
    if (!wallet || !address) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        // The secret is 0n when the privateRecipient is the user's public address
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.withdraw_private(
          secretValue,
          privateRecipient || address,
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
    } catch (error) {
      console.error(`Error withdrawing asset:`, error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const borrowAsset = async (
    lendingContract: LendingContract, 
    asset: Asset, 
    amount: string, 
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId = 1
  ) => {
    if (!wallet || !address) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        // The secret is 0n when the privateRecipient is the user's public address
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.borrow_private(
          secretValue,
          privateRecipient || address,
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
    } catch (error) {
      console.error(`Error borrowing asset:`, error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  const repayAsset = async (
    lendingContract: LendingContract, 
    asset: Asset, 
    amount: string, 
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId = 1
  ) => {
    if (!wallet || !address) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      const nonce = BigInt(Fr.random().toString());
      
      const tokenContract = await TokenContract.at(asset.address, wallet);
      
      if (isPrivate) {
        const transferToPublicAuthwit = await setupTokenAuthorization(
          tokenContract, 
          lendingContract, 
          amountBigInt, 
          nonce, 
          true
        );
        
        if (!transferToPublicAuthwit) {
          throw new Error("Failed to create auth witness");
        }
        
        // The secret is 0n when the privateRecipient is the user's public address
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.repay_private(
          address,
          amountBigInt,
          nonce,
          secretValue,
          privateRecipient || address,
          marketId,
          asset.address
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
      } else {
        await setupTokenAuthorization(tokenContract, lendingContract, amountBigInt, nonce, false);

        await lendingContract.methods.repay_public(
          amountBigInt,
          nonce,
          address,
          marketId,
          asset.address
        ).send().wait();
      }
    } catch (error) {
      console.error(`Error repaying asset:`, error);
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <TransactionContext.Provider
      value={{
        isProcessing,
        depositAsset,
        withdrawAsset,
        borrowAsset,
        repayAsset
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
}; 