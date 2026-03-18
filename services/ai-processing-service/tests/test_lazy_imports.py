"""Tests for lazy ML imports (AIS-03).

Verifies that importing service modules does NOT trigger heavy library loads
(torch, cv2, transformers, numpy, PIL, pymilvus) at module import time.
"""

from __future__ import annotations

import importlib
import os
import sys

import pytest


def _clean_module(module_name: str, also_remove: list[str] | None = None):
    """Remove a module and its submodules from sys.modules."""
    to_remove = [k for k in sys.modules if k == module_name or k.startswith(f"{module_name}.")]
    if also_remove:
        to_remove.extend(k for k in sys.modules if k in also_remove)
    for k in to_remove:
        del sys.modules[k]


@pytest.fixture(autouse=True)
def _milvus_disabled(monkeypatch):
    monkeypatch.setenv("MILVUS_ENABLED", "false")
    monkeypatch.setenv("ENVIRONMENT", "test")


class TestClipEmbedderLazyImports:
    """Verify clip_embedder does not import torch/transformers at module level."""

    def test_no_torch_at_import(self):
        """Importing clip_embedder module does NOT trigger torch import."""
        # Remove cached modules
        _clean_module("models.clip_embedder")
        _clean_module("torch")

        # Ensure torch is NOT in sys.modules
        assert "torch" not in sys.modules, "torch was already loaded before test"

        # Import the module
        importlib.import_module("models.clip_embedder")

        # torch should still NOT be in sys.modules
        assert "torch" not in sys.modules, (
            "torch was imported at module load time by clip_embedder"
        )

    def test_no_transformers_at_import(self):
        """Importing clip_embedder module does NOT trigger transformers import."""
        _clean_module("models.clip_embedder")
        _clean_module("transformers")

        assert "transformers" not in sys.modules

        importlib.import_module("models.clip_embedder")

        assert "transformers" not in sys.modules, (
            "transformers was imported at module load time by clip_embedder"
        )


class TestRealEsrganLazyImports:
    """Verify real_esrgan does not import cv2/torch at module level."""

    def test_no_cv2_at_import(self):
        """Importing real_esrgan module does NOT trigger cv2 import."""
        _clean_module("models.real_esrgan")
        _clean_module("cv2")

        assert "cv2" not in sys.modules

        importlib.import_module("models.real_esrgan")

        assert "cv2" not in sys.modules, (
            "cv2 was imported at module load time by real_esrgan"
        )


class TestDatabaseLazyImports:
    """Verify core.database does not import pymilvus when MILVUS_ENABLED=false."""

    def test_no_pymilvus_at_import(self):
        """Importing core.database does NOT trigger pymilvus import when MILVUS_ENABLED=false."""
        _clean_module("core.database")
        _clean_module("pymilvus")
        _clean_module("services.milvus_service")

        assert "pymilvus" not in sys.modules

        importlib.import_module("core.database")

        assert "pymilvus" not in sys.modules, (
            "pymilvus was imported at module load time by core.database"
        )


class TestApiLayerLazyImports:
    """Verify api.v1 does not import cv2/numpy/PIL at module level.

    The import chain main.py -> api.v1.__init__ -> api.v1.faces must NOT
    trigger heavy ML library imports. These should only load when endpoint
    handler functions are actually called.
    """

    def test_no_cv2_at_api_import(self):
        """Importing api.v1 does NOT trigger cv2 import."""
        _clean_module("api.v1", also_remove=["api"])
        _clean_module("cv2")

        assert "cv2" not in sys.modules, "cv2 was already loaded before test"

        importlib.import_module("api.v1")

        assert "cv2" not in sys.modules, (
            "cv2 was imported at module load time by api.v1 (via faces.py)"
        )

    def test_no_numpy_at_api_import(self):
        """Importing api.v1 does NOT trigger numpy import."""
        _clean_module("api.v1", also_remove=["api"])
        _clean_module("numpy")

        assert "numpy" not in sys.modules, "numpy was already loaded before test"

        importlib.import_module("api.v1")

        assert "numpy" not in sys.modules, (
            "numpy was imported at module load time by api.v1 (via faces.py)"
        )

    def test_no_pil_at_api_import(self):
        """Importing api.v1 does NOT trigger PIL import."""
        _clean_module("api.v1", also_remove=["api"])
        _clean_module("PIL")

        assert "PIL" not in sys.modules, "PIL was already loaded before test"

        importlib.import_module("api.v1")

        assert "PIL" not in sys.modules, (
            "PIL was imported at module load time by api.v1 (via faces.py)"
        )
