"""A/B Testing Service for Intervention Experiments.

This service manages A/B testing of intervention strategies to optimize
churn prevention campaigns. It provides:

- Experiment creation and management
- Variant configuration and traffic allocation
- Statistical analysis for significance testing
- Automatic winner detection
- Performance reporting

Statistical Approach:
- Uses chi-squared test for conversion rate comparison
- Calculates confidence intervals using Wilson score interval
- Supports multi-variant testing (A/B/n)
- Tracks multiple metrics (primary and secondary)

Feature: Churn Prediction & Prevention System
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from enum import Enum
from typing import Any
from uuid import UUID, uuid4

from app.db.postgres import get_postgres_pool

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ExperimentStatus(str, Enum):
    """Status of an A/B experiment."""

    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    CONCLUDED = "concluded"
    ARCHIVED = "archived"


class MetricType(str, Enum):
    """Types of metrics tracked in experiments."""

    CONVERSION_RATE = "conversion_rate"
    OPEN_RATE = "open_rate"
    CLICK_RATE = "click_rate"
    REVENUE_IMPACT = "revenue_impact"
    RETENTION_RATE = "retention_rate"


# ---------------------------------------------------------------------------
# Data Classes
# ---------------------------------------------------------------------------


@dataclass
class ExperimentVariant:
    """A variant in an A/B experiment."""

    variant_id: UUID
    experiment_id: UUID
    workspace_id: UUID
    variant_name: str
    variant_description: str | None
    is_control: bool
    traffic_weight: int
    variant_config: dict[str, Any]
    total_assigned: int
    total_delivered: int
    total_opened: int
    total_clicked: int
    total_converted: int
    total_revenue_impact: Decimal
    open_rate: Decimal | None
    click_rate: Decimal | None
    conversion_rate: Decimal | None
    avg_revenue_per_client: Decimal | None
    lift_vs_control: Decimal | None
    p_value: Decimal | None
    confidence_interval_low: Decimal | None
    confidence_interval_high: Decimal | None
    created_at: datetime
    updated_at: datetime

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "variant_id": str(self.variant_id),
            "experiment_id": str(self.experiment_id),
            "variant_name": self.variant_name,
            "variant_description": self.variant_description,
            "is_control": self.is_control,
            "traffic_weight": self.traffic_weight,
            "variant_config": self.variant_config,
            "total_assigned": self.total_assigned,
            "total_delivered": self.total_delivered,
            "total_opened": self.total_opened,
            "total_clicked": self.total_clicked,
            "total_converted": self.total_converted,
            "total_revenue_impact": float(self.total_revenue_impact) if self.total_revenue_impact else 0,
            "open_rate": float(self.open_rate) if self.open_rate else None,
            "click_rate": float(self.click_rate) if self.click_rate else None,
            "conversion_rate": float(self.conversion_rate) if self.conversion_rate else None,
            "avg_revenue_per_client": float(self.avg_revenue_per_client) if self.avg_revenue_per_client else None,
            "lift_vs_control": float(self.lift_vs_control) if self.lift_vs_control else None,
            "p_value": float(self.p_value) if self.p_value else None,
            "confidence_interval": {
                "low": float(self.confidence_interval_low) if self.confidence_interval_low else None,
                "high": float(self.confidence_interval_high) if self.confidence_interval_high else None,
            },
        }


@dataclass
class Experiment:
    """An A/B experiment for testing intervention strategies."""

    experiment_id: UUID
    workspace_id: UUID
    experiment_name: str
    experiment_description: str | None
    hypothesis: str | None
    target_campaign_id: UUID | None
    target_risk_tiers: list[str]
    min_sample_size: int
    traffic_percentage: Decimal
    start_date: datetime
    end_date: datetime | None
    auto_conclude_on_significance: bool
    significance_level: Decimal
    minimum_detectable_effect: Decimal
    status: ExperimentStatus
    current_results: dict[str, Any]
    winner_variant_id: UUID | None
    statistical_significance_reached: bool
    significance_reached_at: datetime | None
    primary_metric: str
    secondary_metrics: list[str]
    created_at: datetime
    updated_at: datetime
    concluded_at: datetime | None
    variants: list[ExperimentVariant] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary."""
        return {
            "experiment_id": str(self.experiment_id),
            "workspace_id": str(self.workspace_id),
            "experiment_name": self.experiment_name,
            "experiment_description": self.experiment_description,
            "hypothesis": self.hypothesis,
            "target_campaign_id": str(self.target_campaign_id) if self.target_campaign_id else None,
            "target_risk_tiers": self.target_risk_tiers,
            "min_sample_size": self.min_sample_size,
            "traffic_percentage": float(self.traffic_percentage),
            "start_date": self.start_date.isoformat() if self.start_date else None,
            "end_date": self.end_date.isoformat() if self.end_date else None,
            "auto_conclude_on_significance": self.auto_conclude_on_significance,
            "significance_level": float(self.significance_level),
            "minimum_detectable_effect": float(self.minimum_detectable_effect),
            "status": self.status.value,
            "current_results": self.current_results,
            "winner_variant_id": str(self.winner_variant_id) if self.winner_variant_id else None,
            "statistical_significance_reached": self.statistical_significance_reached,
            "significance_reached_at": self.significance_reached_at.isoformat() if self.significance_reached_at else None,
            "primary_metric": self.primary_metric,
            "secondary_metrics": self.secondary_metrics,
            "variants": [v.to_dict() for v in self.variants],
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "concluded_at": self.concluded_at.isoformat() if self.concluded_at else None,
        }


@dataclass
class StatisticalResult:
    """Statistical analysis result for a variant comparison."""

    control_rate: float
    treatment_rate: float
    lift: float
    p_value: float
    confidence_interval: tuple[float, float]
    is_significant: bool
    sample_size_adequate: bool
    recommendation: str


# ---------------------------------------------------------------------------
# Statistical Functions
# ---------------------------------------------------------------------------


def wilson_score_interval(
    successes: int,
    total: int,
    confidence: float = 0.95,
) -> tuple[float, float]:
    """Calculate Wilson score confidence interval for a proportion.

    Args:
        successes: Number of successes
        total: Total sample size
        confidence: Confidence level (default 95%)

    Returns:
        Tuple of (lower_bound, upper_bound)
    """
    if total == 0:
        return (0.0, 0.0)

    z = 1.96  # For 95% confidence
    if confidence == 0.99:
        z = 2.576
    elif confidence == 0.90:
        z = 1.645

    p = successes / total
    n = total

    denominator = 1 + z**2 / n
    center = (p + z**2 / (2 * n)) / denominator
    margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * n)) / n) / denominator

    return (max(0, center - margin), min(1, center + margin))


def chi_squared_test(
    control_successes: int,
    control_total: int,
    treatment_successes: int,
    treatment_total: int,
) -> float:
    """Perform chi-squared test for two proportions.

    Args:
        control_successes: Successes in control group
        control_total: Total in control group
        treatment_successes: Successes in treatment group
        treatment_total: Total in treatment group

    Returns:
        p-value for the test
    """
    if control_total == 0 or treatment_total == 0:
        return 1.0

    # Calculate expected values
    total = control_total + treatment_total
    total_successes = control_successes + treatment_successes
    total_failures = total - total_successes

    expected_control_success = control_total * total_successes / total
    expected_control_failure = control_total * total_failures / total
    expected_treatment_success = treatment_total * total_successes / total
    expected_treatment_failure = treatment_total * total_failures / total

    # Avoid division by zero
    if any(e == 0 for e in [
        expected_control_success,
        expected_control_failure,
        expected_treatment_success,
        expected_treatment_failure,
    ]):
        return 1.0

    # Calculate chi-squared statistic
    control_failure = control_total - control_successes
    treatment_failure = treatment_total - treatment_successes

    chi_sq = 0
    chi_sq += (control_successes - expected_control_success) ** 2 / expected_control_success
    chi_sq += (control_failure - expected_control_failure) ** 2 / expected_control_failure
    chi_sq += (treatment_successes - expected_treatment_success) ** 2 / expected_treatment_success
    chi_sq += (treatment_failure - expected_treatment_failure) ** 2 / expected_treatment_failure

    # Convert to p-value using approximation
    # For 1 degree of freedom
    if chi_sq > 10.828:
        return 0.001
    elif chi_sq > 7.879:
        return 0.005
    elif chi_sq > 6.635:
        return 0.01
    elif chi_sq > 5.024:
        return 0.025
    elif chi_sq > 3.841:
        return 0.05
    elif chi_sq > 2.706:
        return 0.10
    else:
        # Rough approximation for larger p-values
        return min(1.0, math.exp(-chi_sq / 2))


def calculate_sample_size(
    baseline_rate: float,
    minimum_detectable_effect: float,
    significance_level: float = 0.05,
    power: float = 0.80,
) -> int:
    """Calculate required sample size per variant.

    Args:
        baseline_rate: Expected conversion rate for control
        minimum_detectable_effect: Minimum lift to detect (e.g., 0.10 for 10%)
        significance_level: Alpha (default 0.05)
        power: Statistical power (default 0.80)

    Returns:
        Required sample size per variant
    """
    if baseline_rate <= 0 or baseline_rate >= 1:
        return 100  # Default

    p1 = baseline_rate
    p2 = baseline_rate * (1 + minimum_detectable_effect)

    # Z-scores for significance and power
    z_alpha = 1.96 if significance_level == 0.05 else 2.576
    z_beta = 0.84 if power == 0.80 else 1.28

    # Pooled standard error
    p_avg = (p1 + p2) / 2
    se = math.sqrt(2 * p_avg * (1 - p_avg))

    # Effect size
    effect = abs(p2 - p1)

    if effect == 0 or se == 0:
        return 100

    # Sample size formula
    n = ((z_alpha + z_beta) ** 2 * se ** 2) / (effect ** 2)

    return max(100, int(math.ceil(n)))


# ---------------------------------------------------------------------------
# A/B Testing Service
# ---------------------------------------------------------------------------


class ABTestingService:
    """Service for managing A/B testing of intervention experiments."""

    def __init__(self):
        self._pool = None

    async def _get_pool(self):
        """Get database connection pool."""
        if self._pool is None:
            self._pool = await get_postgres_pool()
        return self._pool

    # =========================================================================
    # Experiment Management
    # =========================================================================

    async def create_experiment(
        self,
        workspace_id: UUID,
        experiment_name: str,
        hypothesis: str | None = None,
        target_campaign_id: UUID | None = None,
        target_risk_tiers: list[str] | None = None,
        min_sample_size: int = 100,
        traffic_percentage: float = 100.0,
        start_date: datetime | None = None,
        end_date: datetime | None = None,
        auto_conclude_on_significance: bool = True,
        significance_level: float = 0.05,
        minimum_detectable_effect: float = 0.10,
        primary_metric: str = "conversion_rate",
        secondary_metrics: list[str] | None = None,
        variants: list[dict[str, Any]] | None = None,
    ) -> Experiment:
        """Create a new A/B experiment.

        Args:
            workspace_id: Workspace ID
            experiment_name: Human-readable name
            hypothesis: What we're testing
            target_campaign_id: Campaign to test (optional)
            target_risk_tiers: Risk tiers to include
            min_sample_size: Minimum sample size per variant
            traffic_percentage: Percentage of eligible traffic to include
            start_date: Experiment start date
            end_date: Experiment end date
            auto_conclude_on_significance: Auto-conclude when significant
            significance_level: p-value threshold
            minimum_detectable_effect: Minimum lift to detect
            primary_metric: Primary success metric
            secondary_metrics: Secondary metrics to track
            variants: Variant configurations

        Returns:
            Created Experiment
        """
        pool = await self._get_pool()
        experiment_id = uuid4()

        if target_risk_tiers is None:
            target_risk_tiers = ["critical", "high", "medium"]

        if secondary_metrics is None:
            secondary_metrics = ["open_rate", "click_rate"]

        if start_date is None:
            start_date = datetime.now(timezone.utc)

        async with pool.acquire() as conn:
            # Create experiment
            row = await conn.fetchrow(
                """
                INSERT INTO intervention_experiments (
                    experiment_id, workspace_id, experiment_name, hypothesis,
                    target_campaign_id, target_risk_tiers, min_sample_size,
                    traffic_percentage, start_date, end_date,
                    auto_conclude_on_significance, significance_level,
                    minimum_detectable_effect, status, primary_metric,
                    secondary_metrics
                ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'draft', $14, $15
                )
                RETURNING *
                """,
                experiment_id,
                workspace_id,
                experiment_name,
                hypothesis,
                target_campaign_id,
                target_risk_tiers,
                min_sample_size,
                Decimal(str(traffic_percentage)),
                start_date,
                end_date,
                auto_conclude_on_significance,
                Decimal(str(significance_level)),
                Decimal(str(minimum_detectable_effect)),
                primary_metric,
                secondary_metrics,
            )

            # Create default variants if not provided
            if not variants:
                variants = [
                    {"name": "control", "is_control": True, "weight": 50, "config": {}},
                    {"name": "variant_a", "is_control": False, "weight": 50, "config": {}},
                ]

            for variant in variants:
                await conn.execute(
                    """
                    INSERT INTO intervention_experiment_variants (
                        experiment_id, workspace_id, variant_name,
                        variant_description, is_control, traffic_weight, variant_config
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
                    """,
                    experiment_id,
                    workspace_id,
                    variant.get("name", "variant"),
                    variant.get("description"),
                    variant.get("is_control", False),
                    variant.get("weight", 50),
                    variant.get("config", {}),
                )

        logger.info(
            f"Created experiment: {experiment_name}",
            extra={
                "experiment_id": str(experiment_id),
                "workspace_id": str(workspace_id),
            },
        )

        return await self.get_experiment(workspace_id, experiment_id)

    async def get_experiment(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
    ) -> Experiment | None:
        """Get an experiment by ID with variants.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID

        Returns:
            Experiment with variants or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT * FROM intervention_experiments
                WHERE experiment_id = $1 AND workspace_id = $2
                """,
                experiment_id,
                workspace_id,
            )

            if not row:
                return None

            variant_rows = await conn.fetch(
                """
                SELECT * FROM intervention_experiment_variants
                WHERE experiment_id = $1 AND workspace_id = $2
                ORDER BY is_control DESC, variant_name
                """,
                experiment_id,
                workspace_id,
            )

        experiment = self._row_to_experiment(row)
        experiment.variants = [self._row_to_variant(v) for v in variant_rows]

        return experiment

    async def list_experiments(
        self,
        workspace_id: UUID,
        status: ExperimentStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Experiment]:
        """List experiments for a workspace.

        Args:
            workspace_id: Workspace ID
            status: Filter by status
            limit: Maximum results
            offset: Pagination offset

        Returns:
            List of experiments
        """
        pool = await self._get_pool()

        query = """
            SELECT * FROM intervention_experiments
            WHERE workspace_id = $1
        """
        params: list[Any] = [workspace_id]
        param_idx = 2

        if status:
            query += f" AND status = ${param_idx}"
            params.append(status.value)
            param_idx += 1

        query += f" ORDER BY created_at DESC LIMIT ${param_idx} OFFSET ${param_idx + 1}"
        params.extend([limit, offset])

        async with pool.acquire() as conn:
            rows = await conn.fetch(query, *params)

        experiments = []
        for row in rows:
            exp = self._row_to_experiment(row)
            # Get variants
            full_exp = await self.get_experiment(workspace_id, exp.experiment_id)
            if full_exp:
                experiments.append(full_exp)

        return experiments

    async def start_experiment(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
    ) -> Experiment | None:
        """Start an experiment.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID

        Returns:
            Updated experiment or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE intervention_experiments
                SET status = 'active',
                    start_date = COALESCE(start_date, NOW()),
                    updated_at = NOW()
                WHERE experiment_id = $1 AND workspace_id = $2
                AND status = 'draft'
                """,
                experiment_id,
                workspace_id,
            )

        logger.info(f"Started experiment {experiment_id}")
        return await self.get_experiment(workspace_id, experiment_id)

    async def pause_experiment(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
    ) -> Experiment | None:
        """Pause an active experiment.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID

        Returns:
            Updated experiment or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE intervention_experiments
                SET status = 'paused', updated_at = NOW()
                WHERE experiment_id = $1 AND workspace_id = $2
                AND status = 'active'
                """,
                experiment_id,
                workspace_id,
            )

        return await self.get_experiment(workspace_id, experiment_id)

    async def conclude_experiment(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
        winner_variant_id: UUID | None = None,
    ) -> Experiment | None:
        """Conclude an experiment with optional winner.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID
            winner_variant_id: Optional winning variant

        Returns:
            Updated experiment or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE intervention_experiments
                SET status = 'concluded',
                    concluded_at = NOW(),
                    winner_variant_id = COALESCE($3, winner_variant_id),
                    updated_at = NOW()
                WHERE experiment_id = $1 AND workspace_id = $2
                AND status IN ('active', 'paused')
                """,
                experiment_id,
                workspace_id,
                winner_variant_id,
            )

        logger.info(
            f"Concluded experiment {experiment_id}",
            extra={"winner_variant_id": str(winner_variant_id) if winner_variant_id else None},
        )

        return await self.get_experiment(workspace_id, experiment_id)

    # =========================================================================
    # Variant Management
    # =========================================================================

    async def add_variant(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
        variant_name: str,
        variant_config: dict[str, Any],
        traffic_weight: int = 50,
        is_control: bool = False,
        description: str | None = None,
    ) -> ExperimentVariant | None:
        """Add a variant to an experiment.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID
            variant_name: Name of the variant
            variant_config: Variant configuration
            traffic_weight: Traffic allocation weight
            is_control: Whether this is the control group
            description: Optional description

        Returns:
            Created variant or None
        """
        pool = await self._get_pool()
        variant_id = uuid4()

        async with pool.acquire() as conn:
            # Verify experiment exists and is not active
            status = await conn.fetchval(
                """
                SELECT status FROM intervention_experiments
                WHERE experiment_id = $1 AND workspace_id = $2
                """,
                experiment_id,
                workspace_id,
            )

            if status not in [None, "draft"]:
                logger.warning(f"Cannot add variant to {status} experiment")
                return None

            row = await conn.fetchrow(
                """
                INSERT INTO intervention_experiment_variants (
                    variant_id, experiment_id, workspace_id, variant_name,
                    variant_description, is_control, traffic_weight, variant_config
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING *
                """,
                variant_id,
                experiment_id,
                workspace_id,
                variant_name,
                description,
                is_control,
                traffic_weight,
                variant_config,
            )

        return self._row_to_variant(row) if row else None

    async def update_variant_config(
        self,
        workspace_id: UUID,
        variant_id: UUID,
        variant_config: dict[str, Any],
    ) -> ExperimentVariant | None:
        """Update a variant's configuration.

        Args:
            workspace_id: Workspace ID
            variant_id: Variant ID
            variant_config: New configuration

        Returns:
            Updated variant or None
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                UPDATE intervention_experiment_variants
                SET variant_config = $3, updated_at = NOW()
                WHERE variant_id = $1 AND workspace_id = $2
                RETURNING *
                """,
                variant_id,
                workspace_id,
                variant_config,
            )

        return self._row_to_variant(row) if row else None

    # =========================================================================
    # Statistical Analysis
    # =========================================================================

    async def analyze_experiment(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
    ) -> dict[str, Any]:
        """Perform statistical analysis on an experiment.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID

        Returns:
            Analysis results
        """
        experiment = await self.get_experiment(workspace_id, experiment_id)
        if not experiment:
            return {"error": "Experiment not found"}

        if len(experiment.variants) < 2:
            return {"error": "Experiment needs at least 2 variants"}

        # Find control
        control = next((v for v in experiment.variants if v.is_control), None)
        if not control:
            control = experiment.variants[0]

        results = {
            "experiment_id": str(experiment_id),
            "experiment_name": experiment.experiment_name,
            "status": experiment.status.value,
            "primary_metric": experiment.primary_metric,
            "sample_sizes": {},
            "variants": [],
            "significance_reached": False,
            "winner": None,
            "recommendation": "Continue collecting data",
        }

        # Control metrics
        control_delivered = control.total_delivered or 0
        control_converted = control.total_converted or 0
        control_rate = control_converted / max(control_delivered, 1)

        results["sample_sizes"]["control"] = control_delivered
        results["variants"].append({
            "variant_id": str(control.variant_id),
            "variant_name": control.variant_name,
            "is_control": True,
            "sample_size": control_delivered,
            "conversions": control_converted,
            "conversion_rate": round(control_rate * 100, 2),
            "lift": 0,
            "p_value": None,
            "is_significant": False,
        })

        # Analyze each treatment variant
        all_significant = True
        best_variant = None
        best_lift = 0

        for variant in experiment.variants:
            if variant.is_control:
                continue

            treatment_delivered = variant.total_delivered or 0
            treatment_converted = variant.total_converted or 0
            treatment_rate = treatment_converted / max(treatment_delivered, 1)

            results["sample_sizes"][variant.variant_name] = treatment_delivered

            # Statistical test
            p_value = chi_squared_test(
                control_successes=control_converted,
                control_total=control_delivered,
                treatment_successes=treatment_converted,
                treatment_total=treatment_delivered,
            )

            # Calculate lift
            lift = 0
            if control_rate > 0:
                lift = (treatment_rate - control_rate) / control_rate

            # Confidence interval
            ci = wilson_score_interval(treatment_converted, treatment_delivered)

            is_significant = p_value < float(experiment.significance_level)

            if not is_significant:
                all_significant = False

            # Track best performer
            if lift > best_lift and is_significant:
                best_lift = lift
                best_variant = variant

            results["variants"].append({
                "variant_id": str(variant.variant_id),
                "variant_name": variant.variant_name,
                "is_control": False,
                "sample_size": treatment_delivered,
                "conversions": treatment_converted,
                "conversion_rate": round(treatment_rate * 100, 2),
                "lift": round(lift * 100, 2),
                "p_value": round(p_value, 4),
                "is_significant": is_significant,
                "confidence_interval": {
                    "low": round(ci[0] * 100, 2),
                    "high": round(ci[1] * 100, 2),
                },
            })

        # Determine overall result
        total_sample = sum(results["sample_sizes"].values())
        min_sample = experiment.min_sample_size * len(experiment.variants)

        if total_sample >= min_sample:
            if best_variant and all_significant:
                results["significance_reached"] = True
                results["winner"] = {
                    "variant_id": str(best_variant.variant_id),
                    "variant_name": best_variant.variant_name,
                    "lift": round(best_lift * 100, 2),
                }
                results["recommendation"] = f"Implement {best_variant.variant_name} - shows {round(best_lift * 100, 1)}% lift with statistical significance"
            elif all_significant:
                results["recommendation"] = "No variant significantly outperforms control - consider new hypothesis"
            else:
                results["recommendation"] = "Continue collecting data until significance reached"
        else:
            remaining = min_sample - total_sample
            results["recommendation"] = f"Need {remaining} more samples for reliable results"

        # Update experiment with results
        await self._update_experiment_results(
            workspace_id,
            experiment_id,
            results,
        )

        return results

    async def _update_experiment_results(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
        results: dict[str, Any],
    ) -> None:
        """Update experiment with analysis results.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID
            results: Analysis results
        """
        pool = await self._get_pool()

        significance_reached = results.get("significance_reached", False)
        winner = results.get("winner")
        winner_id = UUID(winner["variant_id"]) if winner else None

        async with pool.acquire() as conn:
            await conn.execute(
                """
                UPDATE intervention_experiments
                SET current_results = $3,
                    statistical_significance_reached = $4,
                    significance_reached_at = CASE WHEN $4 AND significance_reached_at IS NULL THEN NOW() ELSE significance_reached_at END,
                    winner_variant_id = COALESCE($5, winner_variant_id),
                    updated_at = NOW()
                WHERE experiment_id = $1 AND workspace_id = $2
                """,
                experiment_id,
                workspace_id,
                results,
                significance_reached,
                winner_id,
            )

            # Update variant statistics
            for variant_data in results.get("variants", []):
                variant_id = UUID(variant_data["variant_id"])
                await conn.execute(
                    """
                    UPDATE intervention_experiment_variants
                    SET conversion_rate = $3,
                        lift_vs_control = CASE WHEN NOT $4 THEN $5 ELSE NULL END,
                        p_value = $6,
                        confidence_interval_low = $7,
                        confidence_interval_high = $8,
                        updated_at = NOW()
                    WHERE variant_id = $1 AND workspace_id = $2
                    """,
                    variant_id,
                    workspace_id,
                    Decimal(str(variant_data["conversion_rate"] / 100)) if variant_data.get("conversion_rate") else None,
                    variant_data.get("is_control", False),
                    Decimal(str(variant_data["lift"] / 100)) if variant_data.get("lift") else None,
                    Decimal(str(variant_data["p_value"])) if variant_data.get("p_value") else None,
                    Decimal(str(variant_data["confidence_interval"]["low"] / 100)) if variant_data.get("confidence_interval") else None,
                    Decimal(str(variant_data["confidence_interval"]["high"] / 100)) if variant_data.get("confidence_interval") else None,
                )

        # Auto-conclude if configured
        experiment = await self.get_experiment(workspace_id, experiment_id)
        if experiment and experiment.auto_conclude_on_significance and significance_reached:
            await self.conclude_experiment(workspace_id, experiment_id, winner_id)
            logger.info(f"Auto-concluded experiment {experiment_id} with winner {winner_id}")

    async def update_variant_metrics(
        self,
        workspace_id: UUID,
        experiment_id: UUID,
    ) -> None:
        """Update variant metrics from intervention actions.

        Args:
            workspace_id: Workspace ID
            experiment_id: Experiment ID
        """
        pool = await self._get_pool()

        async with pool.acquire() as conn:
            # Update metrics for each variant
            await conn.execute(
                """
                UPDATE intervention_experiment_variants v
                SET
                    total_assigned = COALESCE(agg.assigned, 0),
                    total_delivered = COALESCE(agg.delivered, 0),
                    total_opened = COALESCE(agg.opened, 0),
                    total_clicked = COALESCE(agg.clicked, 0),
                    total_converted = COALESCE(agg.converted, 0),
                    total_revenue_impact = COALESCE(agg.revenue, 0),
                    open_rate = CASE WHEN agg.delivered > 0 THEN agg.opened::DECIMAL / agg.delivered ELSE NULL END,
                    click_rate = CASE WHEN agg.opened > 0 THEN agg.clicked::DECIMAL / agg.opened ELSE NULL END,
                    avg_revenue_per_client = CASE WHEN agg.converted > 0 THEN agg.revenue / agg.converted ELSE NULL END,
                    updated_at = NOW()
                FROM (
                    SELECT
                        ia.variant_id,
                        COUNT(*) as assigned,
                        COUNT(*) FILTER (WHERE ia.delivery_status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE ia.opened_at IS NOT NULL) as opened,
                        COUNT(*) FILTER (WHERE ia.clicked_at IS NOT NULL) as clicked,
                        COUNT(*) FILTER (WHERE ia.outcome IN ('converted', 'reactivated', 'renewed', 'upgraded')) as converted,
                        COALESCE(SUM(ia.outcome_revenue_impact) FILTER (WHERE ia.attributed_to_intervention), 0) as revenue
                    FROM intervention_actions ia
                    WHERE ia.experiment_id = $1 AND ia.workspace_id = $2
                    GROUP BY ia.variant_id
                ) agg
                WHERE v.variant_id = agg.variant_id
                AND v.experiment_id = $1
                AND v.workspace_id = $2
                """,
                experiment_id,
                workspace_id,
            )

    # =========================================================================
    # Sample Size Calculation
    # =========================================================================

    async def estimate_sample_size(
        self,
        workspace_id: UUID,
        baseline_conversion_rate: float | None = None,
        minimum_detectable_effect: float = 0.10,
        significance_level: float = 0.05,
        power: float = 0.80,
    ) -> dict[str, Any]:
        """Estimate required sample size for an experiment.

        Args:
            workspace_id: Workspace ID
            baseline_conversion_rate: Expected control conversion rate (or calculate from history)
            minimum_detectable_effect: Minimum lift to detect
            significance_level: Alpha
            power: Statistical power

        Returns:
            Sample size estimation
        """
        pool = await self._get_pool()

        # Get baseline from historical data if not provided
        if baseline_conversion_rate is None:
            async with pool.acquire() as conn:
                result = await conn.fetchrow(
                    """
                    SELECT
                        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as delivered,
                        COUNT(*) FILTER (WHERE outcome IN ('converted', 'reactivated', 'renewed')) as converted
                    FROM intervention_actions
                    WHERE workspace_id = $1
                    AND triggered_at >= NOW() - INTERVAL '90 days'
                    """,
                    workspace_id,
                )

            if result and result["delivered"] > 0:
                baseline_conversion_rate = result["converted"] / result["delivered"]
            else:
                baseline_conversion_rate = 0.10  # Default assumption

        # Calculate sample size
        sample_per_variant = calculate_sample_size(
            baseline_rate=baseline_conversion_rate,
            minimum_detectable_effect=minimum_detectable_effect,
            significance_level=significance_level,
            power=power,
        )

        return {
            "baseline_conversion_rate": round(baseline_conversion_rate * 100, 2),
            "minimum_detectable_effect": round(minimum_detectable_effect * 100, 1),
            "significance_level": significance_level,
            "power": power,
            "sample_size_per_variant": sample_per_variant,
            "total_sample_for_2_variants": sample_per_variant * 2,
            "total_sample_for_3_variants": sample_per_variant * 3,
        }

    # =========================================================================
    # Helper Methods
    # =========================================================================

    def _row_to_experiment(self, row) -> Experiment:
        """Convert database row to Experiment object."""
        return Experiment(
            experiment_id=row["experiment_id"],
            workspace_id=row["workspace_id"],
            experiment_name=row["experiment_name"],
            experiment_description=row.get("experiment_description"),
            hypothesis=row.get("hypothesis"),
            target_campaign_id=row.get("target_campaign_id"),
            target_risk_tiers=row.get("target_risk_tiers") or [],
            min_sample_size=row.get("min_sample_size") or 100,
            traffic_percentage=row.get("traffic_percentage") or Decimal("100"),
            start_date=row["start_date"],
            end_date=row.get("end_date"),
            auto_conclude_on_significance=row.get("auto_conclude_on_significance", True),
            significance_level=row.get("significance_level") or Decimal("0.05"),
            minimum_detectable_effect=row.get("minimum_detectable_effect") or Decimal("0.10"),
            status=ExperimentStatus(row["status"]),
            current_results=row.get("current_results") or {},
            winner_variant_id=row.get("winner_variant_id"),
            statistical_significance_reached=row.get("statistical_significance_reached", False),
            significance_reached_at=row.get("significance_reached_at"),
            primary_metric=row.get("primary_metric") or "conversion_rate",
            secondary_metrics=row.get("secondary_metrics") or [],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            concluded_at=row.get("concluded_at"),
        )

    def _row_to_variant(self, row) -> ExperimentVariant:
        """Convert database row to ExperimentVariant object."""
        return ExperimentVariant(
            variant_id=row["variant_id"],
            experiment_id=row["experiment_id"],
            workspace_id=row["workspace_id"],
            variant_name=row["variant_name"],
            variant_description=row.get("variant_description"),
            is_control=row.get("is_control", False),
            traffic_weight=row.get("traffic_weight") or 50,
            variant_config=row.get("variant_config") or {},
            total_assigned=row.get("total_assigned") or 0,
            total_delivered=row.get("total_delivered") or 0,
            total_opened=row.get("total_opened") or 0,
            total_clicked=row.get("total_clicked") or 0,
            total_converted=row.get("total_converted") or 0,
            total_revenue_impact=row.get("total_revenue_impact") or Decimal("0"),
            open_rate=row.get("open_rate"),
            click_rate=row.get("click_rate"),
            conversion_rate=row.get("conversion_rate"),
            avg_revenue_per_client=row.get("avg_revenue_per_client"),
            lift_vs_control=row.get("lift_vs_control"),
            p_value=row.get("p_value"),
            confidence_interval_low=row.get("confidence_interval_low"),
            confidence_interval_high=row.get("confidence_interval_high"),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


# ---------------------------------------------------------------------------
# Singleton Instance
# ---------------------------------------------------------------------------

_ab_testing_service: ABTestingService | None = None


def get_ab_testing_service() -> ABTestingService:
    """Get the A/B testing service singleton."""
    global _ab_testing_service
    if _ab_testing_service is None:
        _ab_testing_service = ABTestingService()
    return _ab_testing_service
