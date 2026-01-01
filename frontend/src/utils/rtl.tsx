/**
 * RTL (Right-to-Left) Support Utilities
 *
 * Provides hooks and context for RTL text direction support,
 * commonly needed for Arabic, Hebrew, Urdu, etc.
 *
 * Feature: 016-save-the-date Phase 13
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Direction = 'ltr' | 'rtl';

interface RTLContextValue {
  direction: Direction;
  isRTL: boolean;
  setDirection: (dir: Direction) => void;
  toggleDirection: () => void;
}

const RTLContext = createContext<RTLContextValue | undefined>(undefined);

/**
 * RTL languages
 */
export const RTL_LANGUAGES = [
  'ar', // Arabic
  'he', // Hebrew
  'fa', // Persian
  'ur', // Urdu
  'yi', // Yiddish
  'ps', // Pashto
  'sd', // Sindhi
  'ug', // Uyghur
];

/**
 * Detect if a language code is RTL
 */
export const isRTLLanguage = (languageCode: string): boolean => {
  const baseCode = languageCode.split('-')[0].toLowerCase();
  return RTL_LANGUAGES.includes(baseCode);
};

/**
 * Detect text direction from content
 */
export const detectTextDirection = (text: string): Direction => {
  if (!text) return 'ltr';
  
  // RTL Unicode ranges
  const rtlPattern = /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  
  // First strong character determines direction
  for (const char of text) {
    if (rtlPattern.test(char)) return 'rtl';
    if (/[a-zA-Z]/.test(char)) return 'ltr';
  }
  
  return 'ltr';
};

interface RTLProviderProps {
  children: ReactNode;
  defaultDirection?: Direction;
  detectFromNavigator?: boolean;
}

/**
 * RTL Provider - wraps app to provide RTL context
 */
export const RTLProvider: React.FC<RTLProviderProps> = ({
  children,
  defaultDirection = 'ltr',
  detectFromNavigator = true,
}) => {
  const [direction, setDirection] = useState<Direction>(defaultDirection);

  useEffect(() => {
    if (detectFromNavigator) {
      const browserLang = navigator.language || (navigator as any).userLanguage || 'en';
      const detectedDir = isRTLLanguage(browserLang) ? 'rtl' : 'ltr';
      setDirection(detectedDir);
    }
  }, [detectFromNavigator]);

  useEffect(() => {
    // Update document direction
    document.documentElement.dir = direction;
    document.documentElement.setAttribute('data-direction', direction);
  }, [direction]);

  const toggleDirection = () => {
    setDirection((prev) => (prev === 'ltr' ? 'rtl' : 'ltr'));
  };

  return (
    <RTLContext.Provider
      value={{
        direction,
        isRTL: direction === 'rtl',
        setDirection,
        toggleDirection,
      }}
    >
      {children}
    </RTLContext.Provider>
  );
};

/**
 * Hook to access RTL context
 */
export const useRTL = (): RTLContextValue => {
  const context = useContext(RTLContext);
  if (!context) {
    // Return default values if used outside provider
    return {
      direction: 'ltr',
      isRTL: false,
      setDirection: () => {},
      toggleDirection: () => {},
    };
  }
  return context;
};

/**
 * Get directional property name (left/right swap for RTL)
 */
export const getDirectionalProp = (
  prop: 'left' | 'right' | 'marginLeft' | 'marginRight' | 'paddingLeft' | 'paddingRight',
  isRTL: boolean
): string => {
  const swaps: Record<string, string> = {
    left: 'right',
    right: 'left',
    marginLeft: 'marginRight',
    marginRight: 'marginLeft',
    paddingLeft: 'paddingRight',
    paddingRight: 'paddingLeft',
  };
  
  return isRTL ? swaps[prop] || prop : prop;
};

/**
 * CSS utility classes for RTL support
 */
export const rtlClasses = {
  // Use these classes for directional props
  // Example: <div className={cn('ml-4', rtlClasses.startMargin)} />
  startMargin: 'rtl:mr-0 rtl:ml-auto ltr:ml-0 ltr:mr-auto',
  endMargin: 'rtl:ml-0 rtl:mr-auto ltr:mr-0 ltr:ml-auto',
  startPadding: 'rtl:pr-0 rtl:pl-4 ltr:pl-0 ltr:pr-4',
  endPadding: 'rtl:pl-0 rtl:pr-4 ltr:pr-0 ltr:pl-4',
  textStart: 'rtl:text-right ltr:text-left',
  textEnd: 'rtl:text-left ltr:text-right',
  flexRowReverse: 'rtl:flex-row-reverse',
};

/**
 * Bidirectional text component
 */
export const Bidi: React.FC<{
  children: ReactNode;
  as?: keyof JSX.IntrinsicElements;
  className?: string;
}> = ({ children, as: Component = 'span', className }) => {
  const direction = typeof children === 'string' ? detectTextDirection(children) : 'ltr';
  
  return (
    <Component dir={direction} className={className}>
      {children}
    </Component>
  );
};

export default {
  RTLProvider,
  useRTL,
  isRTLLanguage,
  detectTextDirection,
  getDirectionalProp,
  rtlClasses,
  Bidi,
};
