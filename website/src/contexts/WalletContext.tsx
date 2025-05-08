import { ReactNode, createContext, useEffect, useState } from 'react';
import { AztecAddress, AccountWalletWithSecretKey, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';
import { loadPrivateAddresses } from '../utils/privateAddresses';

interface WalletContextType {
  wallet: AccountWalletWithSecretKey | undefined;
  address: AztecAddress | undefined;
  selectedAddress: AztecAddress | undefined;
  availableWallets: AccountWalletWithSecretKey[];
  switchWallet: (walletIndex: number) => void;
  setSelectedAddress: (address: AztecAddress) => void;
  isSecretAdrsSelected: boolean;
  selectedAddressSecret: bigint | undefined;
  isLoading: boolean;
}

const initialWalletContext: WalletContextType = {
  wallet: undefined,
  address: undefined,
  selectedAddress: undefined,
  availableWallets: [],
  switchWallet: () => {},
  setSelectedAddress: () => {},
  isSecretAdrsSelected: false,
  selectedAddressSecret: undefined,
  isLoading: true,
};

export const WalletContext = createContext<WalletContextType>(initialWalletContext);

interface WalletProviderProps {
  children: ReactNode;
  pxeUrl: string;
}

export const WalletProvider = ({ children, pxeUrl }: WalletProviderProps) => {
  const [wallet, setWallet] = useState<AccountWalletWithSecretKey>();
  const [address, setAddress] = useState<AztecAddress>();
  const [selectedAddress, setSelectedAddress] = useState<AztecAddress>();
  const [isSecretAdrsSelected, setIsSecretAdrsSelected] = useState(false);
  const [selectedAddressSecret, setSelectedAddressSecret] = useState<bigint | undefined>(undefined);
  const [availableWallets, setAvailableWallets] = useState<AccountWalletWithSecretKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initializeWallet = async () => {
      try {
        const pxe = createPXEClient(pxeUrl);
        await waitForPXE(pxe);

        const allWallets = await getInitialTestAccountsWallets(pxe);
        setAvailableWallets(allWallets);
        
        // Set the default wallet to the first one in the list
        const defaultWallet = allWallets[0];
        const defaultAddress = defaultWallet.getAddress();

        setWallet(defaultWallet);
        setAddress(defaultAddress);
        setSelectedAddress(defaultAddress); // Initialize selected address as the default public address
        setIsSecretAdrsSelected(false); // Default is not a secret address
        setSelectedAddressSecret(undefined); // No secret for default public address
      } catch (error) {
        console.error('Failed to initialize wallet:', error);
      } finally {
        setIsLoading(false);
      }
    };
    initializeWallet();
  }, [pxeUrl]);

  const switchWallet = (walletIndex: number) => {
    if (walletIndex >= 0 && walletIndex < availableWallets.length) {
      const selectedWallet = availableWallets[walletIndex];
      const newAddress = selectedWallet.getAddress();
      setWallet(selectedWallet);
      setAddress(newAddress);
      setSelectedAddress(newAddress); // Update selected address when wallet changes
      setIsSecretAdrsSelected(false); // Reset to public address when changing wallets
      setSelectedAddressSecret(undefined); // Reset secret when changing wallets
    } else {
      console.error(`Invalid wallet index: ${walletIndex}. Available wallets: ${availableWallets.length}`);
    }
  };

  // Find the secret of a private address
  const findSecretForAddress = (addr: AztecAddress, publicAddr: AztecAddress | undefined): bigint | undefined => {
    if (!publicAddr) return undefined;
    
    // Load all private addresses for the current public address
    const privateAddresses = loadPrivateAddresses(publicAddr);
    
    // Find the matching address entry
    const foundEntry = privateAddresses.find(entry => entry.address.equals(addr));
    return foundEntry?.secret;
  };

  // Modify setSelectedAddress to also update isSecretAdrsSelected and selectedAddressSecret
  const handleSetSelectedAddress = (newAddress: AztecAddress) => {
    setSelectedAddress(newAddress);
    
    // If the new address is not the main wallet address, then it's a secret address
    const isSecret = address ? !newAddress.equals(address) : false;
    setIsSecretAdrsSelected(isSecret);
    
    // If it's a secret address, try to find its secret
    if (isSecret) {
      const secret = findSecretForAddress(newAddress, address);
      setSelectedAddressSecret(secret);
    } else {
      setSelectedAddressSecret(undefined);
    }
  };

  return (
    <WalletContext.Provider value={{ 
      wallet, 
      address, 
      selectedAddress,
      availableWallets, 
      switchWallet, 
      setSelectedAddress: handleSetSelectedAddress,
      isSecretAdrsSelected,
      selectedAddressSecret,
      isLoading 
    }}>
      {children}
    </WalletContext.Provider>
  );
}; 