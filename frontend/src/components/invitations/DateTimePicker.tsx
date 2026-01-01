import React, { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { format, parseISO, isValid, setHours, setMinutes } from 'date-fns';
import { DatePicker } from '../ui/DatePicker';

interface DateTimePickerProps {
  value?: string; // ISO string or date string
  onChange: (date: string) => void;
  label?: string;
  error?: string;
  minDate?: Date;
  disabled?: boolean;
}

export const DateTimePicker: React.FC<DateTimePickerProps> = ({
  value,
  onChange,
  label,
  error,
  minDate,
  disabled = false,
}) => {
  const [dateStr, setDateStr] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('09:00');

  // Sync state with value prop
  useEffect(() => {
    if (value) {
      const date = parseISO(value);
      if (isValid(date)) {
        setDateStr(format(date, 'yyyy-MM-dd'));
        setTimeStr(format(date, 'HH:mm'));
      }
    }
  }, [value]);

  const handleDateChange = (newDateStr: string) => {
    setDateStr(newDateStr);
    combineAndEmit(newDateStr, timeStr);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTimeStr = e.target.value;
    setTimeStr(newTimeStr);
    combineAndEmit(dateStr, newTimeStr);
  };

  const combineAndEmit = (dStr: string, tStr: string) => {
    if (dStr && tStr) {
      const datePart = parseISO(dStr);
      const [hours, minutes] = tStr.split(':').map(Number);
      
      if (isValid(datePart) && !isNaN(hours) && !isNaN(minutes)) {
        const combined = setMinutes(setHours(datePart, hours), minutes);
        onChange(combined.toISOString());
      }
    }
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label className="block text-sm font-medium text-text-secondary">
          {label}
        </label>
      )}
      
      <div className="flex gap-2">
        <div className="flex-1">
          <DatePicker
            value={dateStr}
            onChange={handleDateChange}
            placeholder="Select date"
            minDate={minDate}
            disabled={disabled}
            error={error ? ' ' : undefined} // Don't show error twice, logic below
          />
        </div>
        
        <div className="relative w-32">
          <input
            type="time"
            value={timeStr}
            onChange={handleTimeChange}
            disabled={disabled}
            className={`
              w-full px-3 py-2.5 rounded-xl border bg-surface
              focus:ring-2 focus:ring-primary/50 focus:border-primary
              transition-all
              ${disabled
                ? 'opacity-50 cursor-not-allowed border-border'
                : 'border-border hover:border-primary/50 cursor-pointer'
              }
              ${error ? 'border-error focus:ring-error/50 focus:border-error' : ''}
            `}
          />
          <Clock 
            size={16} 
            className={`
              absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none
              ${disabled ? 'text-text-tertiary' : 'text-text-secondary'}
            `} 
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-error">{error}</p>
      )}
    </div>
  );
};
