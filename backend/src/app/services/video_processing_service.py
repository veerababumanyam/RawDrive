"""VideoProcessingService: FFmpeg wrapper for video transcoding and processing.

Handles:
- Metadata extraction (duration, dimensions)
- Thumbnail generation
- Transcoding to HLS (HTTP Live Streaming)
- Transcoding to MP4 (compressed)
"""

import asyncio
import json
import logging
import os
import subprocess
from pathlib import Path
from typing import Dict, Any, Tuple, Optional

logger = logging.getLogger(__name__)


class VideoProcessingError(Exception):
    """Base error for video processing failures."""
    pass


class VideoProcessingService:
    """Service for video processing using FFmpeg."""

    def __init__(self, ffmpeg_path: str = "ffmpeg", ffprobe_path: str = "ffprobe"):
        self.ffmpeg_path = ffmpeg_path
        self.ffprobe_path = ffprobe_path

    async def get_metadata(self, input_path: str) -> Dict[str, Any]:
        """Extract video metadata using ffprobe.

        Args:
            input_path: Path to video file

        Returns:
            Dictionary containing metadata (width, height, duration, etc.)
        """
        cmd = [
            self.ffprobe_path,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            input_path
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            stdout, stderr = await process.communicate()

            if process.returncode != 0:
                raise VideoProcessingError(f"ffprobe failed: {stderr.decode()}")

            data = json.loads(stdout.decode())
            
            # Find video stream
            video_stream = next(
                (s for s in data.get("streams", []) if s["codec_type"] == "video"),
                None
            )
            
            if not video_stream:
                raise VideoProcessingError("No video stream found")

            return {
                "width": int(video_stream.get("width", 0)),
                "height": int(video_stream.get("height", 0)),
                "duration": float(data["format"].get("duration", 0)),
                "codec": video_stream.get("codec_name"),
                "bitrate": int(data["format"].get("bit_rate", 0)),
            }

        except Exception as e:
            logger.error(f"Metadata extraction failed: {e}")
            raise VideoProcessingError(f"Failed to extract metadata: {e}")

    async def generate_thumbnail(
        self, 
        input_path: str, 
        output_path: str, 
        time_offset: float = 0.0
    ) -> str:
        """Generate a thumbnail image from the video.

        Args:
            input_path: Path to input video
            output_path: Path to save thumbnail
            time_offset: Time in seconds to capture frame

        Returns:
            Path to generated thumbnail
        """
        cmd = [
            self.ffmpeg_path,
            "-y",  # Overwrite output
            "-ss", str(time_offset),
            "-i", input_path,
            "-vframes", "1",
            "-q:v", "2",  # High quality jpeg
            output_path
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await process.communicate()

            if process.returncode != 0:
                raise VideoProcessingError(f"Thumbnail generation failed: {stderr.decode()}")

            return output_path

        except Exception as e:
            logger.error(f"Thumbnail generation failed: {e}")
            raise VideoProcessingError(f"Failed to generate thumbnail: {e}")

    async def transcode_to_mp4(
        self,
        input_path: str,
        output_path: str,
        width: Optional[int] = None,
        crf: int = 23,
        preset: str = "medium"
    ) -> str:
        """Transcode video to optimized MP4 (H.264/AAC).

        Args:
            input_path: Path to input video
            output_path: Path to save MP4
            width: Target width (maintains aspect ratio). If None, keeps original.
            crf: Constant Rate Factor (0-51, lower is better quality). Default 23.
            preset: Encoding speed preset (ultrafast to placebo).

        Returns:
            Path to generated MP4
        """
        vf_filter = f"scale={width}:-2" if width else "null"
        
        cmd = [
            self.ffmpeg_path,
            "-y",
            "-i", input_path,
            "-c:v", "libx264",
            "-preset", preset,
            "-crf", str(crf),
            "-vf", vf_filter,
            "-c:a", "aac",
            "-b:a", "128k",
            "-movflags", "+faststart",  # Enable streaming
            output_path
        ]

        try:
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            _, stderr = await process.communicate()

            if process.returncode != 0:
                raise VideoProcessingError(f"MP4 transcoding failed: {stderr.decode()}")

            return output_path

        except Exception as e:
            logger.error(f"MP4 transcoding failed: {e}")
            raise VideoProcessingError(f"Failed to transcode to MP4: {e}")


# Singleton instance
_video_processing_service: Optional[VideoProcessingService] = None


def get_video_processing_service() -> VideoProcessingService:
    """Get singleton video processing service."""
    global _video_processing_service
    if _video_processing_service is None:
        _video_processing_service = VideoProcessingService()
    return _video_processing_service
