import React from 'react';

export interface CountryCode {
    code: string;
    name: string;
    dial_code: string;
}

export const COUNTRY_CODES: CountryCode[] = [
    { code: 'IN', name: 'India', dial_code: '+91' },
    { code: 'US', name: 'United States', dial_code: '+1' },
    { code: 'GB', name: 'United Kingdom', dial_code: '+44' },
    { code: 'AU', name: 'Australia', dial_code: '+61' },
    { code: 'CA', name: 'Canada', dial_code: '+1' },
    { code: 'DE', name: 'Germany', dial_code: '+49' },
    { code: 'FR', name: 'France', dial_code: '+33' },
    { code: 'IT', name: 'Italy', dial_code: '+39' },
    { code: 'ES', name: 'Spain', dial_code: '+34' },
    { code: 'JP', name: 'Japan', dial_code: '+81' },
    { code: 'CN', name: 'China', dial_code: '+86' },
    { code: 'BR', name: 'Brazil', dial_code: '+55' },
    { code: 'RU', name: 'Russia', dial_code: '+7' },
    { code: 'ZA', name: 'South Africa', dial_code: '+27' },
    { code: 'AE', name: 'United Arab Emirates', dial_code: '+971' },
    { code: 'SG', name: 'Singapore', dial_code: '+65' },
    { code: 'MY', name: 'Malaysia', dial_code: '+60' },
    { code: 'ID', name: 'Indonesia', dial_code: '+62' },
    { code: 'NL', name: 'Netherlands', dial_code: '+31' },
    { code: 'CH', name: 'Switzerland', dial_code: '+41' },
];

interface CountryCodeSelectorProps {
    value?: string;
    onChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
}

const CountryCodeSelector: React.FC<CountryCodeSelectorProps> = ({
    value,
    onChange,
    disabled = false,
    className = '',
}) => {
    return (
        <select
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={`form-select ${className}`}
            style={{ width: '100px', flexShrink: 0 }}
        >
            <option value="">Code</option>
            {COUNTRY_CODES.map((country) => (
                <option key={`${country.code}-${country.dial_code}`} value={country.dial_code}>
                    {country.dial_code} ({country.code})
                </option>
            ))}
        </select>
    );
};

export default CountryCodeSelector;
