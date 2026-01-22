import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  format,
  parse,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
  isToday,
} from 'date-fns';

/* =============================================================================
   DatePicker Component

   A calendar-based date picker with keyboard navigation and accessibility.
   ============================================================================= */

interface DatePickerProps {
  /** The selected date value in YYYY-MM-DD format */
  value?: string;
  /** Callback when date changes */
  onChange: (date: string) => void;
  /** Input name attribute */
  name?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Label for the input */
  label?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Minimum selectable date */
  minDate?: Date;
  /** Maximum selectable date */
  maxDate?: Date;
  /** Additional class names for the container */
  className?: string;
  /** Error message to display */
  error?: string;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  name,
  placeholder = 'Select date',
  label,
  disabled = false,
  minDate,
  maxDate,
  className = '',
  error,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'days' | 'months' | 'years'>('days');
  const [viewDate, setViewDate] = useState<Date>(() => {
    if (value) {
      const parsed = parse(value, 'yyyy-MM-dd', new Date());
      if (isValid(parsed)) return parsed;
    }
    return new Date();
  });

  const [yearRangeStart, setYearRangeStart] = useState<number>(() => {
    const currentYear = viewDate.getFullYear();
    return Math.floor(currentYear / 12) * 12;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  // Parse the value string to Date object
  const selectedDate = value ? parse(value, 'yyyy-MM-dd', new Date()) : null;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsOpen(false);
      inputRef.current?.focus();
    } else if (e.key === 'Enter' && !isOpen) {
      e.preventDefault();
      setIsOpen(true);
    }
  }, [isOpen]);

  // Generate calendar days
  const generateCalendarDays = () => {
    const monthStart = startOfMonth(viewDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const days: Date[] = [];
    let day = startDate;

    while (day <= endDate) {
      days.push(day);
      day = addDays(day, 1);
    }

    return days;
  };

  // Check if a date is selectable
  const isDateDisabled = (date: Date): boolean => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  // Handle date selection
  const handleDateSelect = (date: Date) => {
    if (isDateDisabled(date)) return;
    onChange(format(date, 'yyyy-MM-dd'));
    setIsOpen(false);
    inputRef.current?.focus();
  };

  // Navigate months/years
  const goToPrevious = () => {
    if (viewMode === 'days') {
      setViewDate(subMonths(viewDate, 1));
    } else if (viewMode === 'months') {
      setViewDate(parse(`${viewDate.getFullYear() - 1}`, 'yyyy', new Date()));
    } else {
      setYearRangeStart(yearRangeStart - 12);
    }
  };

  const goToNext = () => {
    if (viewMode === 'days') {
      setViewDate(addMonths(viewDate, 1));
    } else if (viewMode === 'months') {
      setViewDate(parse(`${viewDate.getFullYear() + 1}`, 'yyyy', new Date()));
    } else {
      setYearRangeStart(yearRangeStart + 12);
    }
  };

  // Format display value
  const displayValue = selectedDate && isValid(selectedDate)
    ? format(selectedDate, 'dd/MM/yyyy')
    : '';

  const days = generateCalendarDays();

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-text-secondary mb-1.5">
          {label}
        </label>
      )}

      {/* Input with calendar button */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          name={name}
          value={displayValue}
          placeholder={placeholder}
          readOnly
          disabled={disabled}
          onClick={() => !disabled && setIsOpen(!isOpen)}
          onKeyDown={handleKeyDown}
          aria-label={label || placeholder}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          className={`
            w-full px-4 py-2.5 pr-10 rounded-xl border bg-surface
            transition-all cursor-pointer
            ${disabled
              ? 'opacity-50 cursor-not-allowed border-border'
              : 'border-border hover:border-primary/50 focus:ring-2 focus:ring-primary/50 focus:border-primary'
            }
            ${error ? 'border-error focus:ring-error/50 focus:border-error' : ''}
          `}
        />
        <button
          type="button"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          tabIndex={-1}
          aria-label="Open calendar"
          className={`
            absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-lg
            transition-colors
            ${disabled
              ? 'text-text-tertiary cursor-not-allowed'
              : 'text-text-secondary hover:text-primary hover:bg-primary/10'
            }
          `}
        >
          <CalendarIcon size={18} />
        </button>
      </div>

      {error && (
        <p className="mt-1 text-sm text-error">{error}</p>
      )}

      {/* Calendar Dropdown */}
      {isOpen && !disabled && (
        <div
          ref={calendarRef}
          role="dialog"
          aria-modal="true"
          aria-label="Choose date"
          className="absolute z-50 mt-2 p-4 bg-surface rounded-xl border border-border shadow-lg"
          style={{ width: '280px' }}
        >
          {/* Calendar Header */}
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={goToPrevious}
              aria-label="Previous"
              className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="flex items-center gap-1 font-semibold text-text-primary">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'months' ? 'days' : 'months')}
                className="hover:text-primary transition-colors px-1 rounded hover:bg-primary/10"
              >
                {MONTHS[viewDate.getMonth()]}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (viewMode !== 'years') {
                    setYearRangeStart(Math.floor(viewDate.getFullYear() / 12) * 12);
                    setViewMode('years');
                  } else {
                    setViewMode('days');
                  }
                }}
                className="hover:text-primary transition-colors px-1 rounded hover:bg-primary/10"
              >
                {viewMode === 'years'
                  ? `${yearRangeStart} - ${yearRangeStart + 11}`
                  : viewDate.getFullYear()
                }
              </button>
            </div>
            <button
              type="button"
              onClick={goToNext}
              aria-label="Next"
              className="p-2 rounded-lg hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="relative overflow-hidden min-h-[240px]">
            <AnimatePresence mode="wait">
              {viewMode === 'days' && (
                <motion.div
                  key="days"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Weekday Headers */}
                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {WEEKDAYS.map((day) => (
                      <div
                        key={day}
                        className="text-center text-xs font-medium text-text-tertiary py-1"
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  {/* Calendar Days */}
                  <div className="grid grid-cols-7 gap-1">
                    {days.map((day, index) => {
                      const isCurrentMonth = isSameMonth(day, viewDate);
                      const isSelected = selectedDate && isSameDay(day, selectedDate);
                      const isTodayDate = isToday(day);
                      const isDisabled = isDateDisabled(day);

                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => handleDateSelect(day)}
                          disabled={isDisabled}
                          aria-label={format(day, 'EEEE, MMMM d, yyyy')}
                          aria-selected={isSelected || undefined}
                          className={`
                            w-8 h-8 rounded-lg text-sm font-medium transition-all
                            ${!isCurrentMonth ? 'text-text-tertiary/50' : ''}
                            ${isDisabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}
                            ${isSelected
                              ? 'bg-primary text-white'
                              : isTodayDate
                                ? 'bg-primary/10 text-primary border border-primary/30'
                                : isCurrentMonth
                                  ? 'text-text-primary hover:bg-surface-hover'
                                  : 'hover:bg-surface-hover'
                            }
                          `}
                        >
                          {format(day, 'd')}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {viewMode === 'months' && (
                <motion.div
                  key="months"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-3 gap-2"
                >
                  {MONTHS.map((month, index) => {
                    const isSelected = viewDate.getMonth() === index;
                    return (
                      <button
                        key={month}
                        type="button"
                        onClick={() => {
                          const newDate = new Date(viewDate);
                          newDate.setMonth(index);
                          setViewDate(newDate);
                          setViewMode('days');
                        }}
                        className={`
                          py-4 rounded-xl text-sm font-medium transition-all
                          ${isSelected
                            ? 'bg-primary text-white shadow-md'
                            : 'text-text-primary hover:bg-surface-hover hover:scale-105'
                          }
                        `}
                      >
                        {month.slice(0, 3)}
                      </button>
                    );
                  })}
                </motion.div>
              )}

              {viewMode === 'years' && (
                <motion.div
                  key="years"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  transition={{ duration: 0.2 }}
                  className="grid grid-cols-3 gap-2"
                >
                  {Array.from({ length: 12 }, (_, i) => yearRangeStart + i).map((year) => {
                    const isSelected = viewDate.getFullYear() === year;
                    return (
                      <button
                        key={year}
                        type="button"
                        onClick={() => {
                          const newDate = new Date(viewDate);
                          newDate.setFullYear(year);
                          setViewDate(newDate);
                          setViewMode('months');
                        }}
                        className={`
                          py-4 rounded-xl text-sm font-medium transition-all
                          ${isSelected
                            ? 'bg-primary text-white shadow-md'
                            : 'text-text-primary hover:bg-surface-hover hover:scale-105'
                          }
                        `}
                      >
                        {year}
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Today Button */}
          <div className="mt-3 pt-3 border-t border-border">
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                setViewDate(today);
                setYearRangeStart(Math.floor(today.getFullYear() / 12) * 12);
                setViewMode('days');
                if (!isDateDisabled(today)) {
                  handleDateSelect(today);
                }
              }}
              className="w-full py-2 text-sm text-primary hover:bg-primary/10 rounded-lg transition-colors"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatePicker;
