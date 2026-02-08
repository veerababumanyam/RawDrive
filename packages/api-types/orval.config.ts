/**
 * Orval configuration for generating TypeScript API clients from OpenAPI specs.
 *
 * This generates:
 * - Strongly typed API clients for each microservice
 * - Request/response types
 * - Zod schemas for runtime validation
 *
 * @see https://orval.dev/reference/configuration
 */
import { defineConfig } from 'orval';

// Common orval configuration
const commonConfig = {
  client: 'axios' as const,
  mode: 'tags-split' as const,
  target: './src/clients',
  schemas: './src/models',
  mock: false,
  clean: true,
  prettier: true,
  override: {
    mutator: {
      path: './src/lib/axios-instance.ts',
      name: 'customInstance',
    },
    // Generate Zod schemas for runtime validation
    zod: {
      strict: {
        response: true,
        body: true,
        query: true,
        param: true,
        header: false,
      },
      generate: {
        response: true,
        body: true,
        query: true,
        param: true,
      },
      coerce: {
        query: true,
        param: true,
      },
    },
    // Transform operation names to camelCase
    operationName: (operation, _route, verb) => {
      const name = operation.operationId || `${verb}${_route.replace(/[^a-zA-Z0-9]/g, '')}`;
      return name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    },
    // Add JSDoc comments from OpenAPI descriptions
    useTypeOverInterfaces: true,
  },
};

export default defineConfig({
  // Backend service (main API)
  backend: {
    input: {
      target: './openapi/backend.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/backend.ts',
      schemas: './src/models/backend',
    },
  },

  // Gallery service
  galleryService: {
    input: {
      target: './openapi/gallery-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/gallery-service.ts',
      schemas: './src/models/gallery-service',
    },
  },

  // Webhooks service
  webhooksService: {
    input: {
      target: './openapi/webhooks-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/webhooks-service.ts',
      schemas: './src/models/webhooks-service',
    },
  },

  // Billing service
  billingService: {
    input: {
      target: './openapi/billing-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/billing-service.ts',
      schemas: './src/models/billing-service',
    },
  },

  // Client service
  clientService: {
    input: {
      target: './openapi/client-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/client-service.ts',
      schemas: './src/models/client-service',
    },
  },

  // Notifications service
  notificationsService: {
    input: {
      target: './openapi/notifications-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/notifications-service.ts',
      schemas: './src/models/notifications-service',
    },
  },

  // Invitations service
  invitationsService: {
    input: {
      target: './openapi/invitations-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/invitations-service.ts',
      schemas: './src/models/invitations-service',
    },
  },

  // Onboarding service
  onboardingService: {
    input: {
      target: './openapi/onboarding-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/onboarding-service.ts',
      schemas: './src/models/onboarding-service',
    },
  },

  // AI service
  aiService: {
    input: {
      target: './openapi/ai-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/ai-service.ts',
      schemas: './src/models/ai-service',
    },
  },

  // AI processing service
  aiProcessingService: {
    input: {
      target: './openapi/ai-processing-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/ai-processing-service.ts',
      schemas: './src/models/ai-processing-service',
    },
  },

  // LiveSync service
  livesyncService: {
    input: {
      target: './openapi/livesync-service.json',
    },
    output: {
      ...commonConfig,
      target: './src/clients/livesync-service.ts',
      schemas: './src/models/livesync-service',
    },
  },
});
