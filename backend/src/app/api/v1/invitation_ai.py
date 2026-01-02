from typing import Optional, List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException

from app.api.dependencies.auth import CurrentUser, get_current_user
from app.api.invitation_schemas import InvitationResponse
from app.services.invitation_ai_service import get_invitation_ai_service, InvitationAIService, AIConfigurationError, AIRuntimeError
from pydantic import BaseModel, Field

router = APIRouter()

class GenerateContentRequest(BaseModel):
    event_type: str = Field(..., description="Type of the event, e.g., 'Wedding'")
    mood: str = Field(..., description="Desired mood, e.g., 'Formal', 'Casual'")
    tone: Optional[str] = Field(None, description="Specific tone instructions")
    language: str = Field("English", description="Target language")
    additional_details: Optional[str] = Field(None, description="Any extra context")
    host_names: Optional[List[str]] = Field(None, description="Names of the hosts")

class GenerateContentResponse(BaseModel):
    title: str
    description: str

@router.post("/ai/generate", response_model=GenerateContentResponse)
async def generate_invitation_content(
    workspace_id: UUID,
    request: GenerateContentRequest,
    current_user: CurrentUser = Depends(get_current_user),
    ai_service: InvitationAIService = Depends(get_invitation_ai_service),
):
    """
    Generate invitation title and description using AI.
    Requires user to have a configured Gemini API key.
    """
    try:
        user_id = current_user.user_id
        
        result = await ai_service.generate_invitation_content(
            user_id=user_id,
            workspace_id=workspace_id,
            event_type=request.event_type,
            mood=request.mood,
            tone=request.tone,
            language=request.language,
            additional_details=request.additional_details,
            host_names=request.host_names,
        )
        
        return GenerateContentResponse(**result)

    except AIConfigurationError as e:
        raise HTTPException(status_code=400, detail={"code": e.code, "message": e.message})
    except AIRuntimeError as e:
        # Map certain runtime errors to appropriate status codes
        status_code = 500
        if e.code in ["KEY_UNAUTHORIZED", "KEY_FORBIDDEN"]:
            status_code = 403
        elif e.code == "RATE_LIMITED":
            status_code = 429
        
        raise HTTPException(status_code=status_code, detail={"code": e.code, "message": e.message, "hint": e.hint})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
