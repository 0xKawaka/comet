import { useContext } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { TransactionContext } from '../contexts/TransactionContext';
import { usePrivateAddresses } from './usePrivateAddresses';
import { Asset } from '../contexts/LendingContext';
import { LendingContract } from '../blockchain/contracts/Lending';
import { useLending } from './useLending';

const marketId = 1; // This should match the market ID used in LendingContext

type TransactionType = 'deposit' | 'withdraw' | 'borrow' | 'repay';
type TransactionFunction = (
  lendingContract: LendingContract,
  asset: Asset,
  amount: string,
  isPrivate: boolean,
  privateRecipient?: AztecAddress,
  secret?: Fr | bigint,
  marketId?: number,
  fromPublicBalance?: boolean
) => Promise<void>;

/**
 * Hook combining transaction functionality with private address management
 * and integration with the lending context
 */
export function useTransaction() {
  const { 
    isProcessing, 
    depositAsset: contextDeposit, 
    withdrawAsset: contextWithdraw, 
    borrowAsset: contextBorrow, 
    repayAsset: contextRepay 
  } = useContext(TransactionContext);
  
  const { assets, lendingContract, refreshAssetData } = useLending();
  
  const { 
    privateAddresses, 
    addPrivateAddressWithSecret,
    addNewPrivateAddress,
    removePrivateAddress,
    clearAllPrivateAddresses,
    refreshAddresses,
    isLoading: isLoadingPrivateAddresses
  } = usePrivateAddresses();

  // Helper function to validate transaction requirements
  const validateTransaction = (assetId: string): Asset => {
    if (!lendingContract) {
      throw new Error("Lending contract not initialized");
    }
    
    const asset = assets.find(a => a.id === assetId);
    if (!asset) throw new Error("Asset not found");
    
    return asset;
  };

  // Generic transaction handler that manages private addresses and refreshes data
  const executeTransaction = async (
    txType: TransactionType,
    txFunction: TransactionFunction,
    assetId: string,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    fromPublicBalance?: boolean
  ) => {
    try {
      // Validate the transaction
      const asset = validateTransaction(assetId);
      
      if (!lendingContract) {
        throw new Error("Lending contract not initialized");
      }
      
      // Execute the transaction through the context
      await txFunction(
        lendingContract,
        asset,
        amount,
        isPrivate,
        privateRecipient,
        secret,
        marketId,
        fromPublicBalance
      );
      
      // Refresh data after transaction
      await refreshAssetData(assetId);
    } catch (error) {
      console.error(`Error executing ${txType} transaction:`, error);
      throw error;
    }
  };

  // Create high-level API functions that use the generic handler
  const depositAsset = async (
    assetId: string,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    fromPublicBalance?: boolean
  ) => {
    return executeTransaction(
      'deposit',
      contextDeposit,
      assetId,
      amount,
      isPrivate,
      privateRecipient,
      secret,
      fromPublicBalance
    );
  };
  
  const withdrawAsset = async (
    assetId: string,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint
  ) => {
    return executeTransaction(
      'withdraw',
      contextWithdraw,
      assetId,
      amount,
      isPrivate,
      privateRecipient,
      secret
    );
  };
  
  const borrowAsset = async (
    assetId: string,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint
  ) => {
    return executeTransaction(
      'borrow',
      contextBorrow,
      assetId,
      amount,
      isPrivate,
      privateRecipient,
      secret
    );
  };
  
  const repayAsset = async (
    assetId: string,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    fromPublicBalance?: boolean
  ) => {
    return executeTransaction(
      'repay',
      contextRepay,
      assetId,
      amount,
      isPrivate,
      privateRecipient,
      secret,
      fromPublicBalance
    );
  };

  return {
    // Transaction state
    isProcessing,
    
    // Transaction functions
    depositAsset,
    withdrawAsset,
    borrowAsset,
    repayAsset,
    
    // Private address management
    privateAddresses,
    addNewPrivateAddress,
    addPrivateAddressWithSecret,
    removePrivateAddress,
    clearAllPrivateAddresses,
    refreshAddresses,
    isProcessingPrivateAddresses: isLoadingPrivateAddresses
  };
} 