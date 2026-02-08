"""Create webhook integration templates and workflows tables.

Revision ID: 0189
Revises: 0188
Create Date: 2026-02-01 15:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY


# revision identifiers, used by Alembic.
revision = "0189a"
down_revision = "0189"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create webhook integration templates and related tables."""

    # =========================================================================
    # 1. WEBHOOK INTEGRATION TEMPLATES (Pre-built templates for Zapier/Make.com)
    # =========================================================================
    op.create_table(
        "webhook_integration_templates",
        # Primary keys
        sa.Column("template_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),

        # Template identification
        sa.Column("slug", sa.String(100), nullable=False, unique=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("short_description", sa.String(500), nullable=False),
        sa.Column("long_description", sa.Text, nullable=True),

        # Categorization
        sa.Column("category", sa.String(50), nullable=False),  # communication, crm, project_management, analytics
        sa.Column("integration_type", sa.String(50), nullable=False),  # zapier, make, native, custom
        sa.Column("tags", ARRAY(sa.String(50)), nullable=False, server_default="{}"),

        # Integration details
        sa.Column("provider", sa.String(50), nullable=True),  # slack, gmail, asana, notion, etc.
        sa.Column("provider_logo_url", sa.String(500), nullable=True),
        sa.Column("provider_website", sa.String(500), nullable=True),

        # Template configuration
        sa.Column("trigger_events", ARRAY(sa.String(100)), nullable=False),  # event types that trigger this
        sa.Column("default_config", JSONB, nullable=False, server_default="{}"),  # default webhook config
        sa.Column("payload_transform", JSONB, nullable=True),  # optional payload transformation rules
        sa.Column("required_fields", ARRAY(sa.String(100)), nullable=False, server_default="{}"),

        # Visual workflow builder data
        sa.Column("workflow_steps", JSONB, nullable=True),  # visual workflow steps definition
        sa.Column("sample_payload", JSONB, nullable=True),

        # Best practices and documentation
        sa.Column("setup_instructions", sa.Text, nullable=True),
        sa.Column("use_cases", JSONB, nullable=True),  # array of use case descriptions
        sa.Column("best_practices", JSONB, nullable=True),  # tips and best practices
        sa.Column("documentation_url", sa.String(500), nullable=True),

        # Metrics and popularity
        sa.Column("usage_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("rating", sa.Float, nullable=True),
        sa.Column("rating_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_featured", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_premium", sa.Boolean, nullable=False, server_default="false"),

        # Status
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="true"),  # system vs user-created

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Indexes for template lookup
    op.create_index("ix_webhook_templates_category", "webhook_integration_templates", ["category"])
    op.create_index("ix_webhook_templates_integration_type", "webhook_integration_templates", ["integration_type"])
    op.create_index("ix_webhook_templates_provider", "webhook_integration_templates", ["provider"])
    op.create_index("ix_webhook_templates_is_active", "webhook_integration_templates", ["is_active"])
    op.create_index("ix_webhook_templates_is_featured", "webhook_integration_templates", ["is_featured"])
    op.create_index("ix_webhook_templates_usage_count", "webhook_integration_templates", ["usage_count"])
    op.create_index("ix_webhook_templates_tags", "webhook_integration_templates", ["tags"], postgresql_using="gin")

    # =========================================================================
    # 2. WORKSPACE WEBHOOK WORKFLOWS (User-created workflows from templates)
    # =========================================================================
    op.create_table(
        "webhook_workflows",
        # Primary keys
        sa.Column("workflow_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),

        # Workflow identification
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),

        # Template reference (optional - can be custom workflow)
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("webhook_integration_templates.template_id", ondelete="SET NULL"), nullable=True),

        # Workflow definition
        sa.Column("trigger_events", ARRAY(sa.String(100)), nullable=False),
        sa.Column("trigger_conditions", JSONB, nullable=True),  # optional filtering conditions
        sa.Column("workflow_steps", JSONB, nullable=False),  # array of action steps
        sa.Column("configuration", JSONB, nullable=False, server_default="{}"),

        # Associated webhook subscription (if any)
        sa.Column("subscription_id", UUID(as_uuid=True), nullable=True),

        # Execution settings
        sa.Column("retry_policy", JSONB, nullable=True),
        sa.Column("timeout_seconds", sa.Integer, nullable=False, server_default="30"),
        sa.Column("rate_limit", sa.Integer, nullable=True),  # max executions per minute

        # Status
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("last_executed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("execution_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("success_count", sa.Integer, nullable=False, server_default="0"),
        sa.Column("failure_count", sa.Integer, nullable=False, server_default="0"),

        # Ownership
        sa.Column("created_by_user_id", UUID(as_uuid=True), nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Indexes for workflow lookup
    op.create_index("ix_webhook_workflows_workspace_id", "webhook_workflows", ["workspace_id"])
    op.create_index("ix_webhook_workflows_template_id", "webhook_workflows", ["template_id"])
    op.create_index("ix_webhook_workflows_subscription_id", "webhook_workflows", ["subscription_id"])
    op.create_index("ix_webhook_workflows_is_active", "webhook_workflows", ["is_active"])
    op.create_index("ix_webhook_workflows_trigger_events", "webhook_workflows", ["trigger_events"], postgresql_using="gin")

    # =========================================================================
    # 3. WORKFLOW STEPS (Individual steps in a workflow)
    # =========================================================================
    op.create_table(
        "webhook_workflow_steps",
        # Primary keys
        sa.Column("step_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("webhook_workflows.workflow_id", ondelete="CASCADE"), nullable=False),

        # Step definition
        sa.Column("step_order", sa.Integer, nullable=False),
        sa.Column("step_type", sa.String(50), nullable=False),  # http_request, transform, condition, delay
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text, nullable=True),

        # Step configuration
        sa.Column("configuration", JSONB, nullable=False),
        sa.Column("input_mapping", JSONB, nullable=True),  # maps data from previous steps
        sa.Column("output_mapping", JSONB, nullable=True),  # maps data to next steps

        # Conditional execution
        sa.Column("condition", JSONB, nullable=True),  # when to execute this step
        sa.Column("continue_on_error", sa.Boolean, nullable=False, server_default="false"),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Indexes
    op.create_index("ix_workflow_steps_workflow_id", "webhook_workflow_steps", ["workflow_id"])
    op.create_index("ix_workflow_steps_step_order", "webhook_workflow_steps", ["workflow_id", "step_order"])

    # =========================================================================
    # 4. WORKFLOW EXECUTIONS (Execution history)
    # =========================================================================
    op.create_table(
        "webhook_workflow_executions",
        # Primary keys
        sa.Column("execution_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("workflow_id", UUID(as_uuid=True), sa.ForeignKey("webhook_workflows.workflow_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),

        # Trigger information
        sa.Column("trigger_event_id", UUID(as_uuid=True), nullable=True),
        sa.Column("trigger_event_type", sa.String(100), nullable=False),
        sa.Column("trigger_payload", JSONB, nullable=True),

        # Execution status
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),  # pending, running, completed, failed, cancelled
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer, nullable=True),

        # Step execution results
        sa.Column("steps_completed", sa.Integer, nullable=False, server_default="0"),
        sa.Column("steps_total", sa.Integer, nullable=False),
        sa.Column("step_results", JSONB, nullable=True),  # results from each step

        # Error handling
        sa.Column("error_message", sa.Text, nullable=True),
        sa.Column("error_step_id", UUID(as_uuid=True), nullable=True),
        sa.Column("retry_count", sa.Integer, nullable=False, server_default="0"),

        # Final output
        sa.Column("output", JSONB, nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Indexes
    op.create_index("ix_workflow_executions_workflow_id", "webhook_workflow_executions", ["workflow_id"])
    op.create_index("ix_workflow_executions_workspace_id", "webhook_workflow_executions", ["workspace_id"])
    op.create_index("ix_workflow_executions_status", "webhook_workflow_executions", ["status"])
    op.create_index("ix_workflow_executions_created_at", "webhook_workflow_executions", ["created_at"])
    op.create_index("ix_workflow_executions_trigger_event_type", "webhook_workflow_executions", ["trigger_event_type"])

    # =========================================================================
    # 5. TEMPLATE USAGE TRACKING (Analytics for template popularity)
    # =========================================================================
    op.create_table(
        "webhook_template_usage",
        # Primary keys
        sa.Column("usage_id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("template_id", UUID(as_uuid=True), sa.ForeignKey("webhook_integration_templates.template_id", ondelete="CASCADE"), nullable=False),
        sa.Column("workspace_id", UUID(as_uuid=True), nullable=False),

        # Usage type
        sa.Column("action", sa.String(50), nullable=False),  # viewed, installed, removed, rated
        sa.Column("workflow_id", UUID(as_uuid=True), nullable=True),  # if action is installed
        sa.Column("rating", sa.Integer, nullable=True),  # 1-5 stars if rated
        sa.Column("feedback", sa.Text, nullable=True),

        # User context
        sa.Column("user_id", UUID(as_uuid=True), nullable=True),

        # Timestamps
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=False),
    )

    # Indexes
    op.create_index("ix_template_usage_template_id", "webhook_template_usage", ["template_id"])
    op.create_index("ix_template_usage_workspace_id", "webhook_template_usage", ["workspace_id"])
    op.create_index("ix_template_usage_action", "webhook_template_usage", ["action"])

    # =========================================================================
    # 6. SEED PRE-BUILT TEMPLATES (Skipped - will be loaded via data migration)
    # ===================================================================== ====
    pass


def downgrade() -> None:
    """Drop webhook integration templates tables."""
    op.drop_table("webhook_template_usage")
    op.drop_table("webhook_workflow_executions")
    op.drop_table("webhook_workflow_steps")
    op.drop_table("webhook_workflows")
    op.drop_table("webhook_integration_templates")
