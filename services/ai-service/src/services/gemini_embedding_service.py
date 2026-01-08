"""Gemini embedding service for semantic similarity detection.

Uses customer-configured Google Gemini API keys to generate embeddings for client data.
Phase 2: AI Duplicate Detection

This service follows RawDrive's architecture requirement:
- Uses ONLY customer-configured Gemini API keys
- No local AI models (no transformers, torch, CLIP)
- Follows the same pattern as emotion detection and face detection
"""

from __future__ import annotations

import asyncio
import logging
import math
from typing import List, Dict, Optional, Tuple
from uuid import UUID

logger = logging.getLogger(__name__)


class GeminiEmbeddingError(Exception):
    """Base exception for Gemini embedding errors."""
    pass


class GeminiNotConfiguredError(GeminiEmbeddingError):
    """Raised when Gemini API is not configured."""
    pass


class GeminiEmbeddingService:
    """Service for generating Gemini embeddings for client data.

    Uses customer-configured Gemini API keys to generate semantic embeddings
    that can be used for duplicate client detection.

    Attributes:
        embedding_dim: Embedding dimension (768 for Gemini)
        _gen_ai: Lazily initialized Gemini client
        _client_init_lock: Lock to prevent concurrent initialization
        _config_service: Configuration service for credentials
        _model_name: Embedding model name
    """

    def __init__(self, config_service=None):
        """Initialize Gemini embedding service.

        Args:
            config_service: Optional configuration service for loading credentials.
                          If None, will be created when needed.
        """
        self._config_service = config_service
        self._gen_ai = None
        self._client_init_lock = asyncio.Lock()
        self._model_name = "models/embedding-001"  # Gemini's text embedding model
        self._api_key: Optional[str] = None
        self.embedding_dim = 768  # Gemini embedding dimension

    async def _ensure_client(self):
        """Lazily initialize the Gemini client.

        Returns:
            Initialized google.generativeai module

        Raises:
            GeminiNotConfiguredError: If API key is not available
            GeminiEmbeddingError: If client initialization fails
        """
        if self._gen_ai is not None:
            return self._gen_ai

        async with self._client_init_lock:
            # Double-check after acquiring lock
            if self._gen_ai is not None:
                return self._gen_ai

            await self._initialize_client()
            return self._gen_ai

    async def _initialize_client(self) -> None:
        """Initialize the Gemini client with customer API key.

        Raises:
            GeminiNotConfiguredError: If API key is not available
            GeminiEmbeddingError: If client initialization fails
        """
        try:
            # Load credentials from configuration service
            if not self._config_service:
                # Create default config service if not provided
                from backend.src.app.services.face_configuration_service import (
                    get_face_configuration_service
                )
                self._config_service = get_face_configuration_service()

            credentials = await self._config_service.get_provider_credentials("gemini")

            self._api_key = credentials.get("api_key")
            if not self._api_key:
                raise GeminiNotConfiguredError(
                    "Gemini API key not configured. "
                    "Please configure GEMINI_API_KEY in admin settings or environment."
                )

            # Get embedding model name (use default if not specified)
            self._model_name = credentials.get(
                "embedding_model",
                "models/embedding-001"
            )

            # Import Google Generative AI library
            try:
                import google.generativeai as genai
            except ImportError as e:
                raise GeminiEmbeddingError(
                    "Google Generative AI library not installed. "
                    "Install with: pip install google-generativeai"
                ) from e

            # Configure the API key
            genai.configure(api_key=self._api_key)

            # Store the genai module for embedding generation
            self._gen_ai = genai

            logger.info(
                "Gemini embedding client initialized",
                extra={
                    "model": self._model_name,
                    "embedding_dim": self.embedding_dim,
                },
            )

        except GeminiNotConfiguredError:
            raise
        except Exception as e:
            logger.error(
                "Failed to initialize Gemini client",
                extra={"error": str(e)},
            )
            raise GeminiEmbeddingError(
                f"Failed to initialize Gemini client: {str(e)}"
            ) from e

    async def generate_client_embedding(
        self,
        client_data: Dict[str, str]
    ) -> List[float]:
        """Generate 768-d embedding for client data using Gemini API.

        Constructs a text representation from client fields (name, email, phone, address)
        and generates a semantic embedding using customer's Gemini API key.

        Args:
            client_data: Dictionary with client fields (name, email, phone, address)

        Returns:
            768-dimensional embedding vector

        Raises:
            GeminiEmbeddingError: If embedding generation fails

        Example:
            >>> service = GeminiEmbeddingService()
            >>> embedding = await service.generate_client_embedding({
            ...     "name": "John Smith",
            ...     "email": "john@example.com",
            ...     "phone": "+1-555-1234",
            ...     "address": "123 Main St, City, State"
            ... })
            >>> len(embedding)
            768
        """
        await self._ensure_client()

        # Construct text from client data
        text = self._construct_client_text(client_data)

        try:
            # Generate embedding using Gemini API
            # Run in thread pool since the API may be synchronous
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None,
                lambda: self._gen_ai.embed_content(
                    model=self._model_name,
                    content=text,
                    task_type="semantic_similarity",
                    title="Client duplicate detection"
                )
            )

            # Extract embedding vector
            embedding = result['embedding']

            logger.debug(
                f"Generated embedding for client",
                extra={
                    "text_length": len(text),
                    "embedding_dim": len(embedding),
                }
            )

            return embedding

        except Exception as e:
            logger.error(
                "Failed to generate Gemini embedding",
                extra={"error": str(e), "text": text[:100]}
            )
            raise GeminiEmbeddingError(
                f"Failed to generate embedding: {str(e)}"
            ) from e

    def _construct_client_text(self, client_data: Dict[str, str]) -> str:
        """Construct text representation from client data.

        Combines client fields into a formatted text string for embedding.

        Args:
            client_data: Dictionary with client fields

        Returns:
            Formatted text string

        Example:
            >>> text = service._construct_client_text({
            ...     "name": "John Smith",
            ...     "email": "john@example.com"
            ... })
            >>> print(text)
            "Name: John Smith | Email: john@example.com"
        """
        parts = []

        # Priority order for fields
        field_order = ["name", "email", "phone", "address", "company", "notes"]

        for key in field_order:
            if client_data.get(key):
                # Capitalize field name
                field_name = key.replace("_", " ").title()
                parts.append(f"{field_name}: {client_data[key]}")

        # Add any additional fields not in priority order
        for key, value in client_data.items():
            if key not in field_order and value:
                field_name = key.replace("_", " ").title()
                parts.append(f"{field_name}: {value}")

        text = " | ".join(parts) if parts else "Client"

        return text

    async def batch_generate_embeddings(
        self,
        clients_data: List[Tuple[str, Dict[str, str]]]  # [(client_id, client_data)]
    ) -> List[Tuple[str, List[float], Optional[str]]]:
        """Generate embeddings for multiple clients.

        Args:
            clients_data: List of (client_id, client_data) tuples

        Returns:
            List of (client_id, embedding, error_message) tuples.
            If successful, error_message is None.

        Example:
            >>> clients = [
            ...     ("uuid1", {"name": "John", "email": "john@example.com"}),
            ...     ("uuid2", {"name": "Jane", "email": "jane@example.com"}),
            ... ]
            >>> results = await service.batch_generate_embeddings(clients)
            >>> for client_id, embedding, error in results:
            ...     if error:
            ...         print(f"{client_id}: ERROR - {error}")
            ...     else:
            ...         print(f"{client_id}: {len(embedding)}-d embedding")
        """
        results = []

        for client_id, client_data in clients_data:
            try:
                embedding = await self.generate_client_embedding(client_data)
                results.append((client_id, embedding, None))

            except GeminiEmbeddingError as e:
                error_msg = str(e)
                logger.warning(f"Failed to embed client {client_id}: {error_msg}")
                results.append((client_id, [], error_msg))

        return results

    def compute_cosine_similarity(
        self,
        embedding1: List[float],
        embedding2: List[float]
    ) -> float:
        """Compute cosine similarity between two embeddings.

        Cosine similarity ranges from -1 to 1:
        - 1.0 = identical vectors
        - 0.0 = orthogonal (no similarity)
        - -1.0 = opposite vectors

        Args:
            embedding1: First embedding vector
            embedding2: Second embedding vector

        Returns:
            Cosine similarity score (0-1 normalized)

        Example:
            >>> emb1 = [0.5, 0.5, 0.5, 0.5]
            >>> emb2 = [0.5, 0.5, 0.4, 0.6]
            >>> similarity = service.compute_cosine_similarity(emb1, emb2)
            >>> print(f"{similarity:.2%}")
            "98.75%"
        """
        if len(embedding1) != len(embedding2):
            raise ValueError(
                f"Embedding dimensions do not match: "
                f"{len(embedding1)} vs {len(embedding2)}"
            )

        # Compute dot product
        dot_product = sum(a * b for a, b in zip(embedding1, embedding2))

        # Compute magnitudes
        magnitude1 = math.sqrt(sum(a * a for a in embedding1))
        magnitude2 = math.sqrt(sum(b * b for b in embedding2))

        # Avoid division by zero
        if magnitude1 == 0 or magnitude2 == 0:
            return 0.0

        # Compute cosine similarity
        cosine_sim = dot_product / (magnitude1 * magnitude2)

        # Normalize to 0-1 range (handle floating point errors)
        cosine_sim = max(-1.0, min(1.0, cosine_sim))

        # Convert from [-1, 1] to [0, 1]
        normalized = (cosine_sim + 1.0) / 2.0

        return normalized

    async def find_similar_clients(
        self,
        target_embedding: List[float],
        all_embeddings: List[Tuple[str, List[float]]],  # [(client_id, embedding)]
        threshold: float = 0.75,
        max_results: Optional[int] = None
    ) -> List[Tuple[str, float]]:
        """Find all clients similar to target embedding.

        Args:
            target_embedding: Embedding to compare against
            all_embeddings: List of (client_id, embedding) tuples to search
            threshold: Minimum similarity threshold (0.0-1.0)
            max_results: Maximum number of results to return (None = all)

        Returns:
            List of (client_id, similarity_score) tuples above threshold,
            sorted by similarity (descending)

        Example:
            >>> all_embeddings = [
            ...     ("uuid1", [0.5, 0.5, ...]),  # Similar
            ...     ("uuid2", [0.1, 0.2, ...]),  # Different
            ... ]
            >>> similar = await service.find_similar_clients(
            ...     target_embedding, all_embeddings, threshold=0.8
            ... )
            >>> print(similar)
            [("uuid1", 0.95)]
        """
        results = []

        for client_id, embedding in all_embeddings:
            try:
                similarity = self.compute_cosine_similarity(
                    target_embedding,
                    embedding
                )

                if similarity >= threshold:
                    results.append((client_id, similarity))

            except ValueError as e:
                logger.warning(
                    f"Failed to compare embedding for {client_id}: {e}"
                )
                continue

        # Sort by similarity (descending)
        results.sort(key=lambda x: x[1], reverse=True)

        # Limit results if requested
        if max_results is not None:
            results = results[:max_results]

        return results

    def is_likely_duplicate(
        self,
        similarity: float,
        strict: bool = False
    ) -> bool:
        """Determine if similarity score indicates likely duplicate.

        Args:
            similarity: Similarity score (0-1)
            strict: If True, use stricter threshold

        Returns:
            True if likely duplicate

        Thresholds:
        - Strict mode: >= 0.90 (high-confidence matches)
        - Normal mode: >= 0.75 (accounting for typos and variations)
        """
        threshold = 0.90 if strict else 0.75
        return similarity >= threshold


# Singleton instance for dependency injection
_gemini_embedding_service: Optional[GeminiEmbeddingService] = None


def get_gemini_embedding_service(config_service=None) -> GeminiEmbeddingService:
    """Get or create singleton Gemini embedding service instance.

    Args:
        config_service: Optional configuration service for credentials

    Returns:
        GeminiEmbeddingService instance
    """
    global _gemini_embedding_service

    if _gemini_embedding_service is None:
        _gemini_embedding_service = GeminiEmbeddingService(config_service)

    return _gemini_embedding_service
