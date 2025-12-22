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
    },

    // =========================================================================
    // Client CRM Module Errors
    // =========================================================================

    // Client Profile errors
    'CLIENT_NOT_FOUND': {
      title: 'Client Not Found',
      message: 'The client you\'re looking for doesn\'t exist or has been deleted.',
      recoveryAction: 'go_back'
    },
    'CLIENT_DUPLICATE_EMAIL': {
      title: 'Email Already Exists',
      message: 'A client with this email address already exists.',
      recoveryAction: 'retry'
    },
    'CLIENT_DUPLICATE_PHONE': {
      title: 'Phone Already Exists',
      message: 'A client with this phone number already exists.',
      recoveryAction: 'retry'
    },
    'CLIENT_VALIDATION_ERROR': {
      title: 'Invalid Client Data',
      message: 'Please check the client information and try again.',
      recoveryAction: 'retry'
    },
    'CLIENT_DELETION_BLOCKED': {
      title: 'Cannot Delete Client',
      message: 'This client cannot be deleted due to existing data.',
      recoveryAction: 'retry'
    },
    'CLIENT_ACTIVE_PROOFING': {
      title: 'Active Proofing Sessions',
      message: 'This client has active proofing sessions. Please complete or archive them first.',
      recoveryAction: 'retry'
    },

    // Contact errors
    'CONTACT_NOT_FOUND': {
      title: 'Contact Not Found',
      message: 'The contact method you\'re looking for doesn\'t exist.',
      recoveryAction: 'retry'
    },
    'CONTACT_DUPLICATE': {
      title: 'Contact Already Exists',
      message: 'This contact is already saved for this client.',
      recoveryAction: 'retry'
    },
    'CONTACT_LAST_METHOD': {
      title: 'Cannot Remove Last Contact',
      message: 'A client must have at least one contact method.',
      recoveryAction: 'retry'
    },
    'CONTACT_PRIMARY_EXISTS': {
      title: 'Primary Contact Exists',
      message: 'This client already has a primary contact of this type.',
      recoveryAction: 'retry'
    },
    'CONTACT_INVALID_FORMAT': {
      title: 'Invalid Contact Format',
      message: 'The contact format is invalid. Please check and try again.',
      recoveryAction: 'retry'
    },

    // Address errors
    'ADDRESS_NOT_FOUND': {
      title: 'Address Not Found',
      message: 'The address you\'re looking for doesn\'t exist.',
      recoveryAction: 'retry'
    },
    'ADDRESS_VALIDATION_ERROR': {
      title: 'Invalid Address',
      message: 'Please check the address details and try again.',
      recoveryAction: 'retry'
    },

    // Tag errors
    'TAG_NOT_FOUND': {
      title: 'Tag Not Found',
      message: 'The tag you\'re looking for doesn\'t exist.',
      recoveryAction: 'retry'
    },
    'TAG_DUPLICATE': {
      title: 'Tag Already Exists',
      message: 'A tag with this name already exists.',
      recoveryAction: 'retry'
    },
    'TAG_ALREADY_ASSIGNED': {
      title: 'Tag Already Assigned',
      message: 'This tag is already assigned to the client.',
      recoveryAction: 'retry'
    },

    // Gallery link errors
    'GALLERY_LINK_NOT_FOUND': {
      title: 'Gallery Link Not Found',
      message: 'This client is not linked to the specified gallery.',
      recoveryAction: 'retry'
    },
    'GALLERY_ALREADY_LINKED': {
      title: 'Gallery Already Linked',
      message: 'This client is already linked to this gallery.',
      recoveryAction: 'retry'
    },

    // Avatar errors
    'AVATAR_UPLOAD_FAILED': {
      title: 'Avatar Upload Failed',
      message: 'Failed to upload the avatar. Please try again.',
      recoveryAction: 'retry'
    },
    'AVATAR_FILE_TOO_LARGE': {
      title: 'Image Too Large',
      message: 'Please use an image smaller than 5MB.',
      recoveryAction: 'retry'
    },
    'AVATAR_INVALID_FORMAT': {
      title: 'Invalid Image Format',
      message: 'Please use JPEG, PNG, or WebP format.',
      recoveryAction: 'retry'
    },
    'AVATAR_ASSET_NOT_IN_GALLERY': {
      title: 'Photo Not Available',
      message: 'This photo is not in a gallery linked to the client.',
      recoveryAction: 'go_back'
    },

    // Communication errors
    'COMMUNICATION_NOT_FOUND': {
      title: 'Communication Not Found',
      message: 'The communication record doesn\'t exist.',
      recoveryAction: 'retry'
    },

    // Smart list errors
    'SMART_LIST_NOT_FOUND': {
      title: 'Smart List Not Found',
      message: 'The smart list you\'re looking for doesn\'t exist.',
      recoveryAction: 'go_back'
    },
    'SMART_LIST_SYSTEM_PROTECTED': {
      title: 'System List Protected',
      message: 'This system list cannot be modified.',
      recoveryAction: 'go_back'
    },
    'SMART_LIST_INVALID_FILTER': {
      title: 'Invalid Filter',
      message: 'The filter criteria is invalid. Please check and try again.',
      recoveryAction: 'retry'
    },

    // Import/Export errors
    'IMPORT_INVALID_FORMAT': {
      title: 'Invalid File Format',
      message: 'Please provide a valid CSV file.',
      recoveryAction: 'retry'
    },
    'IMPORT_VALIDATION_ERROR': {
      title: 'Import Validation Failed',
      message: 'Some rows have validation errors. Please fix and try again.',
      recoveryAction: 'retry'
    },
    'EXPORT_FAILED': {
      title: 'Export Failed',
      message: 'Failed to export clients. Please try again later.',
      recoveryAction: 'retry'
    },

    // Merge errors
    'MERGE_SAME_CLIENT': {
      title: 'Cannot Merge',
      message: 'You cannot merge a client with itself.',
      recoveryAction: 'retry'
    },
    'MERGE_FAILED': {
      title: 'Merge Failed',
      message: 'Failed to merge clients. Please try again later.',
      recoveryAction: 'retry'
    },

    // Portal access errors
    'PORTAL_ACCESS_ERROR': {
      title: 'Portal Access Error',
      message: 'Failed to manage portal access.',
      recoveryAction: 'retry'
    },
    'PORTAL_USER_EXISTS': {
      title: 'Portal Account Exists',
      message: 'A portal account already exists for this email.',
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
            window.open('mailto:support@rawdrive.ai', '_blank');
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