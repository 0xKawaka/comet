import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';

interface MarketsViewProps {
  onAssetSelect: (assetId: string) => void;
}

const MarketsView = ({ onAssetSelect }: MarketsViewProps) => {
  const { assets, isLoading } = useLending();

  if (isLoading) {
    return (
      <div className="markets-view">
        <h2>Markets</h2>
        <div className="loading-indicator">Loading market data...</div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="markets-view">
        <h2>Markets</h2>
        <div className="empty-markets">No assets available in the protocol.</div>
      </div>
    );
  }

  return (
    <div className="markets-view">
      <p></p>
      
      <table className="markets-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>Total Supplied</th>
            <th>Total Borrowed</th>
            <th>Utilization Rate</th>
            <th>Supply Rate</th>
            <th>Borrow Rate</th>
            <th>Loan to Value</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => {
            const assetPrice = formatUsdValue(asset.price, asset.decimals);
            
            const totalSuppliedFormatted = formatTokenAmount(asset.total_supplied_with_interest, asset.decimals);
            const totalSuppliedUsd = formatUsdValue(
              tokenToUsd(asset.total_supplied_with_interest, asset.decimals, asset.price),
              asset.decimals
            );
            
            const totalBorrowedFormatted = formatTokenAmount(asset.total_borrowed_with_interest, asset.decimals);
            const totalBorrowedUsd = formatUsdValue(
              tokenToUsd(asset.total_borrowed_with_interest, asset.decimals, asset.price),
              asset.decimals
            );
            
            const utilizationRate = formatPercentage(asset.utilization_rate * 100);
            const supplyRate = formatPercentage(asset.supply_rate * 100);
            const borrowRate = formatPercentage(asset.borrow_rate * 100);
            const loanToValue = (asset.loan_to_value * 100).toFixed(0) + '%';
            
            return (
              <tr key={asset.id} onClick={() => onAssetSelect(asset.id)}>
                <td>
                  <span className="asset-name">{asset.name}</span>
                  <span className="asset-ticker">{asset.ticker}</span>
                </td>
                <td>
                  <span className="price-value">${assetPrice}</span>
                </td>
                <td>
                  <span className="token-amount">{totalSuppliedFormatted} {asset.ticker}</span>
                  <span className="secondary-value">${totalSuppliedUsd}</span>
                </td>
                <td>
                  <span className="token-amount">{totalBorrowedFormatted} {asset.ticker}</span>
                  <span className="secondary-value">${totalBorrowedUsd}</span>
                </td>
                <td><span className="utilization-rate">{utilizationRate}</span></td>
                <td><span className="supply-rate">{supplyRate}</span></td>
                <td><span className="borrow-rate">{borrowRate}</span></td>
                <td><span className="loan-to-value">{loanToValue}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default MarketsView; 