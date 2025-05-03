import { useState, useEffect } from 'react';
import { AztecAddress } from '@aztec/aztec.js';
import { useWallet } from '../hooks/useWallet';
import { usePrivateAddresses } from '../hooks/usePrivateAddresses';
import { FiLock, FiUnlock, FiChevronDown } from 'react-icons/fi';
import './AddressSelector.css';

const AddressSelector = () => {
  const { address: publicAddress, selectedAddress, setSelectedAddress } = useWallet();
  const { privateAddresses, refreshAddresses, isLoading: isLoadingPrivate } = usePrivateAddresses();
  const [isOpen, setIsOpen] = useState(false);
  
  // Format an address for display
  const formatAddress = (address: AztecAddress): string => {
    const addressStr = address.toString();
    return `${addressStr.substring(0, 6)}...${addressStr.substring(addressStr.length - 4)}`;
  };
  
  // Ensure we have a valid selectedAddress
  useEffect(() => {
    if (!selectedAddress && publicAddress) {
      setSelectedAddress(publicAddress);
    }
  }, [selectedAddress, publicAddress, setSelectedAddress]);
  
  // Refresh private addresses when component mounts
  useEffect(() => {
    refreshAddresses();
  }, [refreshAddresses]);
  
  if (!selectedAddress || isLoadingPrivate) {
    return null; // Don't render until we have data
  }
  
  const handleAddressSelect = (address: AztecAddress) => {
    setSelectedAddress(address);
    setIsOpen(false);
  };
  
  // Determine if selected address is public or private
  const isPublicSelected = publicAddress?.equals(selectedAddress);
  
  // Find which private address is selected (if any)
  const selectedPrivateAddress = privateAddresses.find(item => 
    item.address.equals(selectedAddress));
  
  return (
    <div className="address-selector">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="selected-address"
      >
        <div className="address-icon">
          {isPublicSelected ? <FiUnlock size={12} /> : <FiLock size={12} />}
        </div>
        <span className="address-text">
          {isPublicSelected 
            ? 'Public Address'
            : `Secret Account ${privateAddresses.indexOf(selectedPrivateAddress!) + 1}`}
        </span>
        <span className="address-value">{formatAddress(selectedAddress)}</span>
        <FiChevronDown size={16} className={`dropdown-icon ${isOpen ? 'open' : ''}`} />
      </button>

      {isOpen && (
        <div className="address-dropdown">
          <div className="address-group">
            <div className="group-label">Public Account</div>
            <button
              onClick={() => handleAddressSelect(publicAddress!)}
              className={`address-option ${isPublicSelected ? 'selected' : ''}`}
            >
              <div className="address-option-icon">
                <FiUnlock size={12} />
              </div>
              <div className="address-option-details">
                <span className="address-option-name">Public Address</span>
                <span className="address-option-value">{formatAddress(publicAddress!)}</span>
              </div>
            </button>
          </div>
          
          {privateAddresses.length > 0 && (
            <div className="address-group">
              <div className="group-label">Secret Accounts</div>
              {privateAddresses.map((entry, index) => (
                <button
                  key={entry.address.toString()}
                  onClick={() => handleAddressSelect(entry.address)}
                  className={`address-option ${selectedAddress.equals(entry.address) ? 'selected' : ''}`}
                >
                  <div className="address-option-icon">
                    <FiLock size={12} />
                  </div>
                  <div className="address-option-details">
                    <span className="address-option-name">Secret Account {index + 1}</span>
                    <span className="address-option-value">{formatAddress(entry.address)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default AddressSelector; 