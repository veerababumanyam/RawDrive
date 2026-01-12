/**
 * Face Detection Service
 *
 * Provides face detection capabilities using face-api.js.
 * The library is loaded lazily to reduce main bundle size by ~1.5MB.
 */

import { loadFaceApi, type Box, type DetectedFace } from './faceApiLoader';

export type { Box, DetectedFace };

class FaceDetectionService {
  private static instance: FaceDetectionService;
  private isModelsLoaded = false;
  private loadPromise: Promise<void> | null = null;
  private readonly MODEL_URL = '/models'; // Assuming models are in public/models

  private constructor() {}

  public static getInstance(): FaceDetectionService {
    if (!FaceDetectionService.instance) {
      FaceDetectionService.instance = new FaceDetectionService();
    }
    return FaceDetectionService.instance;
  }

  /**
   * Load required models.
   * Ensures models are only loaded once.
   * Also ensures face-api.js is loaded before loading models.
   */
  public async loadModels(): Promise<void> {
    if (this.isModelsLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      try {
        console.log('[FaceDetectionService] Loading face-api.js and models...');

        // First, dynamically load face-api.js
        const faceapi = await loadFaceApi();

        // Then load the models
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),
        ]);

        this.isModelsLoaded = true;
        console.log('[FaceDetectionService] Face detection models loaded');
      } catch (error) {
        console.error('[FaceDetectionService] Failed to load models:', error);
        this.loadPromise = null; // Allow retrying
        throw error;
      }
    })();

    return this.loadPromise;
  }

  /**
   * Detect faces in an image element.
   * @param image The image element (img, video, or canvas)
   * @param withLandmarks Whether to detect landmarks
   * @param withDescriptors Whether to compute face descriptors
   */
  public async detectFaces(
    image: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement,
    withLandmarks = true,
    withDescriptors = false
  ): Promise<DetectedFace[]> {
    if (!this.isModelsLoaded) {
      await this.loadModels();
    }

    // Get the already-loaded face-api module
    const faceapi = await loadFaceApi();

    // Default options for SSD MobileNet V1
    const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

    let task = faceapi.detectAllFaces(image, options);

    if (withLandmarks) {
      task = task.withFaceLandmarks() as any;
    }

    if (withDescriptors) {
      // @ts-expect-error - TS types can be tricky with the chaining
      task = task.withFaceDescriptors();
    }

    const results = await task;

    return results.map((res: any) => ({
      box: {
        x: res.detection.box.x,
        y: res.detection.box.y,
        width: res.detection.box.width,
        height: res.detection.box.height,
      },
      score: res.detection.score,
      landmarks: res.landmarks?.positions,
      descriptor: res.descriptor, // Float32Array
    }));
  }

  /**
   * Compare two face descriptors to see if they belong to the same person.
   * Returns distance (lower is better, < 0.6 is typical match threshold).
   */
  public async getDistance(
    descriptor1: Float32Array,
    descriptor2: Float32Array
  ): Promise<number> {
    const faceapi = await loadFaceApi();
    return faceapi.euclideanDistance(descriptor1, descriptor2);
  }
}

export const faceDetectionService = FaceDetectionService.getInstance();
