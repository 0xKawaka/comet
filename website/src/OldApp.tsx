import './App.css'
import { WalletProvider } from './contexts/WalletContext';
import WalletInfo from './components/WalletInfo';
import { LendingContract } from './blockchain/contracts/Lending';
import devContracts from './blockchain/dev-contracts.json';
import { useEffect, useState } from 'react';
import { useAddress, useWallet } from './hooks';
import { AztecAddress, Fr } from '@aztec/aztec.js';
import collateralAssets from './blockchain/dev-collateral-assets.json';
import borrowableAssets from './blockchain/dev-borrowable-assets.json';
import allAssets from './blockchain/dev-all-assets.json';
import { TokenContract } from '@aztec/noir-contracts.js/Token';
import { PriceFeedContract } from '@aztec/noir-contracts.js/PriceFeed';


interface Asset {
  name: string;
  ticker: string;
  decimals: number;
}

interface AllAssetsType {
  [key: string]: Asset;
}

const typedAllAssets = allAssets as AllAssetsType;
const typedCollateralAssets = collateralAssets as string[];
const typedBorrowableAssets = borrowableAssets as string[];

function App() {
  const [collateralContract, setCollateralContract] = useState<TokenContract | null>(null);
  const [collateralBalance, setCollateralBalance] = useState<bigint>(0n);
  const [collateralBalancePrivate, setCollateralBalancePrivate] = useState<bigint>(0n);
  const [collateralPrice, setCollateralPrice] = useState<bigint>(0n);
  const [lendingContract, setLendingContract] = useState<LendingContract | null>(null);
  const [loanToValueMax, setLoanToValueMax] = useState<bigint>(0n);
  const [collateralAmount, setCollateralAmount] = useState<bigint>(0n);
  const [borrowedAmount, setBorrowedAmount] = useState<bigint>(0n);
  const { wallet, address } = useWallet();
  
  const [depositAmount, setDepositAmount] = useState<string>('');
  const [borrowAmount, setBorrowAmount] = useState<string>('');
  
  const [isDepositing, setIsDepositing] = useState(false);
  const [isBorrowing, setIsBorrowing] = useState(false);
  const [maxBorrowableAmount, setMaxBorrowableAmount] = useState<bigint>(0n);
  const [collateralValue, setCollateralValue] = useState<bigint>(0n);
  const [collateralValuePrivate, setCollateralValuePrivate] = useState<bigint>(0n);
  const [depositedCollateralValue, setDepositedCollateralValue] = useState<bigint>(0n);
  const [depositPrivateLoading, setDepositPrivateLoading] = useState(false);
  const [borrowPrivateLoading, setBorrowPrivateLoading] = useState(false);

  useEffect(() => {
    if (wallet && address) {

    }
  }, [wallet, address]);

  useEffect(() => {
    const fetchLendingContract = async () => {
      if (wallet && address) {
        const lendingContract = await LendingContract.at(AztecAddress.fromString(devContracts.lending), wallet);
        setLendingContract(lendingContract);
        const assetPairInfos = await lendingContract.methods.get_asset(0).simulate();
        setLoanToValueMax(assetPairInfos.loan_to_value);
        const position = await lendingContract.methods.get_position(address).simulate();
        setCollateralAmount(position.collateral);
        setBorrowedAmount(position.debt);

        const tokenContract = await TokenContract.at(AztecAddress.fromString(typedCollateralAssets[0]), wallet);
        setCollateralContract(tokenContract);
        const collateralBalance = await tokenContract.methods.balance_of_public(address).simulate();
        setCollateralBalance(collateralBalance);
        const collateralBalancePrivate = await tokenContract.methods.balance_of_private(address).simulate();
        setCollateralBalancePrivate(collateralBalancePrivate);

        const priceFeedContract = await PriceFeedContract.at(AztecAddress.fromString(devContracts.priceFeed), wallet);
        const collateralPrice = await priceFeedContract.methods.get_price(0).simulate();
        setCollateralPrice(collateralPrice.price);
      }
    };
    fetchLendingContract();
  }, [wallet, address]);

  // Calculate collateral value based on price
  useEffect(() => {
    if (collateralBalance && collateralPrice) {
      const value = (collateralBalance * collateralPrice) / (10n ** BigInt(typedAllAssets[typedCollateralAssets[0]]?.decimals));
      setCollateralValue(value);
    }
    if (collateralBalancePrivate && collateralPrice) {
      const value = (collateralBalancePrivate * collateralPrice) / (10n ** BigInt(typedAllAssets[typedCollateralAssets[0]]?.decimals));
      setCollateralValuePrivate(value);
    }
  }, [collateralBalance, collateralPrice, collateralBalancePrivate]);

  useEffect(() => {
    if (collateralAmount && collateralPrice) {
      const value = (collateralAmount * collateralPrice) / (10n ** BigInt(typedAllAssets[typedCollateralAssets[0]]?.decimals));
      setDepositedCollateralValue(value);
    }
  }, [collateralAmount, collateralPrice]);

  useEffect(() => {
    if (depositedCollateralValue && loanToValueMax) {
      const maxBorrowable = (depositedCollateralValue * loanToValueMax) / 10000n;
      
      const remainingBorrowable = maxBorrowable > borrowedAmount 
        ? maxBorrowable - borrowedAmount 
        : 0n;
      
      setMaxBorrowableAmount(remainingBorrowable);
    }
  }, [depositedCollateralValue, loanToValueMax, borrowedAmount, collateralAmount]);

  const formatTokenAmount = (amount: bigint, decimals: number) => {
    if (amount === 0n) return '0';
    const divisor = 10n ** BigInt(decimals);
    const integerPart = amount / divisor;
    const fractionalPart = amount % divisor;
    
    let fractionalString = fractionalPart.toString();
    while (fractionalString.length < decimals) {
      fractionalString = '0' + fractionalString;
    }
    
    fractionalString = fractionalString.replace(/0+$/, '');
    
    return fractionalString.length > 0 
      ? `${integerPart}.${fractionalString}` 
      : integerPart.toString();
  };

  // Format USD value
  const formatUsdValue = (amount: bigint, decimals: number) => {
    return formatTokenAmount(amount, decimals);
  };

  const parseTokenAmount = (amount: string, decimals: number): bigint => {
    if (!amount || amount === '') return 0n;
    
    const parts = amount.split('.');
    const integerPart = parts[0] || '0';
    let fractionalPart = parts[1] || '';
    
    if (fractionalPart.length > decimals) {
      fractionalPart = fractionalPart.substring(0, decimals);
    } else {
      while (fractionalPart.length < decimals) {
        fractionalPart += '0';
      }
    }
    
    return BigInt(integerPart + fractionalPart);
  };

  const handleSetMaxDeposit = () => {
    if (typedCollateralAssets.length > 0) {
      const asset = typedAllAssets[typedCollateralAssets[0]];
      setDepositAmount(formatTokenAmount(collateralBalance, asset.decimals));
    }
  };

  const handleSetMaxBorrow = () => {
    if (typedBorrowableAssets.length > 0) {
      const asset = typedAllAssets[typedBorrowableAssets[0]];
      setBorrowAmount(formatTokenAmount(maxBorrowableAmount, asset.decimals));
    }
  };

  const handleDeposit = async (isPrivate: boolean = false) => {
    if (!lendingContract || !wallet || !address || !depositAmount || !collateralContract) return;
    
    if (isPrivate) {
      setDepositPrivateLoading(true);
    } else {
      setIsDepositing(true);
    }
    
    try {
      const collateralAssetAddress = typedCollateralAssets[0];
      const assetInfo = typedAllAssets[collateralAssetAddress];
      const amountBigInt = parseTokenAmount(depositAmount, assetInfo.decimals);

      const nonce = Fr.random();
      if (isPrivate) {
        const transferToPublicAuthwit = await wallet.createAuthWit({
          caller: lendingContract.address,
          action: collateralContract.methods.transfer_to_public(
            address,
            lendingContract.address,
            amountBigInt,
            nonce,
          ),
        });
        const txReceipt = await lendingContract.methods.deposit_private(
          address,
          amountBigInt,
          nonce,
          wallet.getSecretKey(),
          address,
          AztecAddress.fromString(collateralAssetAddress)
        ).send({ authWitnesses: [transferToPublicAuthwit] }).wait();
        
        console.log("Private deposit receipt:", txReceipt);
      }
      else { 
        const validateAction = await wallet.setPublicAuthWit(
          {
            caller: lendingContract.address,
            action: collateralContract.methods.transfer_in_public(
              address,
              lendingContract.address,
              amountBigInt,
              nonce,
            ),
          },
          true,
        );
        await validateAction.send().wait();

        const txReceipt = await lendingContract.methods.deposit_public(
          amountBigInt,
          nonce,
          address,
          AztecAddress.fromString(collateralAssetAddress)
        ).send().wait();
        
        console.log("Public deposit receipt:", txReceipt);
      }

      const position = await lendingContract.methods.get_position(address).simulate();
      setCollateralAmount(position.collateral);
      
      if(isPrivate) {
        const updatedBalance = await collateralContract.methods.balance_of_private(address).simulate();
        setCollateralBalancePrivate(updatedBalance);
      }
      else {
        const updatedBalance = await collateralContract.methods.balance_of_public(address).simulate();
        setCollateralBalance(updatedBalance);
      }
      setDepositAmount('');
    } catch (error) {
      console.error(`Error ${isPrivate ? 'privately' : 'publicly'} depositing collateral:`, error);
    } finally {
      if (isPrivate) {
        setDepositPrivateLoading(false);
      } else {
        setIsDepositing(false);
      }
    }
  };

  const handleBorrow = async (isPrivate: boolean = false) => {
    if (!lendingContract || !wallet || !address || !borrowAmount) return;
    
    if (isPrivate) {
      setBorrowPrivateLoading(true);
    } else {
      setIsBorrowing(true);
    }
    
    try {
      const borrowableAssetAddress = typedBorrowableAssets[0];
      const assetInfo = typedAllAssets[borrowableAssetAddress];
      const amountBigInt = parseTokenAmount(borrowAmount, assetInfo.decimals);

      if (isPrivate) {
        const txReceipt = await lendingContract.methods.borrow_private(
          wallet.getSecretKey(),
          address,
          amountBigInt,
        ).send().wait();
        
        console.log("Private borrow receipt:", txReceipt);
      }
      else {
        const txReceipt = await lendingContract.methods.borrow_public(
          address,
          amountBigInt
        ).send().wait();
        
        console.log("Public borrow receipt:", txReceipt);
      }
      
      const position = await lendingContract.methods.get_position(address).simulate();
      setBorrowedAmount(position.debt);
      
      setBorrowAmount('');
    } catch (error) {
      console.error(`Error ${isPrivate ? 'privately' : 'publicly'} borrowing:`, error);
    } finally {
      if (isPrivate) {
        setBorrowPrivateLoading(false);
      } else {
        setIsBorrowing(false);
      }
    }
  };
  
  return (
      <div className="app-container">
        <WalletInfo />
        <div className="app-content">
          <div className="lending-dashboard">
            <div className="section collateral-section">
              <h2>Deposit</h2>
              {typedCollateralAssets.map((assetId: string) => {
                const asset = typedAllAssets[assetId];
                return (
                  <div key={assetId} className="asset-card">
                    <div className="asset-info">
                      <h3>{asset.name} ({asset.ticker})</h3>
                      <p>Decimals: {asset.decimals}</p>
                      <p className="balance-display">
                        Public balance: {formatTokenAmount(collateralBalance, asset.decimals)} {asset.ticker}
                        <span className="value-display"> (${formatUsdValue(collateralValue, asset.decimals)})</span>
                      </p>
                      <p className="balance-display">
                        Private balance: {formatTokenAmount(collateralBalancePrivate, asset.decimals)} {asset.ticker}
                        <span className="value-display"> (${formatUsdValue(collateralValuePrivate, asset.decimals)})</span>
                      </p>
                      <p className="price-display">
                        Price: ${formatUsdValue(collateralPrice, asset.decimals)}
                      </p>
                    </div>
                    <div className="action-container action-container-column">
                      <div className="input-with-max">
                        <input
                          type="text"
                          placeholder="Amount"
                          value={depositAmount}
                          onChange={(e) => setDepositAmount(e.target.value)}
                        />
                        <button 
                          className="max-button"
                          onClick={handleSetMaxDeposit}
                          disabled={collateralBalance === 0n}
                        >
                          MAX
                        </button>
                      </div>
                      <div className="button-row">
                        <button 
                          className="public-button"
                          onClick={() => handleDeposit(false)}
                          disabled={isDepositing || depositPrivateLoading || !depositAmount}
                        >
                          {isDepositing ? 'Depositing...' : 'Deposit Public'}
                        </button>
                        <button 
                          className="private-button"
                          onClick={() => handleDeposit(true)}
                          disabled={isDepositing || depositPrivateLoading || !depositAmount}
                        >
                          {depositPrivateLoading ? 'Depositing...' : 'Deposit Private'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              <div className="total-info">
                <h3>Total Collateral</h3>
                <p>
                  {typedCollateralAssets.length > 0 && 
                    `${formatTokenAmount(collateralAmount, typedAllAssets[typedCollateralAssets[0]]?.decimals)} ${typedAllAssets[typedCollateralAssets[0]]?.ticker}`
                  }
                  <span className="total-value">
                    {` ($${formatUsdValue(depositedCollateralValue, typedAllAssets[typedCollateralAssets[0]]?.decimals)})`}
                  </span>
                </p>
              </div>
              
              <div className="loan-info">
                <h4>Max Loan to Value: {Number(loanToValueMax) / 10000 * 100}%</h4>
              </div>
            </div>
            
            <div className="section borrowable-section">
              <h2>Borrow</h2>
              {typedBorrowableAssets.map((assetId: string) => {
                const asset = typedAllAssets[assetId];
                return (
                  <div key={assetId} className="asset-card">
                    <div className="asset-info">
                      <h3>{asset.name} ({asset.ticker})</h3>
                      <p>Decimals: {asset.decimals}</p>
                      <p className="borrowable-display">
                        Max Borrowable: {formatTokenAmount(maxBorrowableAmount, asset.decimals)} {asset.ticker}
                        <span className="value-borrowable"> (${formatUsdValue(maxBorrowableAmount, asset.decimals)})</span>
                      </p>
                    </div>
                    <div className="action-container action-container-column">
                      <div className="input-with-max">
                        <input
                          type="text"
                          placeholder="Amount"
                          value={borrowAmount}
                          onChange={(e) => setBorrowAmount(e.target.value)}
                        />
                        <button 
                          className="max-button"
                          onClick={handleSetMaxBorrow}
                          disabled={maxBorrowableAmount === 0n}
                        >
                          MAX
                        </button>
                      </div>
                      <div className="button-row">
                        <button 
                          className="public-button"
                          onClick={() => handleBorrow(false)}
                          disabled={isBorrowing || borrowPrivateLoading || !borrowAmount}
                        >
                          {isBorrowing ? 'Borrowing...' : 'Borrow Public'}
                        </button>
                        <button 
                          className="private-button"
                          onClick={() => handleBorrow(true)}
                          disabled={isBorrowing || borrowPrivateLoading || !borrowAmount}
                        >
                          {borrowPrivateLoading ? 'Borrowing...' : 'Borrow Private'}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
              
              <div className="total-info">
                <h3>Total Borrowed</h3>
                <p>
                  {typedBorrowableAssets.length > 0 && 
                    `${formatTokenAmount(borrowedAmount, typedAllAssets[typedBorrowableAssets[0]]?.decimals)} ${typedAllAssets[typedBorrowableAssets[0]]?.ticker}`
                  }
                  <span className="total-value">
                    {` ($${formatUsdValue(borrowedAmount, typedAllAssets[typedBorrowableAssets[0]]?.decimals)})`}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
  )
}

export default App
