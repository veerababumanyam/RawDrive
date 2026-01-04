from app.shared.types import InvitationStatus


def test_invitation_status_values_match():
    assert [e.value for e in InvitationStatus] == [
        "draft",
        "published",
        "expired",
        "cancelled",
    ]
