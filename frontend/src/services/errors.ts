/**
 * Custom Error Classes
 * Type-safe error handling for API services
 */

// V8 Error.captureStackTrace type extension
type ErrorConstructorWithCaptureStackTrace = ErrorConstructor & {
    captureStackTrace?: (targetObject: object, constructorOpt?: Function) => void;
};

/**
 * Error codes for recycle bin operations
 */
export enum RecycleBinErrorCode {
    NOT_FOUND = 'NOT_FOUND',
    ACCESS_DENIED = 'ACCESS_DENIED',
    NAME_CONFLICT = 'NAME_CONFLICT',
    PARENT_NOT_FOUND = 'PARENT_NOT_FOUND',
    PARENT_DELETED = 'PARENT_DELETED',
    NOT_DELETED = 'NOT_DELETED',
    DELETION_IN_PROGRESS = 'DELETION_IN_PROGRESS',
    NETWORK_ERROR = 'NETWORK_ERROR',
    UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

/**
 * Custom error class for recycle bin operations
 * Provides structured error information with codes and status
 */
export class RecycleBinError extends Error {
    constructor(
        message: string,
        public code: RecycleBinErrorCode,
        public status: number,
        public details?: unknown
    ) {
        super(message);
        this.name = 'RecycleBinError';

        // Maintains proper stack trace for where error was thrown (V8 only)
        const ErrorWithCapture = Error as ErrorConstructorWithCaptureStackTrace;
        if (ErrorWithCapture.captureStackTrace) {
            ErrorWithCapture.captureStackTrace(this, RecycleBinError);
        }
    }

    /**
     * Check if this is a specific error type
     */
    is(code: RecycleBinErrorCode): boolean {
        return this.code === code;
    }

    /**
     * Get user-friendly error message
     */
    getUserMessage(): string {
        switch (this.code) {
            case RecycleBinErrorCode.NOT_FOUND:
                return 'Item not found. It may have already been deleted or restored.';
            case RecycleBinErrorCode.ACCESS_DENIED:
                return 'You do not have permission to perform this action.';
            case RecycleBinErrorCode.NAME_CONFLICT:
                return 'An item with this name already exists. Please choose a different name.';
            case RecycleBinErrorCode.PARENT_NOT_FOUND:
                return 'The parent gallery no longer exists.';
            case RecycleBinErrorCode.PARENT_DELETED:
                return 'Cannot restore: parent gallery is also deleted. Restore the gallery first.';
            case RecycleBinErrorCode.NOT_DELETED:
                return 'This item is not in the recycle bin.';
            case RecycleBinErrorCode.DELETION_IN_PROGRESS:
                return 'Deletion already in progress for this item.';
            case RecycleBinErrorCode.NETWORK_ERROR:
                return 'Network error. Please check your connection and try again.';
            default:
                return this.message || 'An unexpected error occurred.';
        }
    }
}
