import { useLending } from '../contexts/LendingContext';
import { formatHealthFactor, getHealthFactorClass } from '../utils/formatters';

const HealthFactorIndicator = () => {
  const { userPosition, isLoading } = useLending();
  
  // Don't show anything if loading or no borrowed value
  if (isLoading || userPosition.total_borrowed_value === 0n) {
    return null;
  }
  
  const healthFactor = userPosition.health_factor;
  const healthClass = getHealthFactorClass(healthFactor);
  
  return (
    <div className="header-health-factor">
      <span className="health-factor-label">Health Factor:</span>
      <span className={`health-factor-value ${healthClass}`}>
        {formatHealthFactor(healthFactor)}
      </span>
    </div>
  );
};

export default HealthFactorIndicator; 