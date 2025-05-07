import { useRef, useCallback } from 'react';
import { AztecAddress } from '@aztec/aztec.js';

export interface UseAbortControllerResult {
  getAbortController: () => AbortController;
  abortCurrent: () => void;
  isAborted: () => boolean;
  isAddressChanged: (address: AztecAddress) => boolean;
  updateAddress: (address: AztecAddress) => void;
}

export const useAbortController = (): UseAbortControllerResult => {
  const abortControllerRef = useRef<AbortController | null>(null);
  const currentAddressRef = useRef<AztecAddress | undefined>(undefined);

  const getAbortController = useCallback(() => {
    // Abort any existing controller
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // Create new controller
    const controller = new AbortController();
    abortControllerRef.current = controller;
    return controller;
  }, []);

  const abortCurrent = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const isAborted = useCallback(() => {
    return abortControllerRef.current?.signal.aborted ?? false;
  }, []);

  const isAddressChanged = useCallback((address: AztecAddress) => {
    return !currentAddressRef.current || !address.equals(currentAddressRef.current);
  }, []);

  const updateAddress = useCallback((address: AztecAddress) => {
    currentAddressRef.current = address;
  }, []);

  return {
    getAbortController,
    abortCurrent,
    isAborted,
    isAddressChanged,
    updateAddress
  };
}; 