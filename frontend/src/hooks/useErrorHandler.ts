import { useCallback, useEffect } from 'react';
import { ErrorMessageMapper, ErrorMapping } from '../utils/errorMessages';
import { useToast } from '../components/ui';

interface ErrorContext {
  component?: string;
  action?: string;
  userId?: string;
  workspaceId?: string;
  [key: string]: any;
}

export const useErrorHandler = () => {
  const { showToast } = useToast();

  // Load locale on mount
  useEffect(() => {
    const loadLocale = async () => {
      // Try to get locale from browser or user preferences
      const locale = navigator.language.split('-')[0] || 'en';
      await ErrorMessageMapper.loadLocale(locale);
    };
    
    loadLocale();
  }, []);

  const handleError = useCallback((
    error: any,
    context?: ErrorContext
  ) => {
    // Extract error information
    let errorCode = 'UNKNOWN_ERROR';
    let statusCode: number | undefined;

    if (error?.response?.data?.error) {
      // API error response
      const apiError = error.response.data.error;
      errorCode = apiError.code || 'API_ERROR';
      statusCode = error.response.status;
    } else if (error?.code) {
      // Direct error with code
      errorCode = error.code;
    } else if (error?.status) {
      // HTTP error
      statusCode = error.status;
      errorCode = `HTTP_${statusCode}`;
    }

    // Map to user-friendly message
    const errorMapping: ErrorMapping = ErrorMessageMapper.mapApiError(errorCode, statusCode);

    // Log error for debugging
    console.error('Error handled:', {
      error,
      context,
      errorCode,
      statusCode,
      mapping: errorMapping
    });

    // Show toast notification
    showToast({
      type: 'error',
      title: errorMapping.title,
      message: errorMapping.message,
      duration: 5000,
      action: errorMapping.recoveryAction ?
        ErrorMessageMapper.getRecoveryAction(errorMapping.recoveryAction) :
        undefined
    });

    // Return error info for further handling if needed
    return {
      errorCode,
      statusCode,
      mapping: errorMapping,
      originalError: error
    };
  }, [showToast]);

  const handleApiError = useCallback((
    error: any,
    context?: ErrorContext
  ) => {
    // Specifically for API errors
    return handleError(error, { ...context, source: 'api' });
  }, [handleError]);

  const handleNetworkError = useCallback((
    error: any,
    context?: ErrorContext
  ) => {
    // Specifically for network errors
    return handleError(
      { ...error, code: 'NETWORK_ERROR' },
      { ...context, source: 'network' }
    );
  }, [handleError]);

  const handleValidationError = useCallback((
    error: any,
    context?: ErrorContext
  ) => {
    // Specifically for validation errors
    return handleError(
      { ...error, code: 'VALIDATION_ERROR' },
      { ...context, source: 'validation' }
    );
  }, [handleError]);

  return {
    handleError,
    handleApiError,
    handleNetworkError,
    handleValidationError
  };
};