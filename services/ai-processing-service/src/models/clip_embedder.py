"""
CLIP Embedder Module

Generates CLIP embeddings for semantic image similarity search.
Uses OpenAI's CLIP-ViT-Base-Patch32 model for 512-dimensional embeddings.
"""

import logging
from pathlib import Path
from typing import List, Optional, Union

import numpy as np
import torch
from PIL import Image
from transformers import CLIPModel, CLIPProcessor

from config import get_settings

logger = logging.getLogger(__name__)


class CLIPEmbedder:
    """CLIP-based image embedder for semantic similarity."""

    def __init__(self):
        """Initialize CLIP embedder (model loaded lazily)."""
        self.settings = get_settings()
        self.model: Optional[CLIPModel] = None
        self.processor: Optional[CLIPProcessor] = None
        self.device = self._get_device()
        self._initialized = False
        logger.info(f"CLIP embedder initialized (device: {self.device})")

    def _get_device(self) -> str:
        """Determine the best available device."""
        if torch.cuda.is_available():
            return "cuda"
        elif torch.backends.mps.is_available():
            return "mps"
        else:
            return "cpu"

    def _ensure_initialized(self) -> None:
        """Lazy load CLIP model and processor."""
        if self._initialized:
            return

        logger.info(f"Loading CLIP model: {self.settings.CLIP_MODEL_NAME}")

        try:
            self.model = CLIPModel.from_pretrained(self.settings.CLIP_MODEL_NAME)
            self.processor = CLIPProcessor.from_pretrained(self.settings.CLIP_MODEL_NAME)
            self.model.to(self.device)
            self.model.set_training_mode(False)
            self._initialized = True
            logger.info("CLIP model loaded successfully")
        except Exception as e:
            logger.error(f"Failed to load CLIP model: {e}")
            raise RuntimeError(f"CLIP model initialization failed: {e}")

    def embed_image(self, image_path: Union[str, Path]) -> np.ndarray:
        """Generate CLIP embedding for a single image."""
        self._ensure_initialized()

        try:
            image = Image.open(image_path).convert("RGB")
            inputs = self.processor(images=image, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            embedding = image_features[0].cpu().numpy()
            logger.debug(f"Generated CLIP embedding for {image_path}")
            return embedding

        except FileNotFoundError:
            logger.error(f"Image file not found: {image_path}")
            raise
        except Exception as e:
            logger.error(f"Failed to generate CLIP embedding: {e}")
            raise RuntimeError(f"CLIP embedding failed: {e}")

    def embed_images(self, image_paths: List[Union[str, Path]]) -> List[np.ndarray]:
        """Generate CLIP embeddings for multiple images (batched)."""
        self._ensure_initialized()

        if not image_paths:
            return []

        try:
            images = []
            for path in image_paths:
                try:
                    img = Image.open(path).convert("RGB")
                    images.append(img)
                except Exception as e:
                    logger.warning(f"Failed to load image {path}: {e}")
                    images.append(None)

            valid_images = [img for img in images if img is not None]
            valid_indices = [i for i, img in enumerate(images) if img is not None]

            if not valid_images:
                raise RuntimeError("No valid images to process")

            inputs = self.processor(images=valid_images, return_tensors="pt")
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            with torch.no_grad():
                image_features = self.model.get_image_features(**inputs)
                image_features = image_features / image_features.norm(dim=-1, keepdim=True)

            embeddings_array = image_features.cpu().numpy()

            result = [None] * len(image_paths)
            for idx, valid_idx in enumerate(valid_indices):
                result[valid_idx] = embeddings_array[idx]

            logger.info(f"Generated {len(valid_images)} CLIP embeddings")
            return result

        except Exception as e:
            logger.error(f"Failed to generate batch CLIP embeddings: {e}")
            raise RuntimeError(f"Batch CLIP embedding failed: {e}")

    @staticmethod
    def cosine_similarity(embedding1: np.ndarray, embedding2: np.ndarray) -> float:
        """Calculate cosine similarity between two embeddings."""
        emb1_norm = embedding1 / np.linalg.norm(embedding1)
        emb2_norm = embedding2 / np.linalg.norm(embedding2)
        similarity = np.dot(emb1_norm, emb2_norm)
        return float(np.clip(similarity, 0.0, 1.0))

    @staticmethod
    def embedding_to_list(embedding: np.ndarray) -> List[float]:
        """Convert numpy embedding to Python list for database storage."""
        return embedding.tolist()

    @staticmethod
    def list_to_embedding(embedding_list: List[float]) -> np.ndarray:
        """Convert Python list back to numpy embedding."""
        return np.array(embedding_list, dtype=np.float32)

    def unload_model(self) -> None:
        """Unload model from memory."""
        if self._initialized:
            del self.model
            del self.processor
            self.model = None
            self.processor = None
            self._initialized = False

            if self.device == "cuda":
                torch.cuda.empty_cache()

            logger.info("CLIP model unloaded from memory")


_clip_embedder: Optional[CLIPEmbedder] = None


def get_clip_embedder() -> CLIPEmbedder:
    """Get singleton CLIP embedder instance."""
    global _clip_embedder
    if _clip_embedder is None:
        _clip_embedder = CLIPEmbedder()
    return _clip_embedder
