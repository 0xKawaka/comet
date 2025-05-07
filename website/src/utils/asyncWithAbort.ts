import { AztecAddress } from '@aztec/aztec.js';
import { UseAbortControllerResult } from '../hooks/useAbortController';

export async function asyncWithAbort<T>(
  operation: () => Promise<T>,
  abortController: UseAbortControllerResult,
  address: AztecAddress
): Promise<T | null> {
  // Check if already aborted
  if (abortController.isAborted()) {
    throw new DOMException("Operation aborted", "AbortError");
  }

  // Check if address changed
  if (abortController.isAddressChanged(address)) {
    console.log("Address changed, aborting operation");
    return null;
  }

  try {
    const result = await operation();
    
    // Check again after operation completes
    if (abortController.isAborted()) {
      throw new DOMException("Operation aborted", "AbortError");
    }
    
    if (abortController.isAddressChanged(address)) {
      console.log("Address changed during operation, discarding result");
      return null;
    }
    
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.log("Operation aborted:", error.message);
      throw error;
    }
    throw error;
  }
} 