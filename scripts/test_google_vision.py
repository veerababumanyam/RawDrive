import asyncio
import logging
import os
import sys
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).parent.parent / "backend/src"))

from app.services.face_configuration_service import get_face_configuration_service
from app.services.ai.providers.cloud_vision_provider import CloudVisionProvider

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_google_vision():
    logger.info("Starting Google Cloud Vision Provider Test")
    
    # Check env vars
    logger.info(f"GOOGLE_APPLICATION_CREDENTIALS: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")
    logger.info(f"GOOGLE_CLOUD_VISION_CREDENTIALS: {os.environ.get('GOOGLE_CLOUD_VISION_CREDENTIALS')}")
    
    # Initialize services
    config_service = get_face_configuration_service()
    provider = CloudVisionProvider(config_service)
    
    # Test Health
    logger.info("Checking provider health...")
    is_healthy = await provider.is_healthy()
    
    if is_healthy:
        logger.info("✅ Provider is HEALTHY")
        
        # Test Detection with a blank image
        logger.info("Testing detection on blank image...")
        try:
            # Create a 100x100 white jpeg image in memory
            # manual jpeg header + white pixels roughly
            # Easier to read a real file or just use random bytes?
            # Cloud Vision requires valid image format.
            # Let's try to find a file in the project or generate one using ConfigService logic? 
            # Pillow is used in provider, so assume it is installed.
            from PIL import Image
            import io
            
            img = Image.new('RGB', (100, 100), color='white')
            img_byte_arr = io.BytesIO()
            img.save(img_byte_arr, format='JPEG')
            image_bytes = img_byte_arr.getvalue()
            
            logger.info("Sending request to Google Cloud Vision...")
            results = await provider.detect_faces(image_bytes)
            logger.info(f"✅ Detection successful. Faces found: {len(results)}")
            
        except Exception as e:
            logger.error(f"❌ Detection failed: {e}")
            import traceback
            traceback.print_exc()
            
    else:
        logger.error("❌ Provider is UNHEALTHY")
        # Try to debug why
        try:
            await provider._ensure_client()
        except Exception as e:
            logger.error(f"Initialization error: {e}")

if __name__ == "__main__":
    asyncio.run(test_google_vision())
