import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatUtilizationRate } from '../utils/formatters';

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
      <h2>Markets</h2>
      <p>Click on an asset to view details and perform actions.</p>
      
      <table className="markets-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Price</th>
            <th>Total Supplied</th>
            <th>Total Borrowed</th>
            <th>Utilization Rate</th>
            <th>Loan to Value</th>
          </tr>
        </thead>
        <tbody>
          {assets.map(asset => {
            const assetPrice = formatUsdValue(asset.price, asset.decimals);
            
            const totalSuppliedFormatted = formatTokenAmount(asset.total_supplied, asset.decimals);
            const totalSuppliedUsd = formatUsdValue(
              (asset.total_supplied * asset.price) / (10n ** BigInt(asset.decimals)),
              asset.decimals
            );
            
            const totalBorrowedFormatted = formatTokenAmount(asset.total_borrowed, asset.decimals);
            const totalBorrowedUsd = formatUsdValue(
              (asset.total_borrowed * asset.price) / (10n ** BigInt(asset.decimals)),
              asset.decimals
            );
            
            const utilizationRate = formatUtilizationRate(asset.total_borrowed, asset.total_supplied);
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