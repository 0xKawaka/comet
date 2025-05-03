import { useContext } from 'react';
import { WalletContext } from '../contexts/WalletContext';
import { AztecAddress } from '@aztec/aztec.js';

/**
 * Hook to access the connected wallet's address
 * @returns The wallet address, selected address, function to set selected address, and loading state
 */
export function useAddress(): { 
  address: AztecAddress | undefined; 
  selectedAddress: AztecAddress | undefined;
  setSelectedAddress: (address: AztecAddress) => void;
  isLoading: boolean 
} {
  const { address, selectedAddress, setSelectedAddress, isLoading } = useContext(WalletContext);
  return { address, selectedAddress, setSelectedAddress, isLoading };
} 