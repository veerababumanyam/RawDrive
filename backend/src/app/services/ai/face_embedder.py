"""Face Embedder service using ArcFace (buffalo_l) ONNX model.

This module provides 512-dimensional face embeddings using the InsightFace ArcFace model
(w600k_r50.onnx) running via OpenCV DNN. This enables local face recognition and clustering.
"""

import logging
import os
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from typing import Optional
import asyncio

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# InsightFace Buffalo_L Model Pack (contains w600k_r50.onnx and det_10g.onnx)
MODEL_URL = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_l.zip"
MODEL_DIR = Path("/app/models/face_recognition")
MODEL_FILENAME = "w600k_r50.onnx"

class FaceEmbedder:
    """Generates face embeddings using ArcFace ONNX model."""
    
    def __init__(self):
        self._net = None
        self._initialized = False
        self._init_lock = asyncio.Lock()
        
    async def ensure_initialized(self):
        """Ensure the model is downloaded and loaded."""
        if self._initialized:
            return
            
        async with self._init_lock:
            if self._initialized:
                return
                
            await self._load_model()
            self._initialized = True
            
    async def _load_model(self):
        """Download and load the ONNX model."""
        try:
            MODEL_DIR.mkdir(parents=True, exist_ok=True)
            model_path = MODEL_DIR / MODEL_FILENAME
            
            if not model_path.exists():
                logger.info(f"Downloading face recognition model from {MODEL_URL}...")
                zip_path = MODEL_DIR / "buffalo_l.zip"
                
                # Download zip
                await asyncio.to_thread(
                    urllib.request.urlretrieve, MODEL_URL, str(zip_path)
                )
                
                # Extract
                logger.info("Extracting model...")
                with zipfile.ZipFile(zip_path, 'r') as z:
                    z.extractall(MODEL_DIR)
                    
                # Cleanup zip
                zip_path.unlink()
                logger.info("Model extracted successfully.")
                
            # Load model
            logger.info(f"Loading ONNX model from {model_path}...")
            self._net = cv2.dnn.readNetFromONNX(str(model_path))
            logger.info("Face recognition model loaded.")
            
        except Exception as e:
            logger.error(f"Failed to load face embedder model: {e}")
            raise RuntimeError(f"Face embedder initialization failed: {e}")

    async def generate_embedding(self, face_crop: np.ndarray) -> Optional[list[float]]:
        """Generate 512-d embedding for a face crop.
        
        Args:
            face_crop: BGR image numpy array of the face
            
        Returns:
            List of 512 floats (normalized) or None if failed
        """
        if face_crop is None or face_crop.size == 0:
            return None
            
        await self.ensure_initialized()
        return await asyncio.to_thread(self._generate_sync, face_crop)
        
    def _generate_sync(self, face_crop: np.ndarray) -> list[float]:
        """Run synchronous inference."""
        try:
            # Preprocessing for ArcFace
            # 1. Resize to 112x112
            # 2. Normalize (pixel - 127.5) / 127.5
            blob = cv2.dnn.blobFromImage(
                face_crop,
                1.0 / 127.5,
                (112, 112),
                (127.5, 127.5, 127.5),
                swapRB=True # InsightFace models trained on RGB or BGR? 
                            # cv2.imread is BGR. blobFromImage default swapRB=False (so input BGR).
                            # InsightFace usually expects RGB. So swapRB=True.
            )
            
            self._net.setInput(blob)
            embedding = self._net.forward()
            
            # Result is (1, 512)
            embedding = embedding.flatten()
            
            # Normalize to unit length (L2 norm)
            norm = np.linalg.norm(embedding)
            if norm > 0:
                embedding /= norm
                
            return embedding.tolist()
            
        except Exception as e:
            logger.warning(f"Embedding generation failed: {e}")
            return None

# Singleton
_embedder: Optional[FaceEmbedder] = None

def get_face_embedder() -> FaceEmbedder:
    global _embedder
    if _embedder is None:
        _embedder = FaceEmbedder()
    return _embedder
