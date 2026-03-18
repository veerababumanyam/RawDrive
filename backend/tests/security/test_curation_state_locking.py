"""Regression tests for SEC-03: Curation session state machine locking.

These tests verify that:
1. State transitions use PostgreSQL advisory locks (pg_advisory_xact_lock)
2. State transitions validate allowed source statuses
3. Terminal states (completed, failed) cannot be transitioned from
4. All service methods use atomic transitions (not read-then-update)
"""
import inspect
import pytest


class TestCurationStateMachineLocking:
    """Verify curation session state machine uses advisory locks."""

    def test_repository_uses_advisory_lock(self):
        """SEC-03 regression: update_status_atomic must use pg_advisory_xact_lock."""
        from app.repositories.curation_session_repository import CurationSessionRepository
        source = inspect.getsource(CurationSessionRepository.update_status_atomic)
        assert "pg_advisory_xact_lock" in source, (
            "REGRESSION: update_status_atomic must use pg_advisory_xact_lock "
            "to prevent race conditions on concurrent state transitions"
        )

    def test_repository_validates_source_status(self):
        """SEC-03 regression: update_status_atomic must check current status."""
        from app.repositories.curation_session_repository import CurationSessionRepository
        source = inspect.getsource(CurationSessionRepository.update_status_atomic)
        assert "allowed_from_statuses" in source, (
            "REGRESSION: update_status_atomic must validate current status "
            "against allowed_from_statuses before updating"
        )

    def test_valid_transitions_defined(self):
        """SEC-03 regression: VALID_TRANSITIONS must be defined with all states."""
        from app.services.curation_session_service import (
            VALID_TRANSITIONS,
            STATUS_PENDING, STATUS_ANALYZING, STATUS_GROUPING,
            STATUS_CURATING, STATUS_COMPLETED, STATUS_FAILED,
        )
        # All target states must be defined
        assert STATUS_ANALYZING in VALID_TRANSITIONS
        assert STATUS_GROUPING in VALID_TRANSITIONS
        assert STATUS_CURATING in VALID_TRANSITIONS
        assert STATUS_COMPLETED in VALID_TRANSITIONS
        assert STATUS_FAILED in VALID_TRANSITIONS
        assert STATUS_PENDING in VALID_TRANSITIONS  # pause

    def test_start_only_from_pending(self):
        """SEC-03 regression: analyzing only reachable from pending."""
        from app.services.curation_session_service import (
            VALID_TRANSITIONS, STATUS_ANALYZING, STATUS_PENDING,
        )
        assert VALID_TRANSITIONS[STATUS_ANALYZING] == [STATUS_PENDING], (
            "REGRESSION: start_session must only work from 'pending' status"
        )

    def test_terminal_states_not_source(self):
        """SEC-03 regression: completed/failed cannot transition to anything."""
        from app.services.curation_session_service import (
            VALID_TRANSITIONS, STATUS_COMPLETED, STATUS_FAILED,
        )
        # completed and failed should not appear as source states for non-fail transitions
        for target, sources in VALID_TRANSITIONS.items():
            if target != STATUS_FAILED:  # fail can come from any active state
                assert STATUS_COMPLETED not in sources, (
                    f"REGRESSION: 'completed' must be terminal — cannot transition to {target}"
                )
                assert STATUS_FAILED not in sources, (
                    f"REGRESSION: 'failed' must be terminal — cannot transition to {target}"
                )

    def test_start_session_uses_atomic(self):
        """SEC-03 regression: start_session must use update_status_atomic."""
        from app.services.curation_session_service import CurationSessionService
        source = inspect.getsource(CurationSessionService.start_session)
        assert "update_status_atomic" in source, (
            "REGRESSION: start_session must use update_status_atomic, "
            "not read-then-update pattern"
        )

    def test_pause_session_uses_atomic(self):
        """SEC-03 regression: pause_session must use update_status_atomic."""
        from app.services.curation_session_service import CurationSessionService
        source = inspect.getsource(CurationSessionService.pause_session)
        assert "update_status_atomic" in source, (
            "REGRESSION: pause_session must use update_status_atomic"
        )

    def test_complete_session_uses_atomic(self):
        """SEC-03 regression: complete_session must use update_status_atomic."""
        from app.services.curation_session_service import CurationSessionService
        source = inspect.getsource(CurationSessionService.complete_session)
        assert "update_status_atomic" in source, (
            "REGRESSION: complete_session must use update_status_atomic"
        )

    def test_fail_session_uses_atomic(self):
        """SEC-03 regression: fail_session must use update_status_atomic."""
        from app.services.curation_session_service import CurationSessionService
        source = inspect.getsource(CurationSessionService.fail_session)
        assert "update_status_atomic" in source, (
            "REGRESSION: fail_session must use update_status_atomic"
        )

    def test_invalid_state_transition_error_exists(self):
        """SEC-03 regression: InvalidStateTransitionError must be defined."""
        from app.services.curation_session_service import InvalidStateTransitionError
        assert issubclass(InvalidStateTransitionError, Exception)
