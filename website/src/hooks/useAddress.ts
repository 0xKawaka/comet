import { useContext } from 'react';
import { WalletContext } from '../contexts/WalletContext';
import { AztecAddress } from '@aztec/aztec.js';

/**
 * Hook to access the connected wallet's address
 * @returns The wallet address and loading state
 */
export function useAddress(): { address: AztecAddress | undefined; isLoading: boolean } {
  const { address, isLoading } = useContext(WalletContext);
  return { address, isLoading };
} 