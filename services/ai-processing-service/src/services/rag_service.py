"""
RAG Service for Multi-modal Reasoning

Orchestrates the retrieval-augmented generation process by:
1. Fetching images from URLs (thumbnails)
2. Optimizing images for Gemini (resizing/compression)
3. Calling Gemini Vision Service for reasoning
"""

import asyncio
import logging
from io import BytesIO
from typing import List, Optional

import httpx
from PIL import Image

from services.gemini_vision_service import get_gemini_vision_service

logger = logging.getLogger(__name__)

# Constants for image optimization
MAX_IMAGE_SIZE = (512, 512)  # Max dimension for reasoning thumbnails
JPEG_QUALITY = 80


class RAGService:
    """Service for orchestrating RAG operations."""

    def __init__(self):
        self.vision_service = get_gemini_vision_service()

    async def answer_question_with_images(
        self, 
        query: str, 
        image_urls: List[str], 
        api_key: Optional[str] = None
    ) -> str:
        """
        Answer a question based on a list of images.

        Args:
            query: The user's question
            image_urls: List of image URLs to analyze
            api_key: User's Gemini API key

        Returns:
            The answer from Gemini
        """
        if not image_urls:
            return "No images provided for analysis."

        try:
            # 1. Fetch and optimize images concurrently
            images_data = await self._fetch_and_optimize_images(image_urls)
            
            if not images_data:
                return "Failed to retrieve valid images for analysis."

            # 2. Call Gemini Vision
            # We construct a prompt that encourages specific reasoning
            reasoning_prompt = (
                f"User Question: {query}\n\n"
                "Please analyze the provided images to answer this question. "
                "Cite specific visual details where possible. "
                "If the images don't contain the answer, say so politely."
            )

            response = self.vision_service.reason_over_images(
                image_data_list=images_data,
                prompt=reasoning_prompt,
                api_key=api_key
            )

            return response

        except Exception as e:
            logger.error(f"RAG reasoning failed: {e}")
            raise

    async def _fetch_and_optimize_images(self, urls: List[str]) -> List[bytes]:
        """Fetch images from URLs and optimize them for the LLM."""
        
        async def fetch_one(client, url):
            try:
                resp = await client.get(url)
                resp.raise_for_status()
                return resp.content
            except Exception as e:
                logger.warning(f"Failed to fetch {url}: {e}")
                return None

        async with httpx.AsyncClient(timeout=10.0) as client:
            tasks = [fetch_one(client, url) for url in urls]
            results = await asyncio.gather(*tasks)

        # Process successful fetches
        optimized_images = []
        for img_bytes in results:
            if img_bytes:
                processed = self._optimize_image(img_bytes)
                if processed:
                    optimized_images.append(processed)
        
        return optimized_images

    def _optimize_image(self, image_data: bytes) -> Optional[bytes]:
        """Resize and compress image to save tokens."""
        try:
            with Image.open(BytesIO(image_data)) as img:
                # Convert to RGB (handle RGBA/P issues)
                if img.mode != "RGB":
                    img = img.convert("RGB")

                # Resize if larger than max
                img.thumbnail(MAX_IMAGE_SIZE, Image.Resampling.LANCZOS)

                # Save as JPEG to bytes
                output = BytesIO()
                img.save(output, format="JPEG", quality=JPEG_QUALITY)
                return output.getvalue()
        except Exception as e:
            logger.warning(f"Failed to optimize image: {e}")
            return None


_rag_service: Optional[RAGService] = None


def get_rag_service() -> RAGService:
    """Get singleton RAG service instance."""
    global _rag_service
    if _rag_service is None:
        _rag_service = RAGService()
    return _rag_service
