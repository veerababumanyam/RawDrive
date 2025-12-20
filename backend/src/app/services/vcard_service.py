"""vCard Generation Service.

Generates vCard 3.0 compatible strings/files from CompanyProfile data.
"""

from app.api.company_profile_schemas import CompanyProfileResponse
from app.services.visibility_service import VisibilityFilterService

class VCardService:
    """Service for generating vCards."""

    @staticmethod
    def generate_vcard(profile: CompanyProfileResponse, include_private: bool = False) -> str:
        """
        Generate vCard 3.0 string.
        
        Args:
            profile: The company profile data.
            include_private: If False, applies visibility filter before generation.
        """
        # Convert Pydantic model to dict
        data = profile.model_dump()
        
        # Apply visibility filter if needed
        if not include_private:
            data = VisibilityFilterService.filter_visible(data, profile.company_visibility)
            
        # Build vCard lines
        lines = ["BEGIN:VCARD", "VERSION:3.0"]
        
        # FN (Full Name) - required
        name = data.get("name", "Unknown")
        lines.append(f"FN:{name}")
        lines.append(f"ORG:{name}")
        
        # TITLE/Tagline
        if tag := data.get("tagline"):
            lines.append(f"TITLE:{tag}")
            
        # EMAIL
        if email := data.get("email"):
            lines.append(f"EMAIL;TYPE=WORK:{email}")
            
        # TEL
        if phone := data.get("phone"):
            lines.append(f"TEL;TYPE=WORK,VOICE:{phone}")
            
        # URL
        if website := data.get("website"):
            lines.append(f"URL;TYPE=WORK:{website}")
            
        # ADR (Address)
        # Format: ;;Street Address;City;Region;Postal Code;Country_Name
        if addr := data.get("address_structured"):
            # addr is a dict here because we dumped the model or it was already dict
            # If it filters out fields inside address, we need to be careful. 
            # But filter_visible (our simple impl) filters top-level keys.
            # So if 'address_structured' key exists, we assume contents are visible.
            # (Refinement: If we wanted field-level visibility inside address, we'd need more logic)
            
            line1 = addr.get("line1", "")
            line2 = addr.get("line2", "")
            street = f"{line1}, {line2}" if line2 else line1
            city = addr.get("city", "")
            state = addr.get("state", "")
            postal = addr.get("postal_code", "")
            country = addr.get("country", "")
            
            lines.append(f"ADR;TYPE=WORK:;;{street};{city};{state};{postal};{country}")
            
        # Socials (X-SOCIAL) - standard vCard doesn't have specific field, typically URL or NOTE or X-props
        # We can add them as URLs with types or X-SOCIAL-PROFILE
        if socials := data.get("socials"):
            for platform, url in socials.items():
                lines.append(f"X-SOCIAL-PROFILE;TYPE={platform}:{url}")
                lines.append(f"URL;TYPE={platform}:{url}")

        lines.append("END:VCARD")
        
        return "\n".join(lines)

    @staticmethod
    def get_filename(profile_name: str) -> str:
        """Generate a safe filename for the vCard."""
        import re
        safe_name = re.sub(r'[^a-zA-Z0-9_-]', '_', profile_name)
        return f"{safe_name}.vcf"
