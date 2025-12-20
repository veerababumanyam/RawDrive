import * as faceapi from 'face-api.js';

export interface Box {
    x: number;
    y: number;
    width: number;
    height: number;
}

export interface DetectedFace {
    box: Box;
    score: number;
    landmarks?: { x: number; y: number }[];
    descriptor?: Float32Array;
}

class FaceDetectionService {
    private static instance: FaceDetectionService;
    private isModelsLoaded = false;
    private loadPromise: Promise<void> | null = null;
    private readonly MODEL_URL = '/models'; // Assuming models are in public/models

    private constructor() { }

    public static getInstance(): FaceDetectionService {
        if (!FaceDetectionService.instance) {
            FaceDetectionService.instance = new FaceDetectionService();
        }
        return FaceDetectionService.instance;
    }

    /**
     * Load required models.
     * Ensures models are only loaded once.
     */
    public async loadModels(): Promise<void> {
        if (this.isModelsLoaded) return;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = (async () => {
            try {
                console.log('Loading face detection models...');
                await Promise.all([
                    faceapi.nets.ssdMobilenetv1.loadFromUri(this.MODEL_URL),
                    faceapi.nets.faceLandmark68Net.loadFromUri(this.MODEL_URL),
                    faceapi.nets.faceRecognitionNet.loadFromUri(this.MODEL_URL),
                ]);
                this.isModelsLoaded = true;
                console.log('Face detection models loaded');
            } catch (error) {
                console.error('Failed to load face detection models:', error);
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

        // Default options for SSD MobileNet V1
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

        let task = faceapi.detectAllFaces(image, options);

        if (withLandmarks) {
            task = task.withFaceLandmarks() as any;
        }

        if (withDescriptors) {
            // @ts-ignore - TS types can be tricky with the chaining
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
    public getDistance(descriptor1: Float32Array, descriptor2: Float32Array): number {
        return faceapi.euclideanDistance(descriptor1, descriptor2);
    }
}

export const faceDetectionService = FaceDetectionService.getInstance();
