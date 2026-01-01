
import pytest
from unittest.mock import AsyncMock, MagicMock
from datetime import datetime
from uuid import uuid4
from app.services.invitation_rsvp_service import InvitationRSVPService

@pytest.mark.asyncio
async def test_export_rsvps():
    # Setup
    service = InvitationRSVPService()
    service.rsvp_repo = AsyncMock()
    
    # Mock RSVPs
    rsvp1 = MagicMock()
    rsvp1.guest_name = "Guest 1"
    rsvp1.guest_email = "guest1@example.com"
    rsvp1.guest_phone = "1234567890"
    rsvp1.attending = True
    rsvp1.party_size = 2
    rsvp1.party_names = ["Partner 1"]
    rsvp1.dietary_preferences = "None"
    rsvp1.message = "Can't wait!"
    rsvp1.source = "web"
    rsvp1.created_at = datetime(2023, 1, 1, 10, 0, 0)
    rsvp1.status = "confirmed"
    rsvp1.custom_answers = {"Question 1": "Answer 1"}

    rsvp2 = MagicMock()
    rsvp2.guest_name = "Guest 2"
    rsvp2.attending = False
    rsvp2.source = "email"
    rsvp2.created_at = datetime(2023, 1, 2, 10, 0, 0)
    rsvp2.party_size = 1
    rsvp2.party_names = []
    rsvp2.dietary_preferences = None
    rsvp2.message = None
    rsvp2.guest_phone = None
    rsvp2.guest_email = None # Or empty string if your logic handles it. But let's check.
    # The code likely does getattr(rsvp, "guest_email", "") or similar?
    # Actually if it's pydantic model it would be None.
    # Let's set it to None.
    
    # Correct assertion for Guest 2
    # Guest 2,,,Declined,1,,,,email,...
    
    service.rsvp_repo.list_by_invitation.return_value = ([rsvp1, rsvp2], 2)

    # Execute
    csv_content = await service.export_rsvps(uuid4(), uuid4())

    # Verify
    assert "Guest Name,Email,Phone,Status,Party Size,Additional Guests,Dietary Preferences,Message,Source,Submission Date,Custom Answers" in csv_content
    # Check Guest 1
    assert "Guest 1,guest1@example.com,1234567890,Attending,2,Partner 1,None,Can't wait!,web" in csv_content
    # Check Guest 2
    assert "Guest 2,,," in csv_content
    assert "Declined,1,,,,email" in csv_content
    # Check Custom Answers handling (if implemented in service)
    # The current implementation joins all data, custom answers are not explicitly separated in the standard CSV columns currently unless I added it.
    # Looking at my previous edit to invitation_rsvp_service.py:
    # row = [..., rsvp.custom_answers]
    # Yes, I added custom_answers at the end.
    assert "{'Question 1': 'Answer 1'}" in csv_content
