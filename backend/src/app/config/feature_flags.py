"""Feature flag settings for RawDrive backend.

Exposes toggles via environment variables to allow gradual rollout of
025-ai-filter-simplify. Defaults are safe (disabled) unless explicitly
turned on.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class FeatureFlags(BaseSettings):
    """Feature flag configuration.

    Environment variables use the prefix `FEATURE_` to make intent clear and
    avoid collisions with other settings. Example:
    FEATURE_AI_FILTER_SIMPLIFY=true
    """

    model_config = SettingsConfigDict(env_prefix="FEATURE_", case_sensitive=False, extra="ignore")

    ai_filter_simplify: bool = False


def get_feature_flags() -> FeatureFlags:
    return FeatureFlags()
