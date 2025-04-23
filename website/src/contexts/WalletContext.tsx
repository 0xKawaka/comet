import { ReactNode, createContext, useEffect, useState } from 'react';
import { AztecAddress, AccountWalletWithSecretKey, createPXEClient, waitForPXE } from '@aztec/aztec.js';
import { getInitialTestAccountsWallets } from '@aztec/accounts/testing';

interface WalletContextType {
  wallet: AccountWalletWithSecretKey | undefined;
  address: AztecAddress | undefined;
  availableWallets: AccountWalletWithSecretKey[];
  switchWallet: (walletIndex: number) => void;
  isLoading: boolean;
}

const initialWalletContext: WalletContextType = {
  wallet: undefined,
  address: undefined,
  availableWallets: [],
  switchWallet: () => {},
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
      setWallet(selectedWallet);
      setAddress(selectedWallet.getAddress());
    } else {
      console.error(`Invalid wallet index: ${walletIndex}. Available wallets: ${availableWallets.length}`);
    }
  };

  return (
    <WalletContext.Provider value={{ wallet, address, availableWallets, switchWallet, isLoading }}>
      {children}
    </WalletContext.Provider>
  );
}; 