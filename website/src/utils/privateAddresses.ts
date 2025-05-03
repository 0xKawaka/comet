import { AztecAddress, Fr } from '@aztec/aztec.js';
import { computePrivateAddress } from './privacy';

// Storage key for private addresses
const PRIVATE_ADDRESSES_STORAGE_KEY = 'comet_private_addresses';

export interface PrivateAddressEntry {
  address: AztecAddress;
  secret: bigint;
}

// Helper to get the private address store from localStorage
function getPrivateAddressesStore(): Record<string, any> {
  try {
    const storedData = localStorage.getItem(PRIVATE_ADDRESSES_STORAGE_KEY);
    return storedData ? JSON.parse(storedData) : {};
  } catch (error) {
    console.error('Error reading private addresses from localStorage:', error);
    return {};
  }
}

// Helper to save the private address store to localStorage
function savePrivateAddressesStore(store: Record<string, any>): void {
  try {
    localStorage.setItem(PRIVATE_ADDRESSES_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.error('Error saving private addresses to localStorage:', error);
  }
}

// Load private addresses from local storage for a specific public address
export function loadPrivateAddresses(publicAddress: AztecAddress): PrivateAddressEntry[] {
  const addressData = getPrivateAddressesStore();
  const userAddresses = addressData[publicAddress.toString()] || [];
  
  // Convert stored data back to AztecAddress objects
  return userAddresses.map((item: any) => ({
    address: AztecAddress.fromString(item.address),
    secret: BigInt(item.secret)
  }));
}

// Save private addresses to local storage
export function savePrivateAddresses(publicAddress: AztecAddress, addresses: PrivateAddressEntry[]): void {
  const addressData = getPrivateAddressesStore();
  
  // Convert AztecAddress objects to strings for storage
  const addressesToStore = addresses.map(item => ({
    address: item.address.toString(),
    secret: item.secret.toString()
  }));
  
  // Update with new addresses for this user
  addressData[publicAddress.toString()] = addressesToStore;
  
  // Save back to localStorage
  savePrivateAddressesStore(addressData);
}

// Create a new private address
export function createPrivateAddress(
  secret: Fr | bigint,
  publicAddress: AztecAddress
): AztecAddress {
  return computePrivateAddress(secret, publicAddress);
}

// Add a new private address to storage
export function addPrivateAddress(
  publicAddress: AztecAddress,
  secret: Fr | bigint,
  currentAddresses: PrivateAddressEntry[] = []
): PrivateAddressEntry[] {
  const secretBigInt = secret instanceof Fr ? BigInt(secret.toString()) : secret;
  const privateAddress = createPrivateAddress(secret, publicAddress);
  
  // Check if this address already exists
  if (currentAddresses.some(item => item.address.equals(privateAddress))) {
    return currentAddresses; // Return unchanged if exists
  }
  
  // Add new entry
  const newAddresses = [
    ...currentAddresses,
    { address: privateAddress, secret: secretBigInt }
  ];
  
  savePrivateAddresses(publicAddress, newAddresses);
  return newAddresses;
}

// Generate a new random secret
export function generateRandomSecret(): Fr {
  return Fr.random();
}

// Find a private address entry by address
export function findPrivateAddressEntry(
  addresses: PrivateAddressEntry[],
  searchAddress: AztecAddress
): PrivateAddressEntry | undefined {
  return addresses.find(item => item.address.equals(searchAddress));
} 