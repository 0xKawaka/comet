import { useLending } from '../contexts/LendingContext';
import { formatTokenAmount, formatUsdValue, formatPercentage } from '../utils/formatters';
import { tokenToUsd } from '../utils/precisionConstants';
import { FiLoader, FiCpu, FiDollarSign, FiTrendingUp, FiPercent, FiActivity } from 'react-icons/fi';

interface MarketsViewProps {
  onAssetSelect: (assetId: string) => void;
}

const MarketsView = ({ onAssetSelect }: MarketsViewProps) => {
  const { assets, isLoading } = useLending();

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <h2 style={{ 
          fontSize: '1.75rem', 
          marginBottom: '1rem',
          fontWeight: '700',
          color: 'white' 
        }}>Markets</h2>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          gap: '0.75rem', 
          color: '#9fa1b2' 
        }}>
          <FiLoader style={{ animation: 'spin 1s linear infinite' }} />
          <span>Loading market data...</span>
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '2rem 0' }}>
        <h2 style={{ 
          fontSize: '1.75rem', 
          marginBottom: '1rem',
          fontWeight: '700',
          color: 'white' 
        }}>Markets</h2>
        <div style={{
          padding: '2rem',
          borderRadius: '0.5rem',
          backgroundColor: 'rgba(34, 37, 58, 0.5)',
          color: '#9fa1b2'
        }}>
          No assets available in the protocol.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h2 style={{ 
        fontSize: '1.75rem', 
        marginBottom: '1.5rem',
        fontWeight: '700',
        color: 'white' 
      }}>Markets</h2>
      
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'separate',
          borderSpacing: '0',
          color: 'white'
        }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Asset</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Price</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Total Supplied</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Total Borrowed</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Utilization Rate</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Supply Rate</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Borrow Rate</th>
              <th style={{
                textAlign: 'right',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                fontWeight: '600',
                color: '#9fa1b2',
                fontSize: '0.875rem'
              }}>Loan to Value</th>
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
                  style={{ 
                    cursor: 'pointer',
                    transition: 'background-color 0.2s ease'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'rgba(117, 49, 253, 0.1)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ 
                        backgroundColor: '#363952', 
                        width: '2.5rem', 
                        height: '2.5rem', 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        borderRadius: '50%',
                        color: 'white'
                      }}>
                        {asset.ticker.charAt(0)}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '1rem' }}>{asset.name}</div>
                        <div style={{ color: '#9fa1b2', fontSize: '0.875rem', marginTop: '0.25rem' }}>{asset.ticker}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontSize: '0.875rem',
                    fontWeight: '600',
                    color: '#d9fbff'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                      <FiDollarSign size={14} />
                      {assetPrice}
                    </div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right'
                  }}>
                    <div style={{ fontWeight: '500' }}>{totalSuppliedFormatted} {asset.ticker}</div>
                    <div style={{ color: '#9fa1b2', fontSize: '0.75rem', marginTop: '0.25rem' }}>${totalSuppliedUsd}</div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right'
                  }}>
                    <div style={{ fontWeight: '500' }}>{totalBorrowedFormatted} {asset.ticker}</div>
                    <div style={{ color: '#9fa1b2', fontSize: '0.75rem', marginTop: '0.25rem' }}>${totalBorrowedUsd}</div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right'
                  }}>
                    <div style={{ 
                      display: 'inline-block',
                      fontWeight: '600',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.375rem',
                      backgroundColor: 'rgba(117, 49, 253, 0.15)',
                      color: '#8a8dff'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <FiActivity size={14} />
                        {utilizationRate}
                      </div>
                    </div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right',
                    color: '#10b981',
                    fontWeight: '600',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                      <FiTrendingUp size={14} />
                      {supplyRate}
                    </div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right',
                    color: '#ef4444',
                    fontWeight: '600',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
                      <FiTrendingUp size={14} />
                      {borrowRate}
                    </div>
                  </td>
                  <td style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid rgba(54, 57, 82, 0.5)',
                    textAlign: 'right',
                    fontWeight: '600',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.25rem' }}>
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