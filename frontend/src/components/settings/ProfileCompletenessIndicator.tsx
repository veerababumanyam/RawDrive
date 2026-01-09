/**
 * Profile Completeness Indicator
 *
 * Displays a visual indicator of profile completeness with progress bar
 * and missing fields summary.
 */

import { useState, useEffect } from 'react';
import { CheckCircle, AlertCircle, Info, ChevronDown, ChevronUp } from 'lucide-react';

interface ProfileCompletenessIndicatorProps {
  profileData: Record<string, unknown>;
  className?: string;
}

interface FieldCheck {
  field: string;
  label: string;
  present: boolean;
  weight: number;
}

// Fields that matter for a complete profile
const PROFILE_FIELDS = [
  { field: 'display_name', label: 'Display Name', weight: 15 },
  { field: 'profile_title', label: 'Professional Title', weight: 10 },
  { field: 'bio', label: 'Bio', weight: 15 },
  { field: 'avatar_url', label: 'Profile Photo', weight: 10 },
  { field: 'email', label: 'Contact Email', weight: 10 },
  { field: 'phone', label: 'Phone Number', weight: 5 },
  { field: 'location', label: 'Location', weight: 5 },
  { field: 'website', label: 'Website', weight: 5 },
  { field: 'socials', label: 'Social Media Links', weight: 5 },
  { field: 'categories', label: 'Photography Categories', weight: 10 },
  { field: 'service_areas', label: 'Service Areas', weight: 5 },
  { field: 'booking_calendar_url', label: 'Booking Link', weight: 5 },
];

function checkFieldPresent(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
}

export function ProfileCompletenessIndicator({
  profileData,
  className = '',
}: ProfileCompletenessIndicatorProps) {
  const [showDetails, setShowDetails] = useState(false);
  const [fieldChecks, setFieldChecks] = useState<FieldCheck[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    // Calculate completeness
    const checks: FieldCheck[] = PROFILE_FIELDS.map((f) => ({
      ...f,
      present: checkFieldPresent(profileData[f.field]),
    }));

    const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
    const achievedWeight = checks
      .filter((c) => c.present)
      .reduce((sum, c) => sum + c.weight, 0);

    const calculatedScore = Math.round((achievedWeight / totalWeight) * 100);

    setFieldChecks(checks);
    setScore(calculatedScore);
  }, [profileData]);

  const missingFields = fieldChecks.filter((f) => !f.present);
  const presentFields = fieldChecks.filter((f) => f.present);

  // Determine color based on score
  const getScoreColor = () => {
    if (score >= 80) return 'text-green-600 dark:text-green-400';
    if (score >= 50) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };

  const getProgressColor = () => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getStatusIcon = () => {
    if (score >= 80) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (score >= 50) return <Info className="w-5 h-5 text-yellow-500" />;
    return <AlertCircle className="w-5 h-5 text-red-500" />;
  };

  const getStatusMessage = () => {
    if (score >= 80) return 'Great! Your profile is looking good.';
    if (score >= 50) return 'Good start! Add more details to improve visibility.';
    return 'Your profile needs more information.';
  };

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <span className="font-medium text-gray-900 dark:text-white">
              Profile Completeness
            </span>
          </div>
          <span className={`text-2xl font-bold ${getScoreColor()}`}>{score}%</span>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
          <div
            className={`h-full transition-all duration-500 ${getProgressColor()}`}
            style={{ width: `${score}%` }}
          />
        </div>

        <p className="text-sm text-gray-600 dark:text-gray-400">{getStatusMessage()}</p>
      </div>

      {/* Toggle details */}
      <button
        onClick={() => setShowDetails(!showDetails)}
        className="w-full flex items-center justify-center gap-2 py-2 border-t border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
      >
        {showDetails ? (
          <>
            <ChevronUp className="w-4 h-4" />
            Hide details
          </>
        ) : (
          <>
            <ChevronDown className="w-4 h-4" />
            View details ({missingFields.length} fields missing)
          </>
        )}
      </button>

      {/* Details */}
      {showDetails && (
        <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-4">
          {/* Missing fields */}
          {missingFields.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Missing ({missingFields.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {missingFields.map((f) => (
                  <span
                    key={f.field}
                    className="px-2 py-1 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Present fields */}
          {presentFields.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase mb-2">
                Completed ({presentFields.length})
              </h4>
              <div className="flex flex-wrap gap-2">
                {presentFields.map((f) => (
                  <span
                    key={f.field}
                    className="px-2 py-1 bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 text-xs rounded-lg"
                  >
                    {f.label}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default ProfileCompletenessIndicator;
