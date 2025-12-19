export interface ErrorMapping {
  title: string;
  message: string;
  recoveryAction?: string;
}

export class ErrorMessageMapper {
  private static errorMappings: Record<string, ErrorMapping> = {};
  private static currentLocale: string = 'en';
  private static locales: Record<string, Record<string, ErrorMapping>> = {};

  // Initialize with default English mappings
  private static defaultMappings: Record<string, ErrorMapping> = {
    // Authentication errors
    'AUTH_REQUIRED': {
      title: 'Authentication Required',
      message: 'Please log in to continue.',
      recoveryAction: 'login'
    },
    'FORBIDDEN': {
      title: 'Access Denied',
      message: 'You don\'t have permission to perform this action.',
      recoveryAction: 'contact_admin'
    },
    'USER_EXISTS': {
      title: 'Account Already Exists',
      message: 'An account with this email already exists.',
      recoveryAction: 'login'
    },
    'INVALID_CREDENTIALS': {
      title: 'Invalid Credentials',
      message: 'The email or password you entered is incorrect.',
      recoveryAction: 'retry'
    },

    // Resource errors
    'GALLERY_NOT_FOUND': {
      title: 'Gallery Not Found',
      message: 'The gallery you\'re looking for doesn\'t exist.',
      recoveryAction: 'go_back'
    },
    'PHOTO_NOT_FOUND': {
      title: 'Photo Not Found',
      message: 'The photo you\'re looking for doesn\'t exist.',
      recoveryAction: 'go_back'
    },

    // Validation errors
    'VALIDATION_ERROR': {
      title: 'Invalid Input',
      message: 'Please check your input and try again.',
      recoveryAction: 'retry'
    },

    // Network errors
    'NETWORK_ERROR': {
      title: 'Connection Problem',
      message: 'Please check your internet connection and try again.',
      recoveryAction: 'retry'
    },
    'TIMEOUT': {
      title: 'Request Timeout',
      message: 'The request took too long. Please try again.',
      recoveryAction: 'retry'
    },

    // Server errors
    'INTERNAL_ERROR': {
      title: 'Something Went Wrong',
      message: 'An unexpected error occurred. Please try again later.',
      recoveryAction: 'retry'
    },
    'SERVICE_UNAVAILABLE': {
      title: 'Service Unavailable',
      message: 'The service is temporarily unavailable. Please try again later.',
      recoveryAction: 'retry'
    },

    // Rate limiting
    'RATE_LIMIT_EXCEEDED': {
      title: 'Too Many Requests',
      message: 'You\'re making requests too quickly. Please wait a moment before trying again.',
      recoveryAction: 'wait'
    },

    // MCP errors
    'MCP_DATABASE_ERROR': {
      title: 'Database Error',
      message: 'A database error occurred while processing your request.',
      recoveryAction: 'retry'
    },
    'MCP_MODEL_ERROR': {
      title: 'AI Processing Error',
      message: 'An error occurred while processing your request with AI.',
      recoveryAction: 'retry'
    },
    'MCP_TIMEOUT_ERROR': {
      title: 'Processing Timeout',
      message: 'The AI processing took too long. Please try again.',
      recoveryAction: 'retry'
    },
    'MCP_VALIDATION_ERROR': {
      title: 'Invalid Request',
      message: 'The request to the AI service was invalid.',
      recoveryAction: 'retry'
    }
  };

  static async loadLocale(locale: string = 'en'): Promise<void> {
    try {
      // Load locale file dynamically
      const response = await fetch(`/locales/${locale}/errors.json`);
      if (response.ok) {
        const localeData = await response.json();
        this.locales[locale] = localeData;
        this.currentLocale = locale;
        this.errorMappings = { ...this.defaultMappings, ...localeData };
      } else {
        // Fallback to English if locale not found
        await this.loadLocale('en');
      }
    } catch (error) {
      console.warn(`Failed to load locale ${locale}, falling back to English:`, error);
      // Fallback to default English mappings
      this.currentLocale = 'en';
      this.errorMappings = { ...this.defaultMappings };
    }
  }

  static getCurrentLocale(): string {
    return this.currentLocale;
  }

  static mapApiError(errorCode: string, statusCode?: number): ErrorMapping {
    // First try exact match
    if (this.errorMappings[errorCode]) {
      return this.errorMappings[errorCode];
    }

    // Fallback based on status code
    if (statusCode) {
      switch (statusCode) {
        case 400:
          return {
            title: 'Bad Request',
            message: 'The request was invalid. Please check your input.',
            recoveryAction: 'retry'
          };
        case 401:
          return this.errorMappings['AUTH_REQUIRED'];
        case 403:
          return this.errorMappings['FORBIDDEN'];
        case 404:
          return {
            title: 'Not Found',
            message: 'The requested resource was not found.',
            recoveryAction: 'go_back'
          };
        case 409:
          return {
            title: 'Conflict',
            message: 'This action conflicts with existing data.',
            recoveryAction: 'retry'
          };
        case 422:
          return this.errorMappings['VALIDATION_ERROR'];
        case 429:
          return this.errorMappings['RATE_LIMIT_EXCEEDED'];
        case 500:
        case 502:
        case 503:
        case 504:
          return this.errorMappings['INTERNAL_ERROR'];
        default:
          return {
            title: 'Error',
            message: 'An error occurred. Please try again.',
            recoveryAction: 'retry'
          };
      }
    }

    // Default fallback
    return {
      title: 'Error',
      message: 'An unexpected error occurred.',
      recoveryAction: 'retry'
    };
  }

  static getRecoveryAction(recoveryAction: string): { label: string; action: () => void } | null {
    switch (recoveryAction) {
      case 'login':
        return {
          label: 'Log In',
          action: () => {
            // Navigate to login page
            window.location.href = '/login';
          }
        };
      case 'retry':
        return {
          label: 'Try Again',
          action: () => {
            // Reload current page or retry action
            window.location.reload();
          }
        };
      case 'go_back':
        return {
          label: 'Go Back',
          action: () => {
            window.history.back();
          }
        };
      case 'contact_admin':
        return {
          label: 'Contact Support',
          action: () => {
            // Open support email or chat
            window.open('mailto:support@rawdrive.in', '_blank');
          }
        };
      case 'wait':
        return {
          label: 'Wait',
          action: () => {
            // Do nothing, user should wait
          }
        };
      default:
        return null;
    }
  }
}