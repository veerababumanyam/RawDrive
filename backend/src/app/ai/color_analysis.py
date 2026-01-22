"""Color Analysis Module for Gallery Recommendations.

Provides utilities for:
- Dominant color extraction using K-means clustering
- Color space conversions (RGB ↔ HSL)
- Color distance calculations in perceptual space
- Color temperature classification

Feature: Enhancement 4 - AI Recommendations
"""

from __future__ import annotations

import logging
import math
from pathlib import Path
from typing import Optional

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# RGB to HSL conversion matrix
# See: https://en.wikipedia.org/wiki/HSL_and_HSV#From_RGB
RGB_TO_HSL_MATRIX = np.array([
    [0.299, 0.587, 0.114],  # Luminance coefficients
])


# ---------------------------------------------------------------------------
# Color Space Conversions
# ---------------------------------------------------------------------------


def rgb_to_hsl(rgb: tuple[int, int, int]) -> tuple[float, float, float]:
    """Convert RGB color to HSL (Hue, Saturation, Lightness).

    Args:
        rgb: RGB tuple (0-255, 0-255, 0-255)

    Returns:
        HSL tuple (0-360, 0-1, 0-1)
    """
    r, g, b = [x / 255.0 for x in rgb]

    max_c = max(r, g, b)
    min_c = min(r, g, b)
    l = (max_c + min_c) / 2.0

    if max_c == min_c:
        h = s = 0.0
    else:
        d = max_c - min_c
        s = d / (2.0 - max_c - min_c) if l > 0.5 else d / (max_c + min_c)

        if max_c == r:
            h = (60 * ((g - b) / d + (6 if g < b else 0))) % 360
        elif max_c == g:
            h = (60 * ((b - r) / d + 2)) % 360
        else:
            h = (60 * ((r - g) / d + 4)) % 360

    return (h, s, l)


def hsl_to_rgb(hsl: tuple[float, float, float]) -> tuple[int, int, int]:
    """Convert HSL color to RGB.

    Args:
        hsl: HSL tuple (0-360, 0-1, 0-1)

    Returns:
        RGB tuple (0-255, 0-255, 0-255)
    """
    h, s, l = hsl
    h = h % 360
    c = (1 - abs(2 * l - 1)) * s
    x = c * (1 - abs((h / 60.0) % 2 - 1))
    m = l - c / 2.0

    if 0 <= h < 60:
        r, g, b = c, x, 0
    elif 60 <= h < 120:
        r, g, b = x, c, 0
    elif 120 <= h < 180:
        r, g, b = 0, c, x
    elif 180 <= h < 240:
        r, g, b = 0, x, c
    elif 240 <= h < 300:
        r, g, b = x, 0, c
    else:
        r, g, b = c, 0, x

    return (
        int((r + m) * 255),
        int((g + m) * 255),
        int((b + m) * 255),
    )


# ---------------------------------------------------------------------------
# Color Distance Calculations
# ---------------------------------------------------------------------------


def color_distance_hsl(color1: tuple[int, int, int], color2: tuple[int, int, int]) -> float:
    """Calculate perceptual distance between two colors in HSL space.

    Uses weighted Euclidean distance in HSL space where:
    - Hue distance accounts for circularity (0-360 wraps)
    - Saturation and Lightness are linear (0-1)

    Formula:
    distance = sqrt(
        (hue_dist/180)^2 +
        (sat_dist)^2 +
        (light_dist)^2
    )

    Args:
        color1: RGB tuple (0-255, 0-255, 0-255)
        color2: RGB tuple (0-255, 0-255, 0-255)

    Returns:
        Distance in range [0, 1] (normalized)
    """
    h1, s1, l1 = rgb_to_hsl(color1)
    h2, s2, l2 = rgb_to_hsl(color2)

    # Hue is circular (0-360), so use shortest arc distance
    h_diff = min(abs(h1 - h2), 360 - abs(h1 - h2))
    h_distance = h_diff / 180.0  # Normalize to 0-1

    s_distance = abs(s1 - s2)
    l_distance = abs(l1 - l2)

    # Weighted Euclidean distance
    distance = math.sqrt(h_distance**2 + s_distance**2 + l_distance**2)

    return min(distance, 1.0)  # Clamp to 0-1


def color_distance_euclidean(color1: tuple[int, int, int], color2: tuple[int, int, int]) -> float:
    """Calculate Euclidean distance between colors in RGB space.

    Simple L2 distance, less perceptually accurate than HSL distance.

    Args:
        color1: RGB tuple (0-255, 0-255, 0-255)
        color2: RGB tuple (0-255, 0-255, 0-255)

    Returns:
        Distance (0-441.67 max for opposite corners)
    """
    r_diff = color1[0] - color2[0]
    g_diff = color1[1] - color2[1]
    b_diff = color1[2] - color2[2]

    return math.sqrt(r_diff**2 + g_diff**2 + b_diff**2)


# ---------------------------------------------------------------------------
# Color Temperature Classification
# ---------------------------------------------------------------------------


def classify_color_temperature(rgb: tuple[int, int, int]) -> str:
    """Classify color as warm, cool, or neutral.

    Strategy:
    - Red/Orange/Yellow channel dominance → Warm
    - Blue/Cyan/Green channel dominance → Cool
    - Balanced channels → Neutral

    Args:
        rgb: RGB tuple (0-255, 0-255, 0-255)

    Returns:
        One of: "warm", "cool", "neutral"
    """
    r, g, b = rgb

    # Calculate channel dominance
    r_weighted = r * 1.2  # Red weighted higher
    g_weighted = g
    b_weighted = b * 1.2  # Blue weighted higher

    warm_score = r_weighted + (g_weighted * 0.5)  # Red + some yellow
    cool_score = b_weighted + (g_weighted * 0.5)  # Blue + some green

    diff = warm_score - cool_score

    if abs(diff) < 20:
        return "neutral"
    return "warm" if diff > 0 else "cool"


# ---------------------------------------------------------------------------
# Dominant Color Extraction
# ---------------------------------------------------------------------------


def extract_dominant_colors(
    pixel_data: np.ndarray,
    n_colors: int = 5,
    random_state: int = 42,
) -> list[tuple[int, int, int]]:
    """Extract dominant colors using K-means clustering.

    Process:
    1. Reshape pixel data to N×3 array (one RGB triple per row)
    2. Apply K-means clustering with k=n_colors
    3. Return cluster centers as RGB tuples

    Args:
        pixel_data: Image pixel array (H×W×3 or flattened)
        n_colors: Number of dominant colors to extract
        random_state: Random seed for reproducibility

    Returns:
        List of n_colors RGB tuples sorted by cluster size (largest first)
    """
    try:
        from sklearn.cluster import KMeans
    except ImportError:
        logger.warning("scikit-learn not available, using approximate colors")
        # Fallback: return approximate colors from quantization
        return _approximate_dominant_colors(pixel_data, n_colors)

    # Reshape to N×3
    if pixel_data.ndim == 3:
        pixels = pixel_data.reshape(-1, 3)
    else:
        pixels = pixel_data

    # Filter out grayscale pixels (near white or black)
    # This prevents pure grayscale from dominating results
    mask = (np.std(pixels, axis=1) > 10)  # RGB variance > 10
    if mask.sum() > 100:  # Ensure enough pixels remain
        pixels = pixels[mask]

    # K-means clustering
    try:
        kmeans = KMeans(n_clusters=n_colors, random_state=random_state, n_init=10)
        kmeans.fit(pixels)

        # Get cluster sizes for sorting
        cluster_sizes = np.bincount(kmeans.labels_)

        # Get colors sorted by cluster size
        colors_with_sizes = sorted(
            enumerate(kmeans.cluster_centers_),
            key=lambda x: cluster_sizes[x[0]],
            reverse=True,
        )

        return [tuple(np.uint8(color)) for _, color in colors_with_sizes]

    except Exception as e:
        logger.warning(f"K-means failed: {e}, using approximate method")
        return _approximate_dominant_colors(pixel_data, n_colors)


def _approximate_dominant_colors(
    pixel_data: np.ndarray,
    n_colors: int = 5,
) -> list[tuple[int, int, int]]:
    """Approximate dominant colors using histogram quantization.

    Fallback when scikit-learn is unavailable.

    Args:
        pixel_data: Image pixel array
        n_colors: Number of colors to extract

    Returns:
        List of approximate dominant colors
    """
    if pixel_data.ndim == 3:
        pixels = pixel_data.reshape(-1, 3)
    else:
        pixels = pixel_data

    # Quantize to 5-bit per channel (32 bins per channel = 32^3 = 32k colors)
    quantized = pixels // 8
    unique, counts = np.unique(
        quantized.reshape(-1, 3),
        axis=0,
        return_counts=True,
    )

    # Sort by frequency
    sorted_indices = np.argsort(-counts)[:n_colors]
    colors = unique[sorted_indices] * 8 + 4  # Rescale back to RGB

    return [tuple(np.uint8(color)) for color in colors]


# ---------------------------------------------------------------------------
# Image Processing Utilities
# ---------------------------------------------------------------------------


def get_image_brightness(pixel_data: np.ndarray) -> float:
    """Calculate average image brightness.

    Uses luminance formula: L = 0.299*R + 0.587*G + 0.114*B

    Args:
        pixel_data: Image pixel array (H×W×3)

    Returns:
        Average brightness (0-1)
    """
    if pixel_data.ndim != 3 or pixel_data.shape[2] != 3:
        return 0.5

    # RGB to luminance
    luminance = (
        0.299 * pixel_data[:, :, 0]
        + 0.587 * pixel_data[:, :, 1]
        + 0.114 * pixel_data[:, :, 2]
    )

    return float(np.mean(luminance)) / 255.0


def get_image_saturation(pixel_data: np.ndarray) -> float:
    """Calculate average image saturation.

    Converts to HSL and averages S channel.

    Args:
        pixel_data: Image pixel array (H×W×3)

    Returns:
        Average saturation (0-1)
    """
    if pixel_data.ndim != 3 or pixel_data.shape[2] != 3:
        return 0.5

    # Reshape to N×3
    pixels = pixel_data.reshape(-1, 3)

    # Convert to HSL and extract S
    saturation_values = []
    for rgb in pixels[::10]:  # Sample every 10th pixel for speed
        _, s, _ = rgb_to_hsl(tuple(rgb))
        saturation_values.append(s)

    if saturation_values:
        return float(np.mean(saturation_values))
    return 0.5


# ---------------------------------------------------------------------------
# Color Palette Analysis
# ---------------------------------------------------------------------------


def analyze_color_palette(
    pixel_data: np.ndarray,
) -> dict[str, Any]:
    """Analyze complete color palette of image.

    Args:
        pixel_data: Image pixel array (H×W×3)

    Returns:
        Dictionary with palette analysis:
        {
            "dominant_colors": [(R, G, B), ...],
            "brightness": 0-1,
            "saturation": 0-1,
            "warm_percentage": 0-1,
            "cool_percentage": 0-1,
            "temperature": "warm|cool|neutral",
        }
    """
    dominant = extract_dominant_colors(pixel_data, n_colors=5)
    brightness = get_image_brightness(pixel_data)
    saturation = get_image_saturation(pixel_data)

    # Classify color temperature from dominant color
    primary_color = dominant[0] if dominant else (128, 128, 128)
    temperature = classify_color_temperature(primary_color)

    # Calculate warm/cool percentage
    warm_count = sum(1 for color in dominant if classify_color_temperature(color) == "warm")
    cool_count = sum(1 for color in dominant if classify_color_temperature(color) == "cool")
    total = warm_count + cool_count + 1  # +1 to avoid division by zero

    return {
        "dominant_colors": dominant,
        "brightness": brightness,
        "saturation": saturation,
        "warm_percentage": warm_count / total,
        "cool_percentage": cool_count / total,
        "temperature": temperature,
    }
