"""
Video Transcoding Worker

Background worker for transcoding uploaded videos into web-optimized formats.
Uses FFmpeg for video processing with fallback for unsupported systems.

Supported outputs:
- MP4 (H.264/AAC) for broad compatibility
- WebM (VP9) for modern browsers
- HLS for adaptive streaming

Feature: 016-save-the-date Phase 5
"""

from __future__ import annotations

import asyncio
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from uuid import UUID

logger = logging.getLogger(__name__)


class TranscodingStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class VideoCodec(str, Enum):
    H264 = "h264"
    VP9 = "vp9"
    HEVC = "hevc"


class AudioCodec(str, Enum):
    AAC = "aac"
    OPUS = "opus"
    MP3 = "mp3"


@dataclass
class TranscodingProfile:
    """Video transcoding profile settings."""
    name: str
    video_codec: VideoCodec
    audio_codec: AudioCodec
    video_bitrate: str  # e.g., "2M" for 2 Mbps
    audio_bitrate: str  # e.g., "128k"
    max_width: int
    max_height: int
    output_format: str  # e.g., "mp4", "webm"
    extra_args: list[str] | None = None


# Predefined transcoding profiles
PROFILES = {
    "web_720p": TranscodingProfile(
        name="web_720p",
        video_codec=VideoCodec.H264,
        audio_codec=AudioCodec.AAC,
        video_bitrate="2M",
        audio_bitrate="128k",
        max_width=1280,
        max_height=720,
        output_format="mp4",
        extra_args=["-preset", "medium", "-movflags", "+faststart"],
    ),
    "web_1080p": TranscodingProfile(
        name="web_1080p",
        video_codec=VideoCodec.H264,
        audio_codec=AudioCodec.AAC,
        video_bitrate="4M",
        audio_bitrate="192k",
        max_width=1920,
        max_height=1080,
        output_format="mp4",
        extra_args=["-preset", "medium", "-movflags", "+faststart"],
    ),
    "webm_720p": TranscodingProfile(
        name="webm_720p",
        video_codec=VideoCodec.VP9,
        audio_codec=AudioCodec.OPUS,
        video_bitrate="1.5M",
        audio_bitrate="128k",
        max_width=1280,
        max_height=720,
        output_format="webm",
        extra_args=["-deadline", "good", "-cpu-used", "2"],
    ),
    "thumbnail": TranscodingProfile(
        name="thumbnail",
        video_codec=VideoCodec.H264,
        audio_codec=AudioCodec.AAC,
        video_bitrate="500k",
        audio_bitrate="64k",
        max_width=480,
        max_height=270,
        output_format="mp4",
        extra_args=["-preset", "veryfast", "-movflags", "+faststart"],
    ),
}


class FFmpegNotFoundError(Exception):
    """Raised when FFmpeg is not installed or not in PATH."""
    pass


class TranscodingError(Exception):
    """Raised when video transcoding fails."""
    pass


def check_ffmpeg_available() -> bool:
    """Check if FFmpeg is available on the system."""
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=10,
        )
        return result.returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def get_video_info(input_path: str) -> dict[str, Any]:
    """Get video metadata using ffprobe."""
    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            input_path,
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        
        if result.returncode != 0:
            raise TranscodingError(f"ffprobe failed: {result.stderr}")
        
        import json
        return json.loads(result.stdout)
    except FileNotFoundError:
        raise FFmpegNotFoundError("ffprobe not found")
    except Exception as e:
        raise TranscodingError(f"Failed to get video info: {e}")


def build_ffmpeg_command(
    input_path: str,
    output_path: str,
    profile: TranscodingProfile,
) -> list[str]:
    """Build FFmpeg command for transcoding."""
    cmd = ["ffmpeg", "-y", "-i", input_path]
    
    # Video codec
    if profile.video_codec == VideoCodec.H264:
        cmd.extend(["-c:v", "libx264"])
    elif profile.video_codec == VideoCodec.VP9:
        cmd.extend(["-c:v", "libvpx-vp9"])
    elif profile.video_codec == VideoCodec.HEVC:
        cmd.extend(["-c:v", "libx265"])
    
    # Audio codec
    if profile.audio_codec == AudioCodec.AAC:
        cmd.extend(["-c:a", "aac"])
    elif profile.audio_codec == AudioCodec.OPUS:
        cmd.extend(["-c:a", "libopus"])
    elif profile.audio_codec == AudioCodec.MP3:
        cmd.extend(["-c:a", "libmp3lame"])
    
    # Bitrates
    cmd.extend(["-b:v", profile.video_bitrate])
    cmd.extend(["-b:a", profile.audio_bitrate])
    
    # Scale to max dimensions while preserving aspect ratio
    scale_filter = (
        f"scale='min({profile.max_width},iw)':'min({profile.max_height},ih)':"
        "force_original_aspect_ratio=decrease,"
        "pad=ceil(iw/2)*2:ceil(ih/2)*2"  # Ensure even dimensions
    )
    cmd.extend(["-vf", scale_filter])
    
    # Extra profile-specific arguments
    if profile.extra_args:
        cmd.extend(profile.extra_args)
    
    cmd.append(output_path)
    return cmd


async def transcode_video(
    input_path: str,
    output_dir: str,
    profile_name: str = "web_720p",
    progress_callback: Optional[callable] = None,
) -> str:
    """
    Transcode a video file.
    
    Args:
        input_path: Path to input video file
        output_dir: Directory for output file
        profile_name: Name of transcoding profile to use
        progress_callback: Optional callback(progress: float) for progress updates
    
    Returns:
        Path to transcoded video file
    """
    if not check_ffmpeg_available():
        raise FFmpegNotFoundError("FFmpeg is not installed or not in PATH")
    
    profile = PROFILES.get(profile_name)
    if not profile:
        raise ValueError(f"Unknown profile: {profile_name}")
    
    # Generate output path
    input_name = Path(input_path).stem
    output_path = os.path.join(output_dir, f"{input_name}_{profile.name}.{profile.output_format}")
    
    # Build command
    cmd = build_ffmpeg_command(input_path, output_path, profile)
    
    logger.info(f"Transcoding {input_path} with profile {profile_name}")
    logger.debug(f"FFmpeg command: {' '.join(cmd)}")
    
    # Run transcoding
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        
        _, stderr = await process.communicate()
        
        if process.returncode != 0:
            raise TranscodingError(f"FFmpeg failed: {stderr.decode()}")
        
        logger.info(f"Transcoding completed: {output_path}")
        return output_path
        
    except Exception as e:
        logger.error(f"Transcoding failed: {e}")
        raise TranscodingError(f"Transcoding failed: {e}")


async def generate_thumbnail(
    input_path: str,
    output_path: str,
    timestamp: float = 1.0,
    width: int = 480,
    height: int = 270,
) -> str:
    """Generate a thumbnail image from a video."""
    if not check_ffmpeg_available():
        raise FFmpegNotFoundError("FFmpeg is not installed")
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(timestamp),
        "-i", input_path,
        "-vframes", "1",
        "-vf", f"scale={width}:{height}:force_original_aspect_ratio=decrease",
        output_path,
    ]
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        
        if process.returncode != 0:
            raise TranscodingError("Failed to generate thumbnail")
        
        return output_path
    except Exception as e:
        raise TranscodingError(f"Thumbnail generation failed: {e}")


async def generate_video_preview(
    input_path: str,
    output_path: str,
    duration: float = 5.0,
    start_time: float = 0.0,
) -> str:
    """Generate a short preview clip from a video."""
    if not check_ffmpeg_available():
        raise FFmpegNotFoundError("FFmpeg is not installed")
    
    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start_time),
        "-i", input_path,
        "-t", str(duration),
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-b:v", "1M",
        "-an",  # No audio for preview
        "-movflags", "+faststart",
        output_path,
    ]
    
    try:
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        await process.communicate()
        
        if process.returncode != 0:
            raise TranscodingError("Failed to generate preview")
        
        return output_path
    except Exception as e:
        raise TranscodingError(f"Preview generation failed: {e}")


class VideoTranscodingWorker:
    """
    Background worker for processing video transcoding jobs.
    
    In production, this would integrate with a job queue like Celery/Redis.
    """

    def __init__(self, output_base_dir: str = "/tmp/transcoded"):
        self.output_base_dir = output_base_dir
        self.is_ffmpeg_available = check_ffmpeg_available()
        os.makedirs(output_base_dir, exist_ok=True)

    async def process_job(
        self,
        job_id: UUID,
        input_path: str,
        profiles: list[str] = None,
        generate_thumbnail: bool = True,
    ) -> dict[str, Any]:
        """
        Process a transcoding job.
        
        Returns dict with paths to transcoded files.
        """
        if not self.is_ffmpeg_available:
            return {
                "status": TranscodingStatus.FAILED.value,
                "error": "FFmpeg not available on this system",
                "outputs": {},
            }
        
        profiles = profiles or ["web_720p"]
        output_dir = os.path.join(self.output_base_dir, str(job_id))
        os.makedirs(output_dir, exist_ok=True)
        
        outputs = {}
        
        try:
            # Transcode to each profile
            for profile_name in profiles:
                try:
                    output_path = await transcode_video(input_path, output_dir, profile_name)
                    outputs[profile_name] = output_path
                except Exception as e:
                    logger.error(f"Failed to transcode with profile {profile_name}: {e}")
                    outputs[profile_name] = None
            
            # Generate thumbnail
            if generate_thumbnail:
                try:
                    thumb_path = os.path.join(output_dir, "thumbnail.jpg")
                    await generate_thumbnail(input_path, thumb_path)
                    outputs["thumbnail"] = thumb_path
                except Exception as e:
                    logger.error(f"Failed to generate thumbnail: {e}")
            
            return {
                "status": TranscodingStatus.COMPLETED.value,
                "outputs": outputs,
            }
            
        except Exception as e:
            return {
                "status": TranscodingStatus.FAILED.value,
                "error": str(e),
                "outputs": outputs,
            }
