import { useContext } from 'react';
import { LendingContext, Asset, UserPosition } from '../contexts/LendingContext';

/**
 * Hook to access the lending context
 * @returns Lending data and functions
 */
export function useLending() {
  return useContext(LendingContext);
}

// Re-export types from LendingContext for better developer experience
export type { Asset, UserPosition }; 