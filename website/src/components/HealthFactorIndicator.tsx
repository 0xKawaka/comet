import { useLending } from '../hooks/useLending';
import { formatHealthFactor, getHealthFactorClass } from '../utils/formatters';
import { FiActivity } from 'react-icons/fi';
import './HealthFactorIndicator.css';

interface HealthFactorIndicatorProps {
  healthFactor?: number; // Optional - will use context if not provided
  size?: 'small' | 'large'; // Size variant
  showLabel?: boolean; // Whether to show the "Health Factor" label
  className?: string; // Additional CSS classes
  standalone?: boolean; // Whether to render as a standalone component or inline
}

const HealthFactorIndicator = ({
  healthFactor: propHealthFactor,
  size = 'small',
  showLabel = true,
  className = '',
  standalone = true
}: HealthFactorIndicatorProps) => {
  const { userPosition, isLoading } = useLending();
  
  // Only hide if loading and no health factor was provided
  if (isLoading && propHealthFactor === undefined) {
    return null;
  }
  
  // If health factor is provided as prop, use it; otherwise use from context
  let healthFactorValue = propHealthFactor !== undefined 
    ? propHealthFactor 
    : userPosition.total_borrowed_value === 0n 
      ? Infinity 
      : userPosition.health_factor;
  
  // Get the appropriate class based on health factor
  const healthClassName = getHealthFactorClass(healthFactorValue);
  
  // Combine base class and size variant with custom class
  const containerClassName = `
    health-factor-indicator 
    ${healthClassName} 
    health-factor-${size}
    ${standalone ? '' : 'health-factor-inline'}
    ${className}
  `.trim();
  
  return (
    <div className={containerClassName}>
      <FiActivity className="health-factor-icon" />
      <div className="health-factor-content">
        {showLabel && (
          <span className="health-factor-label">
            Health Factor
          </span>
        )}
        <span className="health-factor-value">
          {formatHealthFactor(healthFactorValue)}
        </span>
      </div>
    </div>
  );
};

export default HealthFactorIndicator; 