import { useState, useEffect, useCallback } from 'react';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import { 
  PrivateAddressEntry, 
  loadPrivateAddresses as loadAddresses, 
  addPrivateAddress, 
  savePrivateAddresses,
  generateRandomSecret,
  createPrivateAddress 
} from '../utils/privateAddresses';
import { useWallet } from './useWallet';

interface UsePrivateAddressesReturn {
  privateAddresses: PrivateAddressEntry[];
  addNewPrivateAddress: () => Promise<PrivateAddressEntry | null>;
  addPrivateAddressWithSecret: (secret: Fr | bigint) => Promise<PrivateAddressEntry | null>;
  removePrivateAddress: (addressToRemove: AztecAddress) => void;
  clearAllPrivateAddresses: () => void;
  refreshAddresses: () => void;
  isLoading: boolean;
}

export function usePrivateAddresses(): UsePrivateAddressesReturn {
  const { address } = useWallet();
  const [privateAddresses, setPrivateAddresses] = useState<PrivateAddressEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Create a reusable function to load addresses
  const refreshAddresses = useCallback(() => {
    if (!address) {
      setPrivateAddresses([]);
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    const addresses = loadAddresses(address);
    setPrivateAddresses(addresses);
    setIsLoading(false);
  }, [address]);

  // Load private addresses when wallet changes
  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);

  // Generic function to update addresses
  const updateAddresses = useCallback((newAddresses: PrivateAddressEntry[]) => {
    if (!address) return;
    setPrivateAddresses(newAddresses);
    savePrivateAddresses(address, newAddresses);
  }, [address]);

  // Add a new private address with a randomly generated secret
  const addNewPrivateAddress = async (): Promise<PrivateAddressEntry | null> => {
    if (!address) return null;
    const newSecret = generateRandomSecret();
    return addPrivateAddressWithSecret(newSecret);
  };

  // Add a private address with a specific secret
  const addPrivateAddressWithSecret = async (secret: Fr | bigint): Promise<PrivateAddressEntry | null> => {
    if (!address) return null;
    
    const secretBigInt = secret instanceof Fr ? BigInt(secret.toString()) : secret;
    const privateAddress = createPrivateAddress(secret, address);
    
    // Check if this address already exists
    const existingEntry = privateAddresses.find(item => item.address.equals(privateAddress));
    if (existingEntry) return existingEntry;
    
    // Create new entry and update state
    const newEntry: PrivateAddressEntry = { address: privateAddress, secret: secretBigInt };
    const newAddresses = [...privateAddresses, newEntry];
    updateAddresses(newAddresses);
    
    return newEntry;
  };

  // Remove a private address
  const removePrivateAddress = (addressToRemove: AztecAddress): void => {
    if (!address) return;
    const updatedAddresses = privateAddresses.filter(
      item => !item.address.equals(addressToRemove)
    );
    updateAddresses(updatedAddresses);
  };

  // Clear all private addresses
  const clearAllPrivateAddresses = (): void => {
    if (!address) return;
    updateAddresses([]);
  };

  return {
    privateAddresses,
    addNewPrivateAddress,
    addPrivateAddressWithSecret,
    removePrivateAddress,
    clearAllPrivateAddresses,
    refreshAddresses,
    isLoading
  };
} 