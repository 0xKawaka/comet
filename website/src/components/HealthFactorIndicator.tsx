import { useLending } from '../contexts/LendingContext';
import { formatHealthFactor, getHealthFactorClass } from '../utils/formatters';
import { FiActivity } from 'react-icons/fi';

const HealthFactorIndicator = () => {
  const { userPosition, isLoading } = useLending();
  
  // Don't show anything if loading or no borrowed value
  if (isLoading || userPosition.total_borrowed_value === 0n) {
    return null;
  }
  
  const healthFactor = userPosition.health_factor;
  
  // Define colors based on health factor
  const getHealthFactorStyle = (factor: bigint) => {
    if (factor >= 200n) { // Safe
      return {
        backgroundColor: 'rgba(16, 185, 129, 0.15)',
        borderColor: 'rgba(16, 185, 129, 0.5)',
        color: '#10b981'
      };
    } else if (factor >= 120n) { // Warning
      return {
        backgroundColor: 'rgba(245, 158, 11, 0.15)',
        borderColor: 'rgba(245, 158, 11, 0.5)',
        color: '#f59e0b'
      };
    } else { // Danger
      return {
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        borderColor: 'rgba(239, 68, 68, 0.5)', 
        color: '#ef4444'
      };
    }
  };
  
  const healthStyle = getHealthFactorStyle(healthFactor);
  
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      padding: '0.375rem 0.75rem',
      borderRadius: '0.5rem',
      border: `1px solid ${healthStyle.borderColor}`,
      backgroundColor: healthStyle.backgroundColor,
      gap: '0.5rem'
    }}>
      <FiActivity style={{ color: healthStyle.color }} />
      <div>
        <span style={{
          fontSize: '0.75rem',
          opacity: 0.7,
          display: 'block'
        }}>
          Health Factor
        </span>
        <span style={{
          fontSize: '0.875rem',
          fontWeight: 600,
          color: healthStyle.color
        }}>
          {formatHealthFactor(healthFactor)}
        </span>
      </div>
    </div>
  );
};

export default HealthFactorIndicator; 