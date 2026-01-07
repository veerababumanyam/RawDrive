/**
 * Utility modules for Photo Sync Service.
 *
 * @module utils
 */

// Encryption utilities
export {
  // Main functions
  encrypt,
  decrypt,
  encryptDetailed,
  decryptDetailed,
  encryptBuffer,
  decryptBuffer,

  // Key management
  deriveKey,
  getEncryptionKey,
  validateKey,
  generateKey,
  generateIV,
  clearKeyCache,

  // Utilities
  isEncrypted,
  secureCompare,

  // Constants
  ENCRYPTION_ALGORITHM,
  IV_LENGTH,
  AUTH_TAG_LENGTH,
  KEY_LENGTH,

  // Errors
  EncryptionError,
  DecryptionError,
  KeyError,

  // Types
  type EncryptionOptions,
  type EncryptionResult,

  // Default export
  default as encryption,
} from './encryption.js';

// Rate limiter utilities
export {
  // Classes
  InMemoryTokenBucket,
  RedisTokenBucket,
  ProviderRateLimiter,

  // Errors
  RateLimiterError,
  RateLimitExceededError,
  WaitTimeoutError,

  // Singleton
  getProviderRateLimiter,
  resetProviderRateLimiter,

  // Convenience functions
  consumeRateLimit,
  consumeRateLimitOrWait,
  canMakeRequest,
  getRemainingRateLimit,
  resetRateLimit,

  // Configuration helpers
  createConfigFromRpm,
  createConfigFromRps,

  // Constants
  DEFAULT_CONFIG as RATE_LIMITER_DEFAULT_CONFIG,
  PROVIDER_RATE_LIMITS,

  // Types
  type ProviderType,
  type RateLimiterConfig,
  type ConsumeOptions,
  type ConsumeResult,
  type RateLimiterStats,
  type ProviderRateLimitConfig,

  // Default export
  default as rateLimiter,
} from './rate-limiter.js';

// Retry utilities
export {
  // Main functions
  retry,
  withRetry,
  retryWithFixedDelay,
  retryWithLinearBackoff,

  // Utility functions
  sleep,
  calculateDelay,
  isRetryableError,
  extractStatusCode,
  extractRetryAfter,

  // Predefined strategies
  createRateLimitRetryOptions,
  createNetworkRetryOptions,
  createDatabaseRetryOptions,
  createOAuthRetryOptions,

  // Tracker
  RetryTracker,
  getGlobalRetryTracker,
  resetGlobalRetryTracker,

  // Errors
  RetryError,
  RetriesExhaustedError,
  RetryAbortedError,
  NonRetryableError,

  // Constants
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_STATUS_CODES,
  RETRYABLE_ERROR_CODES,
  RETRYABLE_ERROR_MESSAGES,

  // Types
  type RetryConfig,
  type RetryOptions,
  type RetryResult,
  type RetryStats,
  type RetryContext,
  type HttpLikeError,

  // Default export
  default as retryUtils,
} from './retry.js';

// EXIF parser utilities
export {
  // Main parsing functions
  parseExifFromBuffer,
  parseExifFromFile,

  // Quick extraction functions
  extractGpsFromBuffer,
  extractDateFromBuffer,
  hasGpsData,
  getQuickSummary,

  // Utility functions
  parseExifDate,
  extractTimezoneOffset,
  convertGpsToDecimal,
  formatExposureTime,
  isSupportedFormat,

  // Constants
  ORIENTATION_MAP,
  EXPOSURE_PROGRAM_MAP,
  METERING_MODE_MAP,
  WHITE_BALANCE_MAP,
  FLASH_MAP,
  COLOR_SPACE_MAP,
  SUPPORTED_EXTENSIONS,

  // Errors
  ExifParserError,
  UnsupportedFormatError,
  CorruptedExifError,
  MissingExifError,

  // Types
  type GpsCoordinates,
  type CameraInfo,
  type ExposureInfo,
  type LensInfo,
  type ImageDimensions,
  type TimestampInfo,
  type RightsInfo,
  type ExifMetadata,
  type ExifParseOptions,
  type ExifParseResult,
  type ExifParseError,

  // Default export
  default as exifParser,
} from './exif-parser.js';

// Duplicate detector utilities
export {
  // SHA-256 functions
  computeSHA256,
  computeSHA256FromStream,
  computeSHA256FromFile,

  // pHash functions
  computePHash,
  computePHashFromFile,

  // Combined hash functions
  computeHashes,
  computeHashesFromFile,

  // Hamming distance functions
  hammingDistance,
  hammingToSimilarity,
  similarityToHamming,

  // Comparison functions
  compareDuplicates,
  findDuplicateInList,

  // Batch operations
  batchComputeHashes,
  findDuplicateGroups,

  // Utility functions
  areSimilar,
  areIdentical,
  isValidSHA256,
  isValidPHash,
  getConfidenceDescription,
  createDuplicateDetector,

  // Constants
  PHASH_SIZE,
  DCT_SIZE,
  HASH_ALGORITHM,
  DEFAULT_SIMILARITY_THRESHOLD,
  STRICT_SIMILARITY_THRESHOLD,
  LOOSE_SIMILARITY_THRESHOLD,
  PHASH_BITS,

  // Errors
  DuplicateDetectorError,
  HashComputationError,
  ImageProcessingError,
  InvalidInputError,

  // Types
  type HashResult,
  type DuplicateComparisonResult,
  type HashOptions,
  type CompareOptions,
  type BatchHashResult,
  type SimilarityGroup,

  // Default export
  default as duplicateDetector,
} from './duplicate-detector.js';

// Circuit breaker utilities
export {
  // Classes
  CircuitBreaker,
  ProviderCircuitBreakerManager,

  // Errors
  CircuitBreakerError,
  CircuitOpenError,
  CircuitTimeoutError,

  // Enums
  CircuitState,

  // Singleton
  getProviderCircuitBreakerManager,
  resetProviderCircuitBreakerManager,

  // Convenience functions
  executeWithCircuitBreaker,
  executeWithUserCircuitBreaker,
  isProviderHealthy,
  getProviderCircuitState,
  getProviderCircuitStats,
  getUnhealthyProviders,

  // Utility functions
  createCircuitBreaker,
  createProviderCircuitBreaker,
  withCircuitBreaker,
  shouldOpenCircuit,
  isCircuitBreakerError,
  isCircuitOpenError,

  // Constants
  DEFAULT_CONFIG as CIRCUIT_BREAKER_DEFAULT_CONFIG,
  PROVIDER_CIRCUIT_CONFIGS,

  // Types
  type ProviderType as CircuitBreakerProviderType,
  type CircuitBreakerConfig,
  type CircuitBreakerResult,
  type CircuitBreakerStats,
  type CircuitBreakerEventType,
  type CircuitBreakerEvent,
  type CircuitBreakerEventListener,
  type ExecuteOptions as CircuitBreakerExecuteOptions,

  // Default export
  default as circuitBreaker,
} from './circuit-breaker.js';
