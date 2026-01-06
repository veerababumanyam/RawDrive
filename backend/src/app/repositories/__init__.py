"""Repository layer for data access.

This module provides repository classes that encapsulate database
operations, separating data access logic from business logic.

Repositories:
- AnalyticsRepository: Analytics event tracking and aggregation
- RecycleBinRepository: Soft delete and restore operations
- FaceEmbeddingRepository: pgvector-based face embedding operations
- FaceRepository: Face record CRUD operations
- FaceGroupRepository: Face group (cluster) CRUD operations
- PlanRepository: Subscription plan queries and management
- SubscriptionRepository: Workspace subscription CRUD operations
- ComplianceRepository: Compliance data CRUD operations (DSR, Legal Holds, etc.)
"""

from app.repositories.analytics_repository import (
    AnalyticsRepository,
    get_analytics_repository,
)
from app.repositories.recycle_bin_repository import (
    RecycleBinRepository,
    get_recycle_bin_repository,
)
from app.repositories.face_embedding_repository import (
    FaceEmbeddingRepository,
    get_face_embedding_repository,
)
from app.repositories.face_repository import (
    FaceRepository,
    get_face_repository,
)
from app.repositories.face_group_repository import (
    FaceGroupRepository,
    get_face_group_repository,
)
from app.repositories.plan_repository import (
    PlanRepository,
    get_plan_repository,
)
from app.repositories.subscription_repository import (
    SubscriptionRepository,
    get_subscription_repository,
)
from app.repositories.compliance_repository import (
    ComplianceRepository,
    get_compliance_repository,
)

__all__ = [
    # Analytics
    "AnalyticsRepository",
    "get_analytics_repository",
    # Recycle bin
    "RecycleBinRepository",
    "get_recycle_bin_repository",
    # Face detection - embeddings
    "FaceEmbeddingRepository",
    "get_face_embedding_repository",
    # Face detection - faces
    "FaceRepository",
    "get_face_repository",
    # Face detection - groups
    "FaceGroupRepository",
    "get_face_group_repository",
    # Subscription plans
    "PlanRepository",
    "get_plan_repository",
    # Workspace subscriptions
    "SubscriptionRepository",
    "get_subscription_repository",
    # Compliance (DSR, Legal Holds, Retention, Incidents)
    "ComplianceRepository",
    "get_compliance_repository",
]
