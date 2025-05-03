import { useContext } from 'react';
import { LendingContext } from '../contexts/LendingContext';

/**
 * Hook to access the lending context
 * @returns Lending data and functions
 */
export function useLending() {
  return useContext(LendingContext);
} 