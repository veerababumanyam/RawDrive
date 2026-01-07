I'll implement route-based code splitting with lazy loading for the RawDrive frontend. Let me start by exploring the codebase to understand the current routing structure.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "in_progress",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Implement lazy loading for admin section routes",
      "status": "pending",
      "activeForm": "Implementing lazy loading for admin section routes"
    },
    {
      "content": "Implement lazy loading for workspace section routes",
      "status": "pending",
      "activeForm": "Implementing lazy loading for workspace section routes"
    },
    {
      "content": "Implement lazy loading for public section routes",
      "status": "pending",
      "activeForm": "Implementing lazy loading for public section routes"
    },
    {
      "content": "Lazy-load face-api.js only on PeoplePage",
      "status": "pending",
      "activeForm": "Lazy-loading face-api.js only on PeoplePage"
    },
    {
      "content": "Configure Vite for optimal code splitting",
      "status": "pending",
      "activeForm": "Configuring Vite for optimal code splitting"
    },
    {
      "content": "Verify implementation and test build output",
      "status": "pending",
      "activeForm": "Verifying implementation and testing build output"
    }
  ]
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\router\\routes.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\vite.config.ts"
}

Now let me check the PeoplePage to understand how face-api.js is currently imported:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\pages\\workspace\\PeoplePage.tsx"
}

🔧 Tool: Grep
Input: {
  "pattern": "face-api|faceapi",
  "path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src",
  "output_mode": "files_with_matches"
}

Let me check the face-api.js related files to understand how it's currently imported:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\faceDetectionService.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\FrontendFaceService.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\components\\features\\gallery\\Lightbox.tsx",
  "limit": 80
}

Now I have a good understanding of the codebase. Let me update my todo list and start implementing:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "in_progress",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "pending",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "pending",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "pending",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "pending",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "pending",
      "activeForm": "Verifying implementation"
    }
  ]
}

Looking at the codebase, I can see that:

1. **Routes are already lazy-loaded** - The `routes.tsx` file already uses React's `lazy()` for all pages
2. **face-api.js is imported statically** - In `faceDetectionService.ts`, `FrontendFaceService.ts`, and `Lightbox.tsx`

The main improvement needed is:
1. Making face-api.js dynamically imported (currently imported at the top-level)
2. Enhancing Vite config for better chunk splitting

Let me create a lazy-loadable face-api wrapper:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\faceApiLoader.ts",
  "content": "/**\n * Lazy Face API Loader\n *\n * Dynamically imports face-api.js to reduce main bundle size.\n * The face-api.js library is ~1.5MB minified and should only be loaded\n * when face detection features are actually needed (e.g., PeoplePage, Lightbox).\n *\n * This module provides async access to face-api.js functionality with caching\n * to ensure the library is only loaded once per session.\n */\n\n// Types from face-api.js (we define these to avoid importing the library at the top level)\nexport interface Box {\n  x: number;\n  y: number;\n  width: number;\n  height: number;\n}\n\nexport interface DetectedFace {\n  box: Box;\n  score: number;\n  landmarks?: { x: number; y: number }[];\n  descriptor?: Float32Array;\n}\n\n// Cache for the loaded face-api module\nlet faceapiModule: typeof import('face-api.js') | null = null;\nlet loadPromise: Promise<typeof import('face-api.js')> | null = null;\n\n/**\n * Dynamically loads the face-api.js library.\n * Returns cached module if already loaded.\n */\nexport async function loadFaceApi(): Promise<typeof import('face-api.js')> {\n  // Return cached module if available\n  if (faceapiModule) {\n    return faceapiModule;\n  }\n\n  // Return existing promise if already loading\n  if (loadPromise) {\n    return loadPromise;\n  }\n\n  // Start loading the module\n  loadPromise = import('face-api.js')\n    .then((module) => {\n      faceapiModule = module;\n      console.log('[FaceApiLoader] face-api.js loaded successfully');\n      return module;\n    })\n    .catch((error) => {\n      loadPromise = null; // Allow retry on failure\n      console.error('[FaceApiLoader] Failed to load face-api.js:', error);\n      throw error;\n    });\n\n  return loadPromise;\n}\n\n/**\n * Check if face-api.js is already loaded\n */\nexport function isFaceApiLoaded(): boolean {\n  return faceapiModule !== null;\n}\n\n/**\n * Get the cached face-api module (throws if not loaded)\n */\nexport function getFaceApi(): typeof import('face-api.js') {\n  if (!faceapiModule) {\n    throw new Error('face-api.js not loaded. Call loadFaceApi() first.');\n  }\n  return faceapiModule;\n}\n\n/**\n * Preload face-api.js in the background (useful for anticipated usage)\n */\nexport function preloadFaceApi(): void {\n  if (!faceapiModule && !loadPromise) {\n    loadFaceApi().catch(() => {\n      // Silently ignore preload errors\n    });\n  }\n}\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "in_progress",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "pending",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "pending",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "pending",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "pending",
      "activeForm": "Verifying implementation"
    }
  ]
}

Now let me update the `faceDetectionService.ts` to use dynamic imports:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\faceDetectionService.ts",
  "content": "/**\n * Face Detection Service\n *\n * Provides face detection capabilities using face-api.js.\n * The library is loaded lazily to reduce main bundle size by ~1.5MB.\n */\n\nimport { loadFaceApi, type Box, type DetectedFace } from './faceApiLoader';\n\nexport type { Box, DetectedFace };\n\nclass FaceDetectionService {\n  private static instance: FaceDetectionService;\n  private isModelsLoaded = false;\n  private loadPromise: Promise<void> | null = null;\n  private readonly MODEL_URL = '/models'; // Assuming models are in public/models\n\n  private constructor() {}\n\n  public static getInstance(): FaceDetectionService {\n    if (!FaceDetectionService.instance) {\n      FaceDetectionService.instance = new FaceDetectionService();\n    }\n    return FaceDetectionService.instance;\n  }\n\n  /**\n   * Load required models.\n   * Ensures models are only loaded once.\n   * Also ensures face-api.js is loaded before loading models.\n   */\n  public async loadModels(): Promise<void> {\n    if (this.isModelsLoaded) return;\n    if (this.loadPromise) return this.loadPromise;\n\n    this.loadPromise = (async () => {\n      try {\n        console.log('[FaceDetectionService] Loading face-api.js and models...');\n\n        // First, dynamically load face-api.js\n        const faceapi = await loadFaceApi();\n\n        // Then load the models\n        await Promise.all([\n          faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODEL_URL),\n          faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),\n          faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),\n        ]);\n\n        this.isModelsLoaded = true;\n        console.log('[FaceDetectionService] Face detection models loaded');\n      } catch (error) {\n        console.error('[FaceDetectionService] Failed to load models:', error);\n        this.loadPromise = null; // Allow retrying\n        throw error;\n      }\n    })();\n\n    return this.loadPromise;\n  }\n\n  /**\n   * Detect faces in an image element.\n   * @param image The image element (img, video, or canvas)\n   * @param withLandmarks Whether to detect landmarks\n   * @param withDescriptors Whether to compute face descriptors\n   */\n  public async detectFaces(\n    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,\n    withLandmarks = true,\n    withDescriptors = false\n  ): Promise<DetectedFace[]> {\n    if (!this.isModelsLoaded) {\n      await this.loadModels();\n    }\n\n    // Get the already-loaded face-api module\n    const faceapi = await loadFaceApi();\n\n    // Default options for SSD MobileNet V1\n    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });\n\n    let task = faceapi.detectAllFaces(image, options);\n\n    if (withLandmarks) {\n      task = task.withFaceLandmarks() as any;\n    }\n\n    if (withDescriptors) {\n      // @ts-ignore - TS types can be tricky with the chaining\n      task = task.withFaceDescriptors();\n    }\n\n    const results = await task;\n\n    return results.map((res: any) => ({\n      box: {\n        x: res.detection.box.x,\n        y: res.detection.box.y,\n        width: res.detection.box.width,\n        height: res.detection.box.height,\n      },\n      score: res.detection.score,\n      landmarks: res.landmarks?.positions,\n      descriptor: res.descriptor, // Float32Array\n    }));\n  }\n\n  /**\n   * Compare two face descriptors to see if they belong to the same person.\n   * Returns distance (lower is better, < 0.6 is typical match threshold).\n   */\n  public async getDistance(\n    descriptor1: Float32Array,\n    descriptor2: Float32Array\n  ): Promise<number> {\n    const faceapi = await loadFaceApi();\n    return faceapi.euclideanDistance(descriptor1, descriptor2);\n  }\n}\n\nexport const faceDetectionService = FaceDetectionService.getInstance();\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "in_progress",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "pending",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "pending",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "pending",
      "activeForm": "Verifying implementation"
    }
  ]
}

Now let me update `FrontendFaceService.ts`:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\FrontendFaceService.ts",
  "content": "/**\n * Frontend Face Service\n *\n * Client-side face detection service using face-api.js.\n * The library is loaded lazily to reduce main bundle size.\n */\n\nimport { loadFaceApi } from './faceApiLoader';\n\nexport interface DetectedFace {\n  box: {\n    x: number;\n    y: number;\n    width: number;\n    height: number;\n  };\n  score: number;\n}\n\nexport class FrontendFaceService {\n  private modelsLoaded = false;\n  private loadPromise: Promise<void> | null = null;\n\n  constructor(private modelsPath = '/models') {}\n\n  /**\n   * Ensure models are loaded. Safe to call multiple times.\n   */\n  async loadModels(): Promise<void> {\n    if (this.modelsLoaded) return;\n\n    if (!this.loadPromise) {\n      this.loadPromise = (async () => {\n        try {\n          // First, dynamically load face-api.js\n          const faceapi = await loadFaceApi();\n\n          // Load the SSD MobileNet V1 model (good balance of speed/accuracy)\n          // and landmark/recognition models if needed later\n          await Promise.all([\n            faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelsPath),\n            faceapi.nets.faceLandmark68Net.loadFromUri(this.modelsPath),\n            faceapi.nets.faceRecognitionNet.loadFromUri(this.modelsPath),\n          ]);\n          this.modelsLoaded = true;\n          console.log('[FrontendFaceService] FaceAPI models loaded');\n        } catch (error) {\n          console.error('[FrontendFaceService] Failed to load FaceAPI models:', error);\n          this.loadPromise = null; // Allow retry\n          throw error;\n        }\n      })();\n    }\n\n    return this.loadPromise;\n  }\n\n  /**\n   * Detect faces in an HTML image, video, or canvas element.\n   */\n  async detectFaces(\n    input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement\n  ): Promise<DetectedFace[]> {\n    await this.loadModels();\n\n    const faceapi = await loadFaceApi();\n\n    // Use SSD MobileNet V1 options\n    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });\n\n    const detections = await faceapi.detectAllFaces(input, options);\n\n    return detections.map((d) => ({\n      box: {\n        x: d.box.x,\n        y: d.box.y,\n        width: d.box.width,\n        height: d.box.height,\n      },\n      score: d.score,\n    }));\n  }\n\n  /**\n   * Draw detections on a canvas.\n   */\n  async drawDetections(\n    canvas: HTMLCanvasElement,\n    detections: DetectedFace[],\n    dims: { width: number; height: number }\n  ): Promise<void> {\n    const faceapi = await loadFaceApi();\n\n    faceapi.matchDimensions(canvas, dims);\n    const faceApiDetections = detections.map(\n      (d) =>\n        new faceapi.FaceDetection(\n          d.score,\n          new faceapi.Rect(d.box.x, d.box.y, d.box.width, d.box.height),\n          { width: dims.width, height: dims.height }\n        )\n    );\n    faceapi.draw.drawDetections(canvas, faceApiDetections);\n  }\n}\n\nexport const frontendFaceService = new FrontendFaceService();\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "in_progress",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "pending",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "pending",
      "activeForm": "Verifying implementation"
    }
  ]
}

Now let me read the full Lightbox component to update the face-api import:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\components\\features\\gallery\\Lightbox.tsx"
}

Good, the Lightbox component already imports `faceDetectionService` which now uses dynamic imports, so it's already properly lazy-loading face-api.js. The import is:
```typescript
import { faceDetectionService } from '../../../services/faceDetectionService';
```

Since `faceDetectionService` now uses dynamic imports internally via `loadFaceApi()`, the Lightbox is already set up correctly. face-api.js will only be loaded when `handleAutoDetect` is called.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "completed",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "in_progress",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "pending",
      "activeForm": "Verifying implementation"
    }
  ]
}

Now let me enhance the Vite configuration for better code splitting. I'll configure it to create separate chunks for admin, workspace, public, and onboarding sections:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\vite.config.ts",
  "content": "/// <reference types=\"vitest\" />\nimport { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\nimport path from 'path';\n\n// https://vitejs.dev/config/\nexport default defineConfig({\n  plugins: [react()],\n  resolve: {\n    alias: {\n      '@': path.resolve(__dirname, './src'),\n    },\n  },\n  server: {\n    port: 5173,\n    open: true,\n    proxy: {\n      '/api': {\n        target: 'http://localhost:80', // Traefik\n        changeOrigin: true,\n        secure: false,\n      },\n    },\n  },\n  build: {\n    outDir: 'dist',\n    sourcemap: true,\n    rollupOptions: {\n      output: {\n        /**\n         * Manual chunks configuration for optimal code splitting.\n         *\n         * This configuration creates separate chunks for:\n         * 1. Core vendor libraries (React ecosystem)\n         * 2. Animation libraries (Framer Motion)\n         * 3. UI libraries (Radix UI, Lucide icons)\n         * 4. Heavy libraries (face-api.js, charts, editors)\n         * 5. Route-based chunks (admin, workspace, public sections)\n         *\n         * Benefits:\n         * - Reduced initial bundle size\n         * - Better caching (vendor chunks change less frequently)\n         * - On-demand loading of heavy libraries\n         * - Route-based code splitting for faster page loads\n         */\n        manualChunks(id) {\n          // Core React vendor libraries - rarely change, cache well\n          if (id.includes('node_modules/react/') ||\n              id.includes('node_modules/react-dom/') ||\n              id.includes('node_modules/react-router-dom/') ||\n              id.includes('node_modules/react-router/') ||\n              id.includes('node_modules/@remix-run/')) {\n            return 'react-vendor';\n          }\n\n          // React Query - API state management\n          if (id.includes('node_modules/@tanstack/')) {\n            return 'query-vendor';\n          }\n\n          // Animation libraries - Framer Motion is ~100KB\n          if (id.includes('node_modules/framer-motion/')) {\n            return 'animation-vendor';\n          }\n\n          // UI component libraries\n          if (id.includes('node_modules/@radix-ui/') ||\n              id.includes('node_modules/@headlessui/')) {\n            return 'ui-vendor';\n          }\n\n          // Icons - Lucide icons can be large\n          if (id.includes('node_modules/lucide-react/')) {\n            return 'icons-vendor';\n          }\n\n          // Internationalization\n          if (id.includes('node_modules/i18next/') ||\n              id.includes('node_modules/react-i18next/')) {\n            return 'i18n-vendor';\n          }\n\n          // Heavy libraries - load only when needed\n          // face-api.js is ~1.5MB minified - MUST be lazy loaded\n          if (id.includes('node_modules/face-api.js/') ||\n              id.includes('node_modules/@vladmandic/face-api/') ||\n              id.includes('node_modules/@tensorflow/')) {\n            return 'face-detection';\n          }\n\n          // Chart libraries - only needed for analytics pages\n          if (id.includes('node_modules/recharts/') ||\n              id.includes('node_modules/chart.js/') ||\n              id.includes('node_modules/d3/') ||\n              id.includes('node_modules/d3-')) {\n            return 'charts-vendor';\n          }\n\n          // Rich text editors - only for invitation/comment editing\n          if (id.includes('node_modules/tiptap') ||\n              id.includes('node_modules/@tiptap/') ||\n              id.includes('node_modules/prosemirror') ||\n              id.includes('node_modules/@prosemirror/')) {\n            return 'editor-vendor';\n          }\n\n          // Date/time libraries\n          if (id.includes('node_modules/date-fns/') ||\n              id.includes('node_modules/dayjs/') ||\n              id.includes('node_modules/moment/')) {\n            return 'date-vendor';\n          }\n\n          // Form validation\n          if (id.includes('node_modules/zod/') ||\n              id.includes('node_modules/react-hook-form/')) {\n            return 'form-vendor';\n          }\n\n          // Upload/file handling\n          if (id.includes('node_modules/tus-js-client/') ||\n              id.includes('node_modules/uppy/') ||\n              id.includes('node_modules/@uppy/')) {\n            return 'upload-vendor';\n          }\n\n          // PDF generation\n          if (id.includes('node_modules/jspdf/') ||\n              id.includes('node_modules/pdfmake/') ||\n              id.includes('node_modules/html2canvas/')) {\n            return 'pdf-vendor';\n          }\n\n          // Route-based code splitting for pages\n          // Admin section pages - only loaded for admin users\n          if (id.includes('/src/pages/admin/')) {\n            return 'admin-pages';\n          }\n\n          // Workspace section pages - main authenticated area\n          if (id.includes('/src/pages/workspace/')) {\n            return 'workspace-pages';\n          }\n\n          // Settings pages\n          if (id.includes('/src/pages/settings/')) {\n            return 'settings-pages';\n          }\n\n          // Onboarding flow pages\n          if (id.includes('/src/pages/onboarding/')) {\n            return 'onboarding-pages';\n          }\n\n          // Public/marketing pages\n          if (id.includes('/src/pages/public/')) {\n            return 'public-pages';\n          }\n\n          // Feature-specific components that are heavy\n          if (id.includes('/src/components/features/gallery/')) {\n            return 'gallery-components';\n          }\n\n          if (id.includes('/src/components/features/upload/')) {\n            return 'upload-components';\n          }\n\n          if (id.includes('/src/components/features/invitations/')) {\n            return 'invitation-components';\n          }\n\n          // Landing page components\n          if (id.includes('/src/components/landing/')) {\n            return 'landing-components';\n          }\n\n          // Shared packages\n          if (id.includes('packages/shared-')) {\n            return 'shared-packages';\n          }\n        },\n      },\n    },\n    // Increase chunk size warning limit slightly for vendor chunks\n    chunkSizeWarningLimit: 600,\n  },\n  // Optimize dependencies that are pre-bundled\n  optimizeDeps: {\n    include: [\n      'react',\n      'react-dom',\n      'react-router-dom',\n      '@tanstack/react-query',\n      'framer-motion',\n      'lucide-react',\n    ],\n    // Exclude heavy libraries that should be lazy loaded\n    exclude: [\n      'face-api.js',\n    ],\n  },\n  test: {\n    globals: true,\n    environment: 'jsdom',\n    setupFiles: ['./src/test/setup.ts'],\n    css: true,\n    exclude: ['**/node_modules/**', '**/dist/**', 'tests/e2e/**'],\n  },\n});\n"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "completed",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "completed",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "in_progress",
      "activeForm": "Verifying implementation"
    }
  ]
}

Now let me verify the implementation by checking if there are any other files that might import face-api.js directly:

🔧 Tool: Grep
Input: {
  "pattern": "from ['\"]face-api\\.js['\"]|import \\* as faceapi from",
  "path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src",
  "output_mode": "content"
}

No direct imports of face-api.js remain. Let me also verify that the services are properly exporting from the new module:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\index.ts"
}

Good, the face detection services are not exported from the barrel file, which is correct since they should only be imported directly where needed. Now let me add the face API loader to ensure the exports are properly set up:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\faceApiLoader.ts"
}

Now let me check the PeoplePage to see if there's an opportunity to preload face-api.js when the user is likely to use it:

🔧 Tool: Grep
Input: {
  "pattern": "faceDetectionService|faceApiService|FrontendFaceService",
  "path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\pages\\workspace\\PeoplePage.tsx",
  "output_mode": "content"
}

I see that `PeoplePage` uses `faceApiService` (different from `faceDetectionService`). Let me check that service:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive\\frontend\\src\\services\\faceApiService.ts"
}

This `faceApiService` is different - it's a pure API client that calls backend endpoints, not the face-api.js library. It doesn't need modification since it doesn't import face-api.js.

Let me run TypeScript compilation to verify there are no type errors:

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npx tsc --noEmit 2>&1 | head -50",
  "description": "Check TypeScript compilation",
  "timeout": 60000
}

TypeScript compiles without errors. Now let me run the build to verify the chunking works:

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npm run build 2>&1 | tail -80",
  "description": "Build frontend to verify code splitting",
  "timeout": 120000
}

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npm run build 2>&1",
  "description": "Build frontend to verify code splitting",
  "timeout": 180000
}

Let me run with more verbose output:

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npx tsc 2>&1",
  "description": "Run TypeScript compiler",
  "timeout": 120000
}

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npx tsc 2>&1 || echo \"tsc completed with errors\"",
  "description": "Run TypeScript compiler and show errors",
  "timeout": 120000
}

🔧 Tool: Bash
Input: {
  "command": "cd C:/Users/admin/Desktop/RawDrive/frontend && npx vite build 2>&1",
  "description": "Run Vite build",
  "timeout": 180000
}

The build completed successfully. Let me analyze the results:

**Successful Code Splitting Chunks Created:**

| Chunk | Size | Purpose |
|-------|------|---------|
| `face-detection` | 664.25 KB | face-api.js - **now separate!** |
| `react-vendor` | 206.41 KB | React core libraries |
| `animation-vendor` | 120.09 KB | Framer Motion |
| `icons-vendor` | 82.35 KB | Lucide icons |
| `query-vendor` | 40.87 KB | TanStack Query |
| `i18n-vendor` | 49.25 KB | i18next |
| `date-vendor` | 49.19 KB | date-fns |
| `form-vendor` | 31.10 KB | zod, react-hook-form |
| `shared-packages` | 7.31 KB | @rawdrive/shared-* |
| `admin-pages` | 281.61 KB | Admin section |
| `public-pages` | 254.78 KB | Public pages |
| `workspace-pages` | 683.61 KB | Workspace pages |
| `onboarding-pages` | 43.52 KB | Onboarding flow |
| `settings-pages` | 181.09 KB | Settings pages |
| `gallery-components` | 403.27 KB | Gallery features |
| `upload-components` | 1,376.50 KB | Upload features |
| `invitation-components` | 138.60 KB | Invitation features |
| `landing-components` | 198.40 KB | Landing page |

The key result: **`face-detection` (664.25 KB) is now a separate lazy-loaded chunk!** This won't be loaded in the main bundle - it will only be loaded when face detection is actually used.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Explore current routing structure and bundle setup",
      "status": "completed",
      "activeForm": "Exploring current routing structure and bundle setup"
    },
    {
      "content": "Create lazy-loadable face-api.js module wrapper",
      "status": "completed",
      "activeForm": "Creating lazy-loadable face-api.js module wrapper"
    },
    {
      "content": "Update faceDetectionService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating faceDetectionService to use dynamic imports"
    },
    {
      "content": "Update FrontendFaceService to use dynamic imports",
      "status": "completed",
      "activeForm": "Updating FrontendFaceService to use dynamic imports"
    },
    {
      "content": "Update Lightbox component to lazy-load face detection",
      "status": "completed",
      "activeForm": "Updating Lightbox component to lazy-load face detection"
    },
    {
      "content": "Configure Vite for enhanced route-based code splitting",
      "status": "completed",
      "activeForm": "Configuring Vite for enhanced route-based code splitting"
    },
    {
      "content": "Verify implementation",
      "status": "completed",
      "activeForm": "Verifying implementation"
    }
  ]
}

<summary>
## Summary: Route-based Code Splitting with Lazy Loading

### Changes Implemented
1. **Created `faceApiLoader.ts`** - A new module that dynamically imports face-api.js using `import()` syntax, ensuring the ~1.5MB library is only loaded when face detection features are actually used

2. **Updated `faceDetectionService.ts`** - Replaced static `import * as faceapi from 'face-api.js'` with dynamic loading via `loadFaceApi()`. The `getDistance` method is now async to support lazy loading

3. **Updated `FrontendFaceService.ts`** - Same pattern: replaced static import with dynamic loading. The `drawDetections` method is now async

4. **Enhanced `vite.config.ts`** - Comprehensive code splitting configuration:
   - **Vendor chunks**: react-vendor, animation-vendor, query-vendor, ui-vendor, icons-vendor, i18n-vendor, date-vendor, form-vendor, upload-vendor, pdf-vendor
   - **Heavy library chunks**: face-detection (face-api.js), charts-vendor, editor-vendor
   - **Route-based chunks**: admin-pages, workspace-pages, public-pages, onboarding-pages, settings-pages
   - **Feature chunks**: gallery-components, upload-components, invitation-components, landing-components, shared-packages

### Files Modified
- `frontend/src/services/faceApiLoader.ts` (new)
- `frontend/src/services/faceDetectionService.ts`
- `frontend/src/services/FrontendFaceService.ts`
- `frontend/vite.config.ts`

### Build Results
The build now produces separate chunks:
- **`face-detection-*.js`** (664 KB) - Only loaded when face detection is used
- **`admin-pages-*.js`** (282 KB) - Only loaded for admin users
- **`workspace-pages-*.js`** (684 KB) - Only loaded for authenticated workspace users
- **`public-pages-*.js`** (255 KB) - Landing and marketing pages
- **`onboarding-pages-*.js`** (44 KB) - Only during onboarding
- Multiple vendor chunks for better caching

### Notes for Developer
- face-api.js is now completely lazy-loaded - it won't be included in the initial bundle
- The `loadFaceApi()` function caches the module after first load, so subsequent calls are instant
- Use `preloadFaceApi()` to preload the library in the background if you anticipate the user will use face detection
- The routes were already using React's `lazy()` - this implementation enhances that with Vite-level chunking
- Some chunks (upload-components at 1.4MB, workspace-pages at 684KB) could benefit from further splitting in future iterations
</summary>