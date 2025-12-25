
import * as faceapi from 'face-api.js';

export interface DetectedFace {
    box: {
        x: number;
        y: number;
        width: number;
        height: number;
    };
    score: number;
}

export class FrontendFaceService {
    private modelsLoaded = false;
    private loadPromise: Promise<void> | null = null;

    constructor(private modelsPath = '/models') { }

    /**
     * Ensure models are loaded. Safe to call multiple times.
     */
    async loadModels(): Promise<void> {
        if (this.modelsLoaded) return;

        if (!this.loadPromise) {
            this.loadPromise = (async () => {
                try {
                    // Load the SSD MobileNet V1 model (good balance of speed/accuracy)
                    // and landmark/recognition models if needed later
                    await Promise.all([
                        faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelsPath),
                        faceapi.nets.faceLandmark68Net.loadFromUri(this.modelsPath),
                        faceapi.nets.faceRecognitionNet.loadFromUri(this.modelsPath)
                    ]);
                    this.modelsLoaded = true;
                    console.log('FaceAPI models loaded');
                } catch (error) {
                    console.error('Failed to load FaceAPI models:', error);
                    this.loadPromise = null; // Allow retry
                    throw error;
                }
            })();
        }

        return this.loadPromise;
    }

    /**
     * Detect faces in an HTML image, video, or canvas element.
     */
    async detectFaces(
        input: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement
    ): Promise<DetectedFace[]> {
        await this.loadModels();

        // Use SSD MobileNet V1 options
        const options = new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 });

        const detections = await faceapi.detectAllFaces(input, options);

        return detections.map(d => ({
            box: {
                x: d.box.x,
                y: d.box.y,
                width: d.box.width,
                height: d.box.height
            },
            score: d.score
        }));
    }

    /**
     * Draw detections on a canvas.
     */
    drawDetections(
        canvas: HTMLCanvasElement,
        detections: DetectedFace[],
        dims: { width: number; height: number }
    ) {
        faceapi.matchDimensions(canvas, dims);
        const faceApiDetections = detections.map(d =>
            new faceapi.FaceDetection(
                d.score,
                new faceapi.Rect(d.box.x, d.box.y, d.box.width, d.box.height),
                { width: dims.width, height: dims.height }
            )
        );
        faceapi.draw.drawDetections(canvas, faceApiDetections);
    }
}

export const frontendFaceService = new FrontendFaceService();
