"""
Real-ESRGAN Model Wrapper

GPU-accelerated image super-resolution using Real-ESRGAN.
Supports 2x and 4x upscaling with pre-trained models.
"""

import logging
import time
from pathlib import Path
from typing import Optional, Tuple, Union

import cv2
import numpy as np
import torch
from PIL import Image

from config import get_settings

logger = logging.getLogger(__name__)


class RealESRGANUpscaler:
    """Real-ESRGAN image upscaler with GPU acceleration."""

    def __init__(self, model_name: str = "RealESRGAN_x4plus", device: str = "auto"):
        """
        Initialize Real-ESRGAN upscaler.

        Args:
            model_name: Model name (RealESRGAN_x4plus, RealESRGAN_x2plus)
            device: Device to use (auto, cuda, cpu)
        """
        self.settings = get_settings()
        self.model_name = model_name
        self.device = self._get_device(device)
        self.model = None
        self._initialized = False

        # Model configurations
        self.model_configs = {
            "RealESRGAN_x4plus": {
                "scale": 4,
                "model_path": "weights/RealESRGAN_x4plus.pth",
                "tile_size": 256,
            },
            "RealESRGAN_x2plus": {
                "scale": 2,
                "model_path": "weights/RealESRGAN_x2plus.pth",
                "tile_size": 400,
            },
        }

        logger.info(f"Real-ESRGAN upscaler initialized (model: {model_name}, device: {self.device})")

    def _get_device(self, device: str) -> str:
        """
        Determine the best available device.

        Args:
            device: Requested device (auto, cuda, cpu)

        Returns:
            Device string
        """
        if device == "auto":
            if torch.cuda.is_available():
                return "cuda"
            elif torch.backends.mps.is_available():
                return "mps"
            else:
                return "cpu"
        return device

    def _ensure_initialized(self) -> None:
        """Lazy load Real-ESRGAN model."""
        if self._initialized:
            return

        if self.model_name not in self.model_configs:
            raise ValueError(f"Unknown model: {self.model_name}")

        config = self.model_configs[self.model_name]
        model_path = Path(config["model_path"])

        if not model_path.exists():
            raise FileNotFoundError(
                f"Model weights not found: {model_path}. "
                f"Download from https://github.com/xinntao/Real-ESRGAN/releases"
            )

        logger.info(f"Loading Real-ESRGAN model: {self.model_name}")

        try:
            from basicsr.archs.rrdbnet_arch import RRDBNet
            from realesrgan import RealESRGANer

            # Initialize model
            if self.model_name == "RealESRGAN_x4plus":
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=4,
                )
            else:  # x2plus
                model = RRDBNet(
                    num_in_ch=3,
                    num_out_ch=3,
                    num_feat=64,
                    num_block=23,
                    num_grow_ch=32,
                    scale=2,
                )

            # Initialize upsampler
            self.model = RealESRGANer(
                scale=config["scale"],
                model_path=str(model_path),
                model=model,
                tile=config["tile_size"],
                tile_pad=10,
                pre_pad=0,
                half=self.device == "cuda",  # FP16 for CUDA
                device=self.device,
            )

            self._initialized = True
            logger.info(f"Real-ESRGAN model loaded successfully on {self.device}")

        except ImportError as e:
            logger.error(f"Failed to import Real-ESRGAN dependencies: {e}")
            raise RuntimeError(
                "Real-ESRGAN not installed. Install with: pip install realesrgan basicsr"
            )
        except Exception as e:
            logger.error(f"Failed to load Real-ESRGAN model: {e}")
            raise RuntimeError(f"Model loading failed: {e}")

    def upscale(
        self,
        input_path: Union[str, Path],
        output_path: Union[str, Path],
        face_enhance: bool = False,
    ) -> Tuple[bool, dict]:
        """
        Upscale image using Real-ESRGAN.

        Args:
            input_path: Path to input image
            output_path: Path to save upscaled image
            face_enhance: Enable face enhancement (experimental)

        Returns:
            Tuple of (success, metadata)
        """
        self._ensure_initialized()

        start_time = time.time()

        try:
            # Read input image
            img = cv2.imread(str(input_path), cv2.IMREAD_UNCHANGED)
            if img is None:
                raise ValueError(f"Failed to read image: {input_path}")

            input_height, input_width = img.shape[:2]
            logger.debug(f"Input image size: {input_width}x{input_height}")

            # Run upscaling
            try:
                output, _ = self.model.enhance(img, outscale=None)
            except RuntimeError as error:
                if "out of memory" in str(error):
                    logger.warning("GPU out of memory, retrying with CPU")
                    torch.cuda.empty_cache()
                    self.model.device = "cpu"
                    output, _ = self.model.enhance(img, outscale=None)
                else:
                    raise

            # Save output
            cv2.imwrite(str(output_path), output)

            output_height, output_width = output.shape[:2]
            processing_time = time.time() - start_time

            metadata = {
                "success": True,
                "input_size": (input_width, input_height),
                "output_size": (output_width, output_height),
                "scale_factor": self.model_configs[self.model_name]["scale"],
                "processing_time_sec": round(processing_time, 2),
                "model": self.model_name,
                "device": self.device,
            }

            logger.info(
                f"Upscaled {input_path.name if isinstance(input_path, Path) else Path(input_path).name}: "
                f"{input_width}x{input_height} → {output_width}x{output_height} "
                f"({processing_time:.2f}s)"
            )

            return True, metadata

        except Exception as e:
            logger.error(f"Upscaling failed: {e}")
            return False, {
                "success": False,
                "error": str(e),
                "processing_time_sec": time.time() - start_time,
            }

    def upscale_pil(self, image: Image.Image) -> Tuple[Optional[Image.Image], dict]:
        """
        Upscale PIL Image object.

        Args:
            image: PIL Image

        Returns:
            Tuple of (upscaled_image, metadata)
        """
        self._ensure_initialized()

        start_time = time.time()

        try:
            # Convert PIL to OpenCV format
            img = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

            input_height, input_width = img.shape[:2]

            # Run upscaling
            output, _ = self.model.enhance(img, outscale=None)

            # Convert back to PIL
            upscaled_image = Image.fromarray(cv2.cvtColor(output, cv2.COLOR_BGR2RGB))

            output_width, output_height = upscaled_image.size
            processing_time = time.time() - start_time

            metadata = {
                "success": True,
                "input_size": (input_width, input_height),
                "output_size": (output_width, output_height),
                "scale_factor": self.model_configs[self.model_name]["scale"],
                "processing_time_sec": round(processing_time, 2),
                "model": self.model_name,
                "device": self.device,
            }

            return upscaled_image, metadata

        except Exception as e:
            logger.error(f"PIL upscaling failed: {e}")
            return None, {
                "success": False,
                "error": str(e),
                "processing_time_sec": time.time() - start_time,
            }

    def get_gpu_memory_usage(self) -> dict:
        """
        Get GPU memory usage statistics.

        Returns:
            Dict with GPU memory info
        """
        if self.device != "cuda" or not torch.cuda.is_available():
            return {"gpu_available": False}

        return {
            "gpu_available": True,
            "allocated_mb": torch.cuda.memory_allocated() / 1024 / 1024,
            "reserved_mb": torch.cuda.memory_reserved() / 1024 / 1024,
            "max_allocated_mb": torch.cuda.max_memory_allocated() / 1024 / 1024,
        }

    def clear_cache(self) -> None:
        """Clear GPU cache."""
        if self.device == "cuda" and torch.cuda.is_available():
            torch.cuda.empty_cache()
            logger.debug("GPU cache cleared")

    def unload_model(self) -> None:
        """Unload model from memory."""
        if self._initialized:
            del self.model
            self.model = None
            self._initialized = False

            if self.device == "cuda":
                torch.cuda.empty_cache()

            logger.info("Real-ESRGAN model unloaded")


_upscaler_x4: Optional[RealESRGANUpscaler] = None
_upscaler_x2: Optional[RealESRGANUpscaler] = None


def get_upscaler(scale: int = 4) -> RealESRGANUpscaler:
    """
    Get singleton upscaler instance.

    Args:
        scale: Upscaling factor (2 or 4)

    Returns:
        RealESRGANUpscaler instance
    """
    global _upscaler_x4, _upscaler_x2

    if scale == 4:
        if _upscaler_x4 is None:
            _upscaler_x4 = RealESRGANUpscaler(model_name="RealESRGAN_x4plus")
        return _upscaler_x4
    elif scale == 2:
        if _upscaler_x2 is None:
            _upscaler_x2 = RealESRGANUpscaler(model_name="RealESRGAN_x2plus")
        return _upscaler_x2
    else:
        raise ValueError(f"Unsupported scale factor: {scale}. Use 2 or 4.")
