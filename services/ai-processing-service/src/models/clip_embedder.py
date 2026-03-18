"""CLIP Embedder Module

Generates CLIP embeddings for semantic image similarity search.
Uses OpenAI's CLIP-ViT-Base-Patch32 model for 512-dimensional embeddings.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import TYPE_CHECKING, List, Optional, Union

from config import get_settings

if TYPE_CHECKING:
    import numpy as np
    import torch
    from PIL import Image
    from transformers import CLIPModel, CLIPProcessor

logger = logging.getLogger(__name__)


class CLIPEmbedder:
    """CLIP-based image embedder for semantic similarity."""

    def __init__(self):
        """Initialize CLIP embedder (model loaded lazily)."""
        self.settings = get_settings()
        self.model = None
        self.processor = None
        self.device: Optional[str] = None
        self._initialized = False
        logger.info("CLIP embedder created (model will load on first use)")

    def _get_device(self) -> str:
        """Determine the best available device."""
        import torch

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

        from transformers import CLIPModel, CLIPProcessor

        self.device = self._get_device()
        logger.info(f"Loading CLIP model: {self.settings.CLIP_MODEL_NAME} (device: {self.device})")

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

    def embed_text(self, text: str) -> np.ndarray:
        """Generate CLIP text embedding for natural language query.

        Uses CLIP's text encoder to convert text to a 512-dimensional vector
        that is semantically aligned with image embeddings. This enables
        cross-modal similarity search (text-to-image retrieval).

        Args:
            text: Natural language text to embed (e.g., "sunset on beach",
                  "wedding ceremony", "portrait with bokeh")

        Returns:
            512-dimensional numpy array of float32 values, L2-normalized
            to unit length for cosine similarity computation.

        Raises:
            ValueError: If text is empty or None
            RuntimeError: If embedding generation fails
        """
        self._ensure_initialized()

        # Validate input
        if not text or not text.strip():
            logger.error("Empty text provided for embedding")
            raise ValueError("Text cannot be empty or whitespace only")

        # Clean and prepare text
        cleaned_text = text.strip()

        try:
            import numpy as np
            import torch

            # Tokenize text using CLIP processor
            # CLIP processor handles truncation automatically (max 77 tokens)
            inputs = self.processor(
                text=[cleaned_text],
                return_tensors="pt",
                padding=True,
                truncation=True,
                max_length=77  # CLIP's max context length
            )
            inputs = {k: v.to(self.device) for k, v in inputs.items()}

            # Generate text features with inference mode for performance
            with torch.no_grad():
                text_features = self.model.get_text_features(**inputs)
                # L2 normalize to unit vector for cosine similarity
                text_features = text_features / text_features.norm(dim=-1, keepdim=True)

            # Convert to numpy and return
            embedding = text_features[0].cpu().numpy().astype(np.float32)

            logger.debug(
                f"Generated CLIP text embedding for query: "
                f"'{cleaned_text[:50]}{'...' if len(cleaned_text) > 50 else ''}'"
            )
            return embedding

        except Exception as e:
            logger.error(
                f"Failed to generate CLIP text embedding for "
                f"'{cleaned_text[:30]}...': {e}"
            )
            raise RuntimeError(f"CLIP text embedding failed: {e}")

    def embed_image(self, image_path: Union[str, Path]):
        """Generate CLIP embedding for a single image."""
        self._ensure_initialized()

        try:
            import torch
            from PIL import Image

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

    def embed_images(self, image_paths: List[Union[str, Path]]) -> list:
        """Generate CLIP embeddings for multiple images (batched)."""
        self._ensure_initialized()

        if not image_paths:
            return []

        try:
            import torch
            from PIL import Image

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
    def cosine_similarity(embedding1, embedding2) -> float:
        """Calculate cosine similarity between two embeddings."""
        import numpy as np

        emb1_norm = embedding1 / np.linalg.norm(embedding1)
        emb2_norm = embedding2 / np.linalg.norm(embedding2)
        similarity = np.dot(emb1_norm, emb2_norm)
        return float(np.clip(similarity, 0.0, 1.0))

    @staticmethod
    def embedding_to_list(embedding) -> List[float]:
        """Convert numpy embedding to Python list for database storage."""
        return embedding.tolist()

    @staticmethod
    def list_to_embedding(embedding_list: List[float]):
        """Convert Python list back to numpy embedding."""
        import numpy as np

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
                import torch
                torch.cuda.empty_cache()

            logger.info("CLIP model unloaded from memory")


_clip_embedder: Optional[CLIPEmbedder] = None


def get_clip_embedder() -> CLIPEmbedder:
    """Get singleton CLIP embedder instance."""
    global _clip_embedder
    if _clip_embedder is None:
        _clip_embedder = CLIPEmbedder()
    return _clip_embedder
