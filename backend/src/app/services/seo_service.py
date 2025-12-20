"""SEO Schema Generation Service.

Generates JSON-LD schema markup for businesses (Photography focus).
"""

import json
from app.api.company_profile_schemas import CompanyProfileResponse
from app.services.visibility_service import VisibilityFilterService

class SEOSchemaService:
    """Service for generating SEO schemas."""

    @staticmethod
    def generate_business_schema(profile: CompanyProfileResponse) -> str:
        """
        Generate JSON-LD schema for ProfessionalService (Photography).
        
        Returns:
            JSON string of the schema.
        """
        # Always filter for public visibility for SEO
        data = VisibilityFilterService.filter_visible(profile.model_dump(), profile.company_visibility)
        
        schema = {
            "@context": "https://schema.org",
            "@type": "ProfessionalService", # Or PhotographyStudio specifically
            "additionalType": "https://schema.org/PhotographyStudio",
            "name": data.get("name"),
            "image": data.get("logo_url"),
            "description": data.get("tagline"),
            "url": data.get("website"),
            "email": data.get("email"),
            "telephone": data.get("phone"),
        }
        
        if addr := data.get("address_structured"):
            schema["address"] = {
                "@type": "PostalAddress",
                "streetAddress": f"{addr.get('line1', '')} {addr.get('line2', '')}".strip(),
                "addressLocality": addr.get("city"),
                "addressRegion": addr.get("state"),
                "postalCode": addr.get("postal_code"),
                "addressCountry": addr.get("country")
            }
            
        if socials := data.get("socials"):
            # SameAs for social profiles
            schema["sameAs"] = list(socials.values())
            
        # Clean up None values
        schema = {k: v for k, v in schema.items() if v}
        
        return json.dumps(schema, indent=2)
