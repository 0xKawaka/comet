import { ReactNode, createContext, useContext, useState } from 'react';
import { AztecAddress, Fr, AuthWitness, createPXEClient } from '@aztec/aztec.js';
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
  const { wallet, address, selectedAddress } = useWallet();
  const [isProcessing, setIsProcessing] = useState(false);

  // Get the effective address to use - selectedAddress if available, otherwise public address
  const getEffectiveAddress = (): AztecAddress | undefined => {
    return selectedAddress || address;
  };

  // Helper function to set up token contract authorization
  const setupTokenAuthorization = async (
    tokenContract: TokenContract, 
    lendingContract: LendingContract,
    amount: bigint, 
    nonce: bigint, 
    isPrivate: boolean,
    fromAddress?: AztecAddress
  ): Promise<AuthWitness | undefined> => {
    const effectiveAddress = getEffectiveAddress();
    if (!wallet || !effectiveAddress) {
      throw new Error("Wallet not initialized");
    }
    
    if (isPrivate) {
      const from = fromAddress || effectiveAddress;
      
      return await wallet.createAuthWit({
        caller: lendingContract.address,
        action: tokenContract.methods.transfer_to_public(
          from,
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
            effectiveAddress,
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
    const effectiveAddress = getEffectiveAddress();
    if (!wallet || !effectiveAddress) {
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

        // Use privateRecipient if provided, otherwise use effective address
        const recipient = privateRecipient || effectiveAddress;
        
        // The secret is 0n when the privateRecipient is the user's public address
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.deposit_private(
          effectiveAddress,
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
          effectiveAddress,
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
    const effectiveAddress = getEffectiveAddress();
    if (!wallet || !effectiveAddress) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        // The secret is the provided value or 0n if not provided
        const secretValue = secret !== undefined ? secret : 0n;
        
        // Use the provided privateRecipient (selected in ActionModal) or fallback to effectiveAddress
        const recipient = privateRecipient || effectiveAddress;
        
        // await lendingContract.methods.withdraw_private(
        //   secretValue,
        //   recipient,
        //   amountBigInt,
        //   marketId,
        //   asset.address
        // ).send().wait();

        const pxe = createPXEClient('http://localhost:8080');

        const txRequest = await lendingContract.methods.withdraw_private(
          secretValue,
          recipient,
          amountBigInt,
          marketId,
          asset.address
        ).create();

        // Simulate the transaction with specific scopes
        const simulationResult = await pxe.simulateTx(
          txRequest,
          true, // simulate public
          undefined, // use default message sender
          false, // don't skip tx validation
          false, // don't skip fee enforcement
          [wallet.getAddress(), recipient, lendingContract.address] // specify ALL necessary scopes
        );
        
        // Get the private execution result from the simulation
        const privateExecutionResult = simulationResult.privateExecutionResult;
        
        // Prove the transaction with the execution result
        const txProvingResult = await pxe.proveTx(txRequest, privateExecutionResult);
        
        // Create a transaction from the proving result
        const tx = txProvingResult.toTx();
        
        // Send the transaction
        const sentTx = await wallet.sendTx(tx);
        console.log("Sent tx:", sentTx);
      } else {
        await lendingContract.methods.withdraw_public(
          effectiveAddress,
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
    const effectiveAddress = getEffectiveAddress();
    if (!wallet || !effectiveAddress) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      
      if (isPrivate) {
        // The secret is the provided value or 0n if not provided
        const secretValue = secret !== undefined ? secret : 0n;
        
        // Use the provided privateRecipient (selected in ActionModal) or fallback to effectiveAddress
        const recipient = privateRecipient || effectiveAddress;
        
        await lendingContract.methods.borrow_private(
          secretValue,
          recipient,
          amountBigInt,
          marketId,
          asset.address
        ).send().wait();
      } else {
        await lendingContract.methods.borrow_public(
          effectiveAddress,
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
    const effectiveAddress = getEffectiveAddress();
    if (!wallet || !effectiveAddress) {
      throw new Error("Wallet not initialized");
    }

    setIsProcessing(true);
    try {
      // Use ethers.js parseUnits to safely handle decimal inputs
      const amountBigInt = parseUnits(amount, asset.decimals);
      const nonce = BigInt(Fr.random().toString());
      
      const tokenContract = await TokenContract.at(asset.address, wallet);
      
      if (isPrivate) {
        const fromAddress = privateRecipient || effectiveAddress;
        
        const transferToPublicAuthwit = await setupTokenAuthorization(
          tokenContract, 
          lendingContract, 
          amountBigInt, 
          nonce, 
          true,
          fromAddress
        );
        
        if (!transferToPublicAuthwit) {
          throw new Error("Failed to create auth witness");
        }
        
        const secretValue = secret !== undefined ? secret : 0n;
        
        await lendingContract.methods.repay_private(
          fromAddress,
          amountBigInt,
          nonce,
          secretValue,
          effectiveAddress,
          marketId,
          asset.address
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
      } else {
        await setupTokenAuthorization(tokenContract, lendingContract, amountBigInt, nonce, false);

        await lendingContract.methods.repay_public(
          amountBigInt,
          nonce,
          effectiveAddress,
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