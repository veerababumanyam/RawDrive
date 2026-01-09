"""Personal Profile AI API Endpoints.

AI-powered content generation for personal profile digital visiting cards.
"""

from typing import Optional, List, Any, Dict
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.api.dependencies.auth import CurrentUser, get_current_user
from app.services.personal_profile_ai_service import (
    get_personal_profile_ai_service,
    PersonalProfileAIService,
)
from app.services.gemini_client_service import AIConfigurationError, AIRuntimeError

router = APIRouter()


# --- Request/Response Schemas ---

class GenerateBioRequest(BaseModel):
    """Request schema for bio generation."""
    profile_title: Optional[str] = Field(None, description="Job title, e.g., 'Wedding Photographer'")
    categories: Optional[List[str]] = Field(None, description="Photography specialties")
    style: str = Field("professional", description="Writing style: professional, casual, creative")
    language: str = Field("English", description="Target language")
    current_bio: Optional[str] = Field(None, description="Existing bio to improve")
    additional_context: Optional[str] = Field(None, description="Extra context about the photographer")


class GenerateBioResponse(BaseModel):
    """Response schema for bio generation."""
    bio: str


class GenerateTaglineRequest(BaseModel):
    """Request schema for tagline generation."""
    display_name: Optional[str] = Field(None, description="Photographer's display name")
    profile_title: Optional[str] = Field(None, description="Job title")
    categories: Optional[List[str]] = Field(None, description="Photography specialties")
    style: str = Field("professional", description="Writing style")
    language: str = Field("English", description="Target language")


class GenerateTaglineResponse(BaseModel):
    """Response schema for tagline generation."""
    tagline: str


class AnalyzeCompletenessRequest(BaseModel):
    """Request schema for profile completeness analysis."""
    profile_data: Dict[str, Any] = Field(..., description="Current profile data to analyze")


class AnalyzeCompletenessResponse(BaseModel):
    """Response schema for completeness analysis."""
    score: int = Field(..., ge=0, le=100, description="Completeness score 0-100")
    missing_fields: List[str] = Field(default_factory=list, description="Missing critical fields")
    suggestions: List[str] = Field(default_factory=list, description="Improvement suggestions")


class OptimizeSEORequest(BaseModel):
    """Request schema for SEO optimization."""
    profile_data: Dict[str, Any] = Field(..., description="Current profile data")


class OptimizeSEOResponse(BaseModel):
    """Response schema for SEO optimization."""
    meta_title: str = Field(..., description="Optimized meta title")
    meta_description: str = Field(..., description="Optimized meta description")
    keywords: List[str] = Field(default_factory=list, description="Suggested SEO keywords")


class SuggestCategoriesRequest(BaseModel):
    """Request schema for category suggestions."""
    bio: Optional[str] = Field(None, description="Current bio text")
    profile_title: Optional[str] = Field(None, description="Job title")
    gallery_names: Optional[List[str]] = Field(None, description="Names of user's galleries")


class SuggestCategoriesResponse(BaseModel):
    """Response schema for category suggestions."""
    categories: List[str] = Field(default_factory=list, description="Suggested categories")


# --- API Endpoints ---

@router.post("/ai/generate-bio", response_model=GenerateBioResponse)
async def generate_bio(
    workspace_id: UUID,
    request: GenerateBioRequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: PersonalProfileAIService = Depends(get_personal_profile_ai_service),
):
    """
    Generate or improve a professional bio for the photographer.

    Requires workspace Gemini API key to be configured.
    """
    try:
        result = await ai_service.generate_bio(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            profile_title=request.profile_title,
            categories=request.categories,
            style=request.style,
            language=request.language,
            current_bio=request.current_bio,
            additional_context=request.additional_context,
        )
        return GenerateBioResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": e.code, "message": e.message}
        )
    except AIRuntimeError as e:
        status_code = _get_error_status_code(e.code)
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message, "hint": getattr(e, 'hint', None)}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/generate-tagline", response_model=GenerateTaglineResponse)
async def generate_tagline(
    workspace_id: UUID,
    request: GenerateTaglineRequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: PersonalProfileAIService = Depends(get_personal_profile_ai_service),
):
    """
    Generate a catchy tagline for the photographer's profile.

    Requires workspace Gemini API key to be configured.
    """
    try:
        result = await ai_service.generate_tagline(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            display_name=request.display_name,
            profile_title=request.profile_title,
            categories=request.categories,
            style=request.style,
            language=request.language,
        )
        return GenerateTaglineResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": e.code, "message": e.message}
        )
    except AIRuntimeError as e:
        status_code = _get_error_status_code(e.code)
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message, "hint": getattr(e, 'hint', None)}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/analyze-completeness", response_model=AnalyzeCompletenessResponse)
async def analyze_completeness(
    workspace_id: UUID,
    request: AnalyzeCompletenessRequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: PersonalProfileAIService = Depends(get_personal_profile_ai_service),
):
    """
    Analyze profile completeness and get improvement suggestions.

    Requires workspace Gemini API key to be configured.
    """
    try:
        result = await ai_service.analyze_completeness(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            profile_data=request.profile_data,
        )
        return AnalyzeCompletenessResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": e.code, "message": e.message}
        )
    except AIRuntimeError as e:
        status_code = _get_error_status_code(e.code)
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message, "hint": getattr(e, 'hint', None)}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/optimize-seo", response_model=OptimizeSEOResponse)
async def optimize_seo(
    workspace_id: UUID,
    request: OptimizeSEORequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: PersonalProfileAIService = Depends(get_personal_profile_ai_service),
):
    """
    Generate optimized SEO metadata for the profile.

    Requires workspace Gemini API key to be configured.
    """
    try:
        result = await ai_service.optimize_seo(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            profile_data=request.profile_data,
        )
        return OptimizeSEOResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": e.code, "message": e.message}
        )
    except AIRuntimeError as e:
        status_code = _get_error_status_code(e.code)
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message, "hint": getattr(e, 'hint', None)}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/ai/suggest-categories", response_model=SuggestCategoriesResponse)
async def suggest_categories(
    workspace_id: UUID,
    request: SuggestCategoriesRequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: PersonalProfileAIService = Depends(get_personal_profile_ai_service),
):
    """
    Suggest photography categories based on profile content.

    Requires workspace Gemini API key to be configured.
    """
    try:
        result = await ai_service.suggest_categories(
            user_id=current_user.user_id,
            workspace_id=workspace_id,
            bio=request.bio,
            profile_title=request.profile_title,
            gallery_names=request.gallery_names,
        )
        return SuggestCategoriesResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(
            status_code=400,
            detail={"code": e.code, "message": e.message}
        )
    except AIRuntimeError as e:
        status_code = _get_error_status_code(e.code)
        raise HTTPException(
            status_code=status_code,
            detail={"code": e.code, "message": e.message, "hint": getattr(e, 'hint', None)}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _get_error_status_code(error_code: str) -> int:
    """Map error codes to HTTP status codes."""
    if error_code in ["KEY_UNAUTHORIZED", "KEY_FORBIDDEN"]:
        return 403
    elif error_code == "RATE_LIMITED":
        return 429
    return 500
