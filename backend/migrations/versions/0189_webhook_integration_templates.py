"""Create webhook integration templates and workflows tables.

Revision ID: 0189
Revises: 0188
Create Date: 2026-02-01 15:00:00.000000
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY


# revision identifiers, used by Alembic.
revision = "0189"
down_revision = "0188"
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
        sa.Column("status", sa.String(20), nullable=False, server_default="'pending'"),  # pending, running, completed, failed, cancelled
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
    # 6. SEED PRE-BUILT TEMPLATES
    # =========================================================================
    op.execute("""
        INSERT INTO webhook_integration_templates (
            slug, name, short_description, long_description,
            category, integration_type, tags, provider, provider_logo_url,
            trigger_events, default_config, workflow_steps, sample_payload,
            setup_instructions, use_cases, best_practices, is_featured, is_system
        ) VALUES
        -- Communication Templates
        (
            'slack-gallery-published',
            'Notify Slack when gallery published',
            'Send a Slack message to your team channel when a gallery is published',
            'Automatically notify your team on Slack whenever a new gallery is published. Great for keeping your team informed about new client deliveries.',
            'communication',
            'zapier',
            ARRAY['slack', 'notification', 'team', 'gallery'],
            'slack',
            'https://cdn.rawdrive.io/integrations/slack-logo.svg',
            ARRAY['gallery.published'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Gallery Published", "event": "gallery.published"},
                {"type": "transform", "name": "Format Message", "config": {"template": "🎉 Gallery \"{{title}}\" published with {{asset_count}} photos"}},
                {"type": "http_request", "name": "Send to Slack", "config": {"method": "POST", "url": "{{slack_webhook_url}}"}}
            ]'::jsonb,
            '{"workspace_id": "uuid", "gallery_id": "uuid", "title": "Smith Wedding", "public_url": "https://...", "asset_count": 450}'::jsonb,
            '1. Create a Slack Incoming Webhook at https://api.slack.com/messaging/webhooks\n2. Copy the webhook URL\n3. Use this template and paste your webhook URL\n4. Test the integration',
            '["Notify team when client galleries are ready", "Celebrate project completions", "Keep remote teams updated"]'::jsonb,
            '{"tips": ["Use a dedicated channel for gallery notifications", "Include relevant details like client name and photo count"]}'::jsonb,
            true,
            true
        ),
        (
            'email-gallery-shared',
            'Send email when gallery is shared',
            'Automatically send a customized email notification when a gallery is shared with a client',
            'Keep clients informed with professional email notifications when their gallery is ready. Works with Gmail, Outlook, or any SMTP provider via Zapier.',
            'communication',
            'zapier',
            ARRAY['email', 'notification', 'client', 'gallery'],
            'gmail',
            'https://cdn.rawdrive.io/integrations/gmail-logo.svg',
            ARRAY['gallery.shared'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 5}'::jsonb,
            '[
                {"type": "trigger", "name": "Gallery Shared", "event": "gallery.shared"},
                {"type": "transform", "name": "Compose Email", "config": {"subject": "Your gallery is ready!", "body_template": "Dear {{client_name}},\\n\\nYour gallery is now available at: {{share_link}}"}},
                {"type": "http_request", "name": "Send Email", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"workspace_id": "uuid", "gallery_id": "uuid", "client_email": "client@example.com", "share_link": "https://..."}'::jsonb,
            '1. Connect your Gmail account to Zapier\n2. Use this template to create your workflow\n3. Customize the email template\n4. Test with a sample gallery share',
            '["Welcome emails for new client galleries", "Professional delivery notifications", "Automated follow-ups"]'::jsonb,
            '{"tips": ["Personalize emails with client name", "Include direct gallery links", "Add your studio branding"]}'::jsonb,
            true,
            true
        ),
        -- Project Management Templates
        (
            'asana-task-on-rsvp',
            'Create Asana task on RSVP received',
            'Automatically create an Asana task when an RSVP is received for your event',
            'Never miss an RSVP! Automatically create Asana tasks when guests respond to your invitations, helping you track event preparation tasks.',
            'project_management',
            'zapier',
            ARRAY['asana', 'task', 'rsvp', 'invitation', 'event'],
            'asana',
            'https://cdn.rawdrive.io/integrations/asana-logo.svg',
            ARRAY['invitation.rsvp_received'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "RSVP Received", "event": "invitation.rsvp_received"},
                {"type": "condition", "name": "Check RSVP Status", "config": {"field": "rsvp_status", "operator": "equals", "value": "attending"}},
                {"type": "transform", "name": "Create Task Data", "config": {"title": "{{guest_name}} - {{rsvp_status}}", "description": "Guest count: {{guest_count}}\\nDietary requirements: {{dietary_requirements}}"}},
                {"type": "http_request", "name": "Create Asana Task", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"invitation_id": "uuid", "guest_name": "John Doe", "rsvp_status": "attending", "guest_count": 2, "dietary_requirements": "vegetarian"}'::jsonb,
            '1. Connect Asana to Zapier\n2. Select your project and section\n3. Use this template\n4. Test with a sample RSVP',
            '["Track guest RSVPs", "Manage catering requirements", "Coordinate event logistics"]'::jsonb,
            '{"tips": ["Create separate sections for attending vs declined", "Tag tasks with dietary requirements"]}'::jsonb,
            false,
            true
        ),
        (
            'notion-client-created',
            'Add to Notion database on new client',
            'Automatically add new clients to your Notion CRM database',
            'Keep your Notion CRM synchronized with RawDrive. Every new client is automatically added to your Notion database.',
            'crm',
            'zapier',
            ARRAY['notion', 'crm', 'client', 'database'],
            'notion',
            'https://cdn.rawdrive.io/integrations/notion-logo.svg',
            ARRAY['client.created'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Client Created", "event": "client.created"},
                {"type": "transform", "name": "Map to Notion Fields", "config": {"name": "{{name}}", "email": "{{email}}", "phone": "{{phone}}", "created_date": "{{created_at}}"}},
                {"type": "http_request", "name": "Add to Notion", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"workspace_id": "uuid", "client_id": "uuid", "name": "Sarah Johnson", "email": "sarah@example.com", "phone": "+1234567890"}'::jsonb,
            '1. Connect Notion to Zapier\n2. Select your CRM database\n3. Map the fields from RawDrive\n4. Test with a sample client',
            '["Sync client data to Notion CRM", "Build client databases automatically", "Track client history"]'::jsonb,
            '{"tips": ["Use a dedicated CRM database in Notion", "Include fields for status and notes"]}'::jsonb,
            true,
            true
        ),
        -- CRM Templates
        (
            'hubspot-contact-sync',
            'Sync clients to HubSpot CRM',
            'Automatically create or update HubSpot contacts when clients are created or updated',
            'Keep your HubSpot CRM in sync with RawDrive. New clients become contacts, and updates flow both ways.',
            'crm',
            'zapier',
            ARRAY['hubspot', 'crm', 'client', 'sync', 'contacts'],
            'hubspot',
            'https://cdn.rawdrive.io/integrations/hubspot-logo.svg',
            ARRAY['client.created', 'client.updated'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Client Changed", "event": "client.created,client.updated"},
                {"type": "transform", "name": "Map Contact Fields", "config": {"firstname": "{{name.split(\" \")[0]}}", "lastname": "{{name.split(\" \").slice(1).join(\" \")}}", "email": "{{email}}"}},
                {"type": "http_request", "name": "Upsert HubSpot Contact", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"workspace_id": "uuid", "client_id": "uuid", "name": "Sarah Johnson", "email": "sarah@example.com"}'::jsonb,
            '1. Connect HubSpot to Zapier\n2. Use this template\n3. Map RawDrive fields to HubSpot properties\n4. Enable the workflow',
            '["Maintain a unified client database", "Track interactions across platforms", "Automated lead management"]'::jsonb,
            '{"tips": ["Use HubSpot custom properties for RawDrive-specific data", "Set up lifecycle stages based on gallery activity"]}'::jsonb,
            true,
            true
        ),
        -- Analytics & Export Templates
        (
            'google-sheets-analytics',
            'Export analytics to Google Sheets',
            'Automatically log daily analytics to a Google Sheets spreadsheet',
            'Build a historical record of your gallery performance. Daily analytics are automatically logged to Google Sheets for tracking and reporting.',
            'analytics',
            'zapier',
            ARRAY['google-sheets', 'analytics', 'reporting', 'export'],
            'google-sheets',
            'https://cdn.rawdrive.io/integrations/google-sheets-logo.svg',
            ARRAY['analytics.daily_report'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Daily Report", "event": "analytics.daily_report"},
                {"type": "transform", "name": "Format Row", "config": {"columns": ["{{report_date}}", "{{metrics.total_views}}", "{{metrics.unique_visitors}}", "{{metrics.total_downloads}}"]}},
                {"type": "http_request", "name": "Append to Sheet", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"workspace_id": "uuid", "report_date": "2026-01-09", "metrics": {"total_views": 1250, "unique_visitors": 340, "total_downloads": 89}}'::jsonb,
            '1. Create a Google Sheet with headers: Date, Views, Visitors, Downloads\n2. Connect Google Sheets to Zapier\n3. Use this template\n4. Your analytics will be logged daily',
            '["Track gallery performance over time", "Build custom dashboards", "Share reports with stakeholders"]'::jsonb,
            '{"tips": ["Add charts to your Google Sheet for visualization", "Create monthly summary formulas"]}'::jsonb,
            false,
            true
        ),
        -- Make.com Templates
        (
            'make-multi-step-workflow',
            'Multi-step workflow with Make.com',
            'Create complex automation workflows with conditional logic and multiple actions',
            'Build sophisticated automation workflows with Make.com (formerly Integromat). Chain multiple actions based on event data.',
            'automation',
            'make',
            ARRAY['make', 'integromat', 'automation', 'workflow', 'multi-step'],
            'make',
            'https://cdn.rawdrive.io/integrations/make-logo.svg',
            ARRAY['gallery.published', 'gallery.viewed', 'client.created'],
            '{"http_method": "POST", "timeout_seconds": 60, "max_retries": 5}'::jsonb,
            '[
                {"type": "trigger", "name": "Multiple Events", "event": "gallery.published,gallery.viewed,client.created"},
                {"type": "condition", "name": "Route by Event", "config": {"branches": [{"event": "gallery.published", "action": "notify"}, {"event": "gallery.viewed", "action": "log"}, {"event": "client.created", "action": "crm"}]}},
                {"type": "http_request", "name": "Send to Make", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"event_type": "gallery.published", "workspace_id": "uuid", "gallery_id": "uuid"}'::jsonb,
            '1. Create a Make.com scenario\n2. Add a Webhook trigger\n3. Use this template to send events\n4. Build your automation logic in Make.com',
            '["Complex multi-step automations", "Conditional workflows", "Cross-platform integrations"]'::jsonb,
            '{"tips": ["Use Make.com routers for conditional logic", "Add error handlers for reliability"]}'::jsonb,
            true,
            true
        ),
        -- Native Templates (direct HTTP webhooks)
        (
            'custom-webhook-endpoint',
            'Custom webhook endpoint',
            'Send webhook events to any custom HTTP endpoint',
            'Create a fully customizable webhook integration. Send events to any HTTP endpoint with custom headers and payload transformations.',
            'developer',
            'native',
            ARRAY['custom', 'webhook', 'http', 'api', 'developer'],
            NULL,
            NULL,
            ARRAY['*'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 5}'::jsonb,
            '[
                {"type": "trigger", "name": "Any Event", "event": "*"},
                {"type": "transform", "name": "Custom Transform", "config": {"customizable": true}},
                {"type": "http_request", "name": "Send to Endpoint", "config": {"method": "POST", "headers": {"Content-Type": "application/json"}}}
            ]'::jsonb,
            '{"event_type": "example.event", "workspace_id": "uuid", "data": {}}'::jsonb,
            '1. Enter your endpoint URL\n2. Configure custom headers if needed\n3. Select which events to send\n4. Test your integration',
            '["Custom backend integrations", "Internal systems", "Developer workflows"]'::jsonb,
            '{"tips": ["Always validate webhook signatures", "Handle retries gracefully", "Log all incoming webhooks"]}'::jsonb,
            false,
            true
        ),
        -- Notification Campaign Templates
        (
            'client-engagement-alerts',
            'Client engagement alerts',
            'Get notified when clients engage with their galleries',
            'Stay informed about client activity. Get instant notifications when clients view, favorite, or download photos.',
            'notification',
            'zapier',
            ARRAY['notification', 'client', 'engagement', 'alert'],
            'slack',
            'https://cdn.rawdrive.io/integrations/slack-logo.svg',
            ARRAY['gallery.viewed', 'client.photo_favorited', 'gallery.downloaded'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Client Activity", "event": "gallery.viewed,client.photo_favorited,gallery.downloaded"},
                {"type": "condition", "name": "Filter Significant Activity", "config": {"min_views": 5, "min_favorites": 10}},
                {"type": "transform", "name": "Format Alert", "config": {"template": "📊 {{client_name}} is active on {{gallery_title}}"}},
                {"type": "http_request", "name": "Send Alert", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"gallery_id": "uuid", "gallery_title": "Smith Wedding", "client_id": "uuid", "view_count": 25}'::jsonb,
            '1. Choose your notification channel (Slack, email, etc.)\n2. Configure activity thresholds\n3. Enable the workflow\n4. Get notified about client engagement',
            '["Monitor client interest", "Follow up at the right time", "Improve client relationships"]'::jsonb,
            '{"tips": ["Set appropriate thresholds to avoid notification fatigue", "Use different channels for different activity types"]}'::jsonb,
            true,
            true
        ),
        (
            'selection-submitted-workflow',
            'Photo selection workflow',
            'Automate your workflow when clients submit their photo selections',
            'Streamline your delivery process. When clients submit their selections, automatically create tasks, notify your team, and update your project management tools.',
            'project_management',
            'zapier',
            ARRAY['selection', 'workflow', 'delivery', 'task'],
            'asana',
            'https://cdn.rawdrive.io/integrations/asana-logo.svg',
            ARRAY['gallery.selection_submitted'],
            '{"http_method": "POST", "timeout_seconds": 30, "max_retries": 3}'::jsonb,
            '[
                {"type": "trigger", "name": "Selection Submitted", "event": "gallery.selection_submitted"},
                {"type": "transform", "name": "Create Task Data", "config": {"title": "Process selections: {{gallery_title}}", "description": "{{selection_count}} photos selected", "due_date": "+3 days"}},
                {"type": "http_request", "name": "Create Task", "config": {"method": "POST"}},
                {"type": "http_request", "name": "Send Notification", "config": {"method": "POST"}}
            ]'::jsonb,
            '{"gallery_id": "uuid", "gallery_title": "Smith Wedding", "client_id": "uuid", "selection_count": 50}'::jsonb,
            '1. Connect your project management tool\n2. Define task templates\n3. Configure notification channels\n4. Enable automatic workflow',
            '["Automate post-selection workflow", "Track delivery progress", "Never miss a deadline"]'::jsonb,
            '{"tips": ["Include selection count in task description", "Set realistic due dates", "Add checklist items for standard delivery steps"]}'::jsonb,
            true,
            true
        );
    """)


def downgrade() -> None:
    """Drop webhook integration templates tables."""
    op.drop_table("webhook_template_usage")
    op.drop_table("webhook_workflow_executions")
    op.drop_table("webhook_workflow_steps")
    op.drop_table("webhook_workflows")
    op.drop_table("webhook_integration_templates")
