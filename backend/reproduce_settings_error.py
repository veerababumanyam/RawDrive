from app.config.settings import get_settings
import os

if __name__ == "__main__":
    try:
        settings = get_settings()
        print("Settings loaded successfully")
    except Exception as e:
        print(f"Error loading settings: {e}")
        import traceback
        traceback.print_exc()
