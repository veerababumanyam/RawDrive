
import asyncio
import sys
import os
import uuid
from datetime import datetime

# Add backend src to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from app.db.postgres import get_postgres_pool, init_postgres_pool
from app.config.settings import get_settings

# Professional User (from seed_test_users_with_subscriptions.py)
USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111003")
WORKSPACE_ID = uuid.uuid5(USER_ID, "workspace")
SLUG = "professional"

PROFILE_DATA = {
    "display_name": "Alex Morgan",
    "slug": SLUG,
    "email": "alex@rawdrive.in",
    "profile_title": "Cinematic Portrait Photographer",
    "bio": "Capturing the raw human emotion through light and shadow. Specialized in editorial portraits and high-end fashion photography. Based in NYC, available worldwide.",
    "location": "New York, USA",
    "phone": "+1 (555) 123-4567",
    "website": "https://alexmorgan.example.com",
    "socials": {
        "instagram": "https://instagram.com/alexmorgan",
        "twitter": "https://twitter.com/alexmorgan",
        "linkedin": "https://linkedin.com/in/alexmorgan",
        "behance": "https://behance.net/alexmorgan"
    },
    "custom_links": [
        {"label": "My Portfolio", "url": "https://alexmorgan.example.com", "type": "portfolio"},
        {"label": "Print Shop", "url": "https://shop.alexmorgan.example.com", "type": "shop"},
        {"label": "Workshop 2025", "url": "https://workshops.example.com", "type": "blog"}
    ],
    "categories": ["Portrait", "Fashion", "Editorial"],
    "brand_color": "#FF5733",
    "background_theme": "cinematic",
    "is_public": True,
    "booking_calendar_url": "https://calendly.com/alexmorgan",
    "visibility_config": {
        "display_name": True,
        "profile_title": True,
        "avatar_url": True,
        "bio": True,
        "location": True,
        "email": True,
        "phone": True,
        "website": True,
        "socials_instagram": True,
        "socials_twitter": True,
        "socials_linkedin": True,
        "socials_behance": True,
        "custom_links": True,
        "booking_calendar": True,
        "qr_code": True,
        "vcard": True
    }
}

async def seed_profile():
    settings = get_settings()
    await init_postgres_pool(settings)
    pool = await get_postgres_pool()
    print(f"Connecting to DB for User {USER_ID} / Workspace {WORKSPACE_ID}...")

    # Check if profile exists
    existing = await pool.fetchval(
        "SELECT profile_id FROM personal_profiles WHERE workspace_id = $1",
        WORKSPACE_ID
    )

    if existing:
        print(f"Deleting existing profile {existing}...")
        await pool.execute("DELETE FROM personal_profiles WHERE profile_id = $1", existing)

    print("Creating new Personal Profile...")
    profile_id = uuid.uuid4()
    
    query = """
        INSERT INTO personal_profiles (
            profile_id,
            workspace_id,
            user_id,
            slug,
            display_name,
            email,
            profile_title,
            bio,
            location,
            phone,
            website,
            socials,
            custom_links,
            categories,
            brand_color,
            background_theme,
            is_public,
            booking_calendar_url,
            visibility_config,
            created_at,
            updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW()
        )
    """

    await pool.execute(
        query,
        profile_id,
        WORKSPACE_ID,
        USER_ID,
        PROFILE_DATA["slug"],
        PROFILE_DATA["display_name"],
        PROFILE_DATA["email"],
        PROFILE_DATA["profile_title"],
        PROFILE_DATA["bio"],
        PROFILE_DATA["location"],
        PROFILE_DATA["phone"],
        PROFILE_DATA["website"],
        json.dumps(PROFILE_DATA["socials"]),
        json.dumps(PROFILE_DATA["custom_links"]),
        PROFILE_DATA["categories"],
        PROFILE_DATA["brand_color"],
        PROFILE_DATA["background_theme"],
        PROFILE_DATA["is_public"],
        PROFILE_DATA["booking_calendar_url"],
        json.dumps(PROFILE_DATA["visibility_config"])
    )

    print(f"✅ Profile created successfully! Slug: {SLUG}")
    print(f"👉 API URL: http://localhost:8000/api/v1/public/personal-profiles/{SLUG}")
    print(f"👉 Frontend URL: http://localhost:3000/u/{SLUG}")

if __name__ == "__main__":
    import json
    asyncio.run(seed_profile())
