import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';
import { FiLoader, FiDollarSign, FiTrendingUp, FiPercent, FiActivity } from 'react-icons/fi';
import './MarketsView.css';

interface MarketsViewProps {
  onAssetSelect: (assetId: string) => void;
}

const MarketsView = ({ onAssetSelect }: MarketsViewProps) => {
  const { assets, isLoading } = useLending();

  if (isLoading) {
    return (
      <div className="markets-container">
        <h2 className="markets-title">Markets</h2>
        <div className="markets-loading">
          <FiLoader className="markets-loader" />
          <span>Loading market data...</span>
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="markets-container">
        <h2 className="markets-title">Markets</h2>
        <div className="markets-empty">
          No assets available in the protocol.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 className="markets-title">Markets</h2>
      
      <div className="markets-table-container">
        <table className="markets-table">
          <thead>
            <tr>
              <th>Asset</th>
              <th className="right">Price</th>
              <th className="right">Total Supplied</th>
              <th className="right">Total Borrowed</th>
              <th className="right">Utilization Rate</th>
              <th className="right">Supply Rate</th>
              <th className="right">Borrow Rate</th>
              <th className="right">Loan to Value</th>
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
                <tr 
                  key={asset.id} 
                  onClick={() => onAssetSelect(asset.id)}
                  className="market-row"
                >
                  <td>
                    <div className="asset-info">
                      <div className="asset-icon">
                        {asset.ticker.charAt(0)}
                      </div>
                      <div>
                        <div className="asset-name">{asset.name}</div>
                        <div className="asset-ticker">{asset.ticker}</div>
                      </div>
                    </div>
                  </td>
                  <td className="right">
                    <div className="price-display">
                      <FiDollarSign size={14} />
                      {assetPrice}
                    </div>
                  </td>
                  <td className="right">
                    <div>{totalSuppliedFormatted} {asset.ticker}</div>
                    <div className="secondary-text">${totalSuppliedUsd}</div>
                  </td>
                  <td className="right">
                    <div>{totalBorrowedFormatted} {asset.ticker}</div>
                    <div className="secondary-text">${totalBorrowedUsd}</div>
                  </td>
                  <td className="right">
                    <div className="utilization-badge">
                      <div className="utilization-badge-content">
                        {utilizationRate}
                      </div>
                    </div>
                  </td>
                  <td className="right">
                    <div className="supply-rate">
                      <div className="supply-rate-content">
                        {supplyRate}
                      </div>
                    </div>
                  </td>
                  <td className="right">
                    <div className="borrow-rate">
                      <div className="borrow-rate-content">
                        {borrowRate}
                      </div>
                    </div>
                  </td>
                  <td className="right">
                    <div className="ltv-display">
                      <FiPercent size={14} />
                      {loanToValue}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default MarketsView; 