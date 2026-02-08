import sys
with open("/c/Users/admin/Desktop/RawDrive2/backend/src/app/shared/constants.py", "r") as f:
    content = f.read()
    
old_limits = """  "VIDEO": 500 * STORAGE["MB"],  # 500MB for videos
}"""

new_limits = """  "VIDEO": 500 * STORAGE["MB"],  # 500MB for videos
  "AUDIO": 500 * STORAGE["MB"],  # 500MB for audio files
}"""

content = content.replace(old_limits, new_limits)

audio_section = """

# Supported audio MIME types
SUPPORTED_AUDIO_MIME_TYPES = {
    "audio/mpeg",           # MP3
    "audio/wav",            # WAV
    "audio/ogg",            # OGG/Vorbis
    "audio/flac",           # FLAC
    "audio/aac",            # AAC
    "audio/mp4",            # M4A
    "audio/webm",           # WebM Audio
    "audio/x-m4a",          # M4A (alternative)
}

# Supported audio file extensions
SUPPORTED_AUDIO_EXTENSIONS = {
    ".mp3",
    ".wav",
    ".ogg",
    ".flac",
    ".aac",
    ".m4a",
    ".weba",
}

# Audio constraints and settings
AUDIO_CONSTRAINTS = {
    "max_duration": 3600,           # 1 hour in seconds
    "min_bitrate": 32,              # 32 kbps
    "max_bitrate": 320,             # 320 kbps
    "supported_sample_rates": [8000, 16000, 22050, 44100, 48000, 96000],
    "max_file_size": 500 * STORAGE["MB"],
}"""

with open("/c/Users/admin/Desktop/RawDrive2/backend/src/app/shared/constants.py", "w") as f:
    f.write(content + audio_section)

print("Audio constants added successfully!")
