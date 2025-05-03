import { useContext } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { TransactionContext } from '../contexts/TransactionContext';
import { usePrivateAddresses } from './usePrivateAddresses';
import { Asset } from '../contexts/LendingContext';
import { LendingContract } from '../blockchain/contracts/Lending';

type TransactionType = 'deposit' | 'withdraw' | 'borrow' | 'repay';
type TransactionFunction = (
  lendingContract: LendingContract,
  asset: Asset,
  amount: string,
  isPrivate: boolean,
  privateRecipient?: AztecAddress,
  secret?: Fr | bigint,
  marketId?: number
) => Promise<void>;

/**
 * Hook combining transaction functionality with private address management
 * This avoids circular dependencies between contexts
 */
export function useTransaction() {
  const { 
    isProcessing, 
    depositAsset: contextDeposit, 
    withdrawAsset: contextWithdraw, 
    borrowAsset: contextBorrow, 
    repayAsset: contextRepay 
  } = useContext(TransactionContext);
  
  const { 
    privateAddresses, 
    addPrivateAddressWithSecret,
    addNewPrivateAddress,
    removePrivateAddress,
    clearAllPrivateAddresses,
    refreshAddresses,
    isLoading
  } = usePrivateAddresses();

  // Generic transaction handler that manages private addresses
  const executeTransaction = async (
    txType: TransactionType,
    lendingContract: LendingContract,
    asset: Asset,
    amount: string,
    isPrivate: boolean,
    privateRecipient?: AztecAddress,
    secret?: Fr | bigint,
    marketId?: number
  ) => {
    // If using a private address with a secret, make sure it's added to storage
    if (isPrivate && privateRecipient && secret) {
      // Add to storage first to ensure it's saved even if transaction fails
      await addPrivateAddressWithSecret(secret);
      // Refresh addresses to update the UI
      refreshAddresses();
    }
    
    // Get the appropriate transaction function
    const txFunction = {
      deposit: contextDeposit,
      withdraw: contextWithdraw,
      borrow: contextBorrow,
      repay: contextRepay
    }[txType];
    
    // Execute the transaction
    return txFunction(
      lendingContract,
      asset,
      amount,
      isPrivate,
      privateRecipient,
      secret,
      marketId
    );
  };

  // Create specialized functions that use the generic handler
  const depositAsset: TransactionFunction = (lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId) => 
    executeTransaction('deposit', lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId);
  
  const withdrawAsset: TransactionFunction = (lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId) => 
    executeTransaction('withdraw', lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId);
  
  const borrowAsset: TransactionFunction = (lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId) => 
    executeTransaction('borrow', lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId);
  
  const repayAsset: TransactionFunction = (lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId) => 
    executeTransaction('repay', lendingContract, asset, amount, isPrivate, privateRecipient, secret, marketId);

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
    isLoadingPrivateAddresses: isLoading
  };
} 