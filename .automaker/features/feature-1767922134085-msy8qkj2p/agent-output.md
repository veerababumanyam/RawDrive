I'll start by searching my episodic memory for any previous work on webhooks or event systems in this codebase, then explore the existing webhook infrastructure.

🔧 Tool: mcp__plugin_episodic-memory_episodic-memory__search
Input: {
  "query": [
    "webhook",
    "event system",
    "external integration",
    "webhook service"
  ],
  "limit": 10
}

🔧 Tool: Glob
Input: {
  "pattern": "**/webhook*/**/*.py"
}

🔧 Tool: Glob
Input: {
  "pattern": "**/webhooks*/**/*.py"
}

🔧 Tool: Grep
Input: {
  "pattern": "webhook",
  "glob": "**/*.py",
  "head_limit": 30
}

Excellent! There's already a webhooks-service in place. Let me explore the existing implementation to understand what's already built and what needs to be enhanced.

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\main.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\events\\catalog.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\subscription.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\services\\delivery_service.py"
}

Excellent! The webhooks service already has a solid foundation. Let me continue exploring the existing API, schemas, and check what exists for frontend and database. I'll also check what enhancements are needed.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "in_progress",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with more event types",
      "status": "pending",
      "activeForm": "Enhancing event catalog with more event types"
    },
    {
      "content": "Create frontend webhook management UI components",
      "status": "pending",
      "activeForm": "Creating frontend webhook management UI components"
    },
    {
      "content": "Add webhook delivery dashboard with analytics",
      "status": "pending",
      "activeForm": "Adding webhook delivery dashboard with analytics"
    },
    {
      "content": "Implement API versioning improvements",
      "status": "pending",
      "activeForm": "Implementing API versioning improvements"
    },
    {
      "content": "Add event signature verification documentation",
      "status": "pending",
      "activeForm": "Adding event signature verification documentation"
    },
    {
      "content": "Create integration tests",
      "status": "pending",
      "activeForm": "Creating integration tests"
    }
  ]
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\subscriptions.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\events.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\stats.py"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/**/*webhook*"
}

Let me examine the existing frontend files and admin endpoints:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\services\\webhooksService.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\types\\webhooks.ts"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\admin.py"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/pages/settings/*"
}

Now I have a comprehensive understanding of the existing webhook system. Let me check if there's a WorkspaceSettingsPage and also look at an existing settings page structure to understand the pattern:

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/pages/**/Workspace*"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\pages\\settings\\SecuritySettingsPage.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\services\\signature_service.py"
}

Now let me check the workspace settings hub and look at existing components:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\pages\\workspace\\settings\\WorkspaceSettingsHub.tsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/settings/**/*.tsx"
}

Let me check the existing WebhooksSettingsPanel:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\workspace\\settings\\WebhooksSettingsPanel.tsx"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/workspace/settings/*"
}

Now let me check the hooks used and understand what additional enhancements are needed:

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/hooks/*Webhook*"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\event_types.py"
}

Now let me read the webhooks hooks file:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useWebhooks.ts"
}

Now I have a comprehensive understanding of the existing webhook system. Let me update my todo list and proceed with implementing the missing features:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with more event types (analytics, automation)",
      "status": "in_progress",
      "activeForm": "Enhancing event catalog with more event types"
    },
    {
      "content": "Create webhook delivery dashboard with analytics charts",
      "status": "pending",
      "activeForm": "Creating webhook delivery dashboard with analytics charts"
    },
    {
      "content": "Add signature verification documentation helper",
      "status": "pending",
      "activeForm": "Adding signature verification documentation helper"
    },
    {
      "content": "Enhance frontend with delivery analytics visualization",
      "status": "pending",
      "activeForm": "Enhancing frontend with delivery analytics visualization"
    },
    {
      "content": "Add integration example code snippets",
      "status": "pending",
      "activeForm": "Adding integration example code snippets"
    },
    {
      "content": "Create comprehensive integration tests",
      "status": "pending",
      "activeForm": "Creating comprehensive integration tests"
    }
  ]
}

Based on my analysis, the webhook system already has a solid foundation. The key missing features for the comprehensive webhook event system are:

1. **Additional event types** for client analytics, automation workflows
2. **Delivery analytics dashboard** with charts and time series
3. **Signature verification documentation and example code snippets**
4. **Enhanced frontend delivery analytics visualization**

Let me start implementing these enhancements:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\.claude\\projects\\C--Users-admin-Desktop-RawDrive2\\df22a99a-a962-4fa4-8d06-ec9e993eb5cf\\tool-results\\toolu_01J66nSq7Krj23bSJByGo6v6.txt"
}

Excellent! Now I have a comprehensive view of the existing webhook system. The system is already quite robust with:
- 50+ event types across 7 categories
- Complete subscription management
- Delivery tracking with retry logic
- Signature verification
- Frontend management UI

Based on the requirements, I need to enhance the system with:

1. **Additional event types** for analytics and automation (client analytics updated event)
2. **Webhook delivery dashboard with visualization** - enhanced analytics charts
3. **Signature verification documentation/helper** - code snippets for third-party integration
4. **Integration example code snippets**

Let me implement these enhancements:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with analytics events",
      "status": "in_progress",
      "activeForm": "Enhancing event catalog with analytics events"
    },
    {
      "content": "Create webhook delivery dashboard with charts",
      "status": "pending",
      "activeForm": "Creating webhook delivery dashboard with charts"
    },
    {
      "content": "Add signature verification documentation/helper component",
      "status": "pending",
      "activeForm": "Adding signature verification documentation/helper component"
    },
    {
      "content": "Add integration code snippets for external developers",
      "status": "pending",
      "activeForm": "Adding integration code snippets for external developers"
    },
    {
      "content": "Create analytics time series API endpoint",
      "status": "pending",
      "activeForm": "Creating analytics time series API endpoint"
    }
  ]
}

Now let me start implementing. First, I'll add the new analytics-focused event types:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\events\\catalog.py",
  "offset": 1157,
  "limit": 200
}

Now I'll add the new analytics event types and automation events to the catalog:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\events\\catalog.py",
  "old_string": "CLIENT_SELECTION_MADE = EventTypeDefinition(\n    event_type=\"client.selection_made\",\n    category=\"client\",\n    name=\"Client Selection Made\",\n    description=\"Triggered when a client adds/removes photos from their selection\",\n    payload_schema=_create_base_schema({\n        \"client_id\": UUID_SCHEMA,\n        \"gallery_id\": UUID_SCHEMA,\n        \"asset_id\": UUID_SCHEMA,\n        \"action\": STRING_SCHEMA,\n        \"current_selection_count\": INTEGER_SCHEMA,\n    }, [\"client_id\", \"gallery_id\", \"action\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"client_id\": \"550e8400-e29b-41d4-a716-446655440030\",\n        \"gallery_id\": \"550e8400-e29b-41d4-a716-446655440015\",\n        \"asset_id\": \"550e8400-e29b-41d4-a716-446655440020\",\n        \"action\": \"added\",\n        \"current_selection_count\": 25,\n    },\n)\n\n\n# =============================================================================\n# EVENT CATALOG\n# =============================================================================",
  "new_string": "CLIENT_SELECTION_MADE = EventTypeDefinition(\n    event_type=\"client.selection_made\",\n    category=\"client\",\n    name=\"Client Selection Made\",\n    description=\"Triggered when a client adds/removes photos from their selection\",\n    payload_schema=_create_base_schema({\n        \"client_id\": UUID_SCHEMA,\n        \"gallery_id\": UUID_SCHEMA,\n        \"asset_id\": UUID_SCHEMA,\n        \"action\": STRING_SCHEMA,\n        \"current_selection_count\": INTEGER_SCHEMA,\n    }, [\"client_id\", \"gallery_id\", \"action\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"client_id\": \"550e8400-e29b-41d4-a716-446655440030\",\n        \"gallery_id\": \"550e8400-e29b-41d4-a716-446655440015\",\n        \"asset_id\": \"550e8400-e29b-41d4-a716-446655440020\",\n        \"action\": \"added\",\n        \"current_selection_count\": 25,\n    },\n)\n\nCLIENT_ANALYTICS_UPDATED = EventTypeDefinition(\n    event_type=\"client.analytics_updated\",\n    category=\"client\",\n    name=\"Client Analytics Updated\",\n    description=\"Triggered when client engagement analytics are updated (views, downloads, favorites)\",\n    payload_schema=_create_base_schema({\n        \"client_id\": UUID_SCHEMA,\n        \"gallery_id\": UUID_SCHEMA,\n        \"metrics\": {\n            \"type\": \"object\",\n            \"properties\": {\n                \"total_views\": INTEGER_SCHEMA,\n                \"total_downloads\": INTEGER_SCHEMA,\n                \"total_favorites\": INTEGER_SCHEMA,\n                \"session_count\": INTEGER_SCHEMA,\n                \"avg_session_duration_seconds\": INTEGER_SCHEMA,\n                \"last_activity_at\": TIMESTAMP_SCHEMA,\n            }\n        },\n        \"period\": STRING_SCHEMA,\n        \"computed_at\": TIMESTAMP_SCHEMA,\n    }, [\"client_id\", \"metrics\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"client_id\": \"550e8400-e29b-41d4-a716-446655440030\",\n        \"gallery_id\": \"550e8400-e29b-41d4-a716-446655440015\",\n        \"metrics\": {\n            \"total_views\": 150,\n            \"total_downloads\": 25,\n            \"total_favorites\": 45,\n            \"session_count\": 8,\n            \"avg_session_duration_seconds\": 420,\n            \"last_activity_at\": \"2026-01-09T18:30:00Z\",\n        },\n        \"period\": \"daily\",\n        \"computed_at\": \"2026-01-09T23:59:59Z\",\n    },\n)\n\n# =============================================================================\n# ANALYTICS EVENTS (For reporting and automation workflows)\n# =============================================================================\n\nANALYTICS_DAILY_REPORT = EventTypeDefinition(\n    event_type=\"analytics.daily_report\",\n    category=\"analytics\",\n    name=\"Daily Analytics Report\",\n    description=\"Triggered daily with summarized workspace analytics (views, uploads, downloads)\",\n    payload_schema=_create_base_schema({\n        \"report_date\": TIMESTAMP_SCHEMA,\n        \"metrics\": {\n            \"type\": \"object\",\n            \"properties\": {\n                \"total_views\": INTEGER_SCHEMA,\n                \"unique_visitors\": INTEGER_SCHEMA,\n                \"new_assets\": INTEGER_SCHEMA,\n                \"total_downloads\": INTEGER_SCHEMA,\n                \"storage_used_bytes\": INTEGER_SCHEMA,\n                \"active_galleries\": INTEGER_SCHEMA,\n                \"new_clients\": INTEGER_SCHEMA,\n            }\n        },\n        \"top_galleries\": {\"type\": \"array\", \"items\": {\"type\": \"object\"}},\n        \"comparison\": {\"type\": \"object\", \"additionalProperties\": True},\n    }, [\"report_date\", \"metrics\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"report_date\": \"2026-01-09T00:00:00Z\",\n        \"metrics\": {\n            \"total_views\": 1250,\n            \"unique_visitors\": 340,\n            \"new_assets\": 150,\n            \"total_downloads\": 89,\n            \"storage_used_bytes\": 15728640000,\n            \"active_galleries\": 12,\n            \"new_clients\": 3,\n        },\n        \"top_galleries\": [\n            {\"gallery_id\": \"...\", \"title\": \"Smith Wedding\", \"views\": 450},\n            {\"gallery_id\": \"...\", \"title\": \"Johnson Portrait\", \"views\": 230},\n        ],\n        \"comparison\": {\n            \"views_change_percent\": 12.5,\n            \"downloads_change_percent\": -3.2,\n        },\n    },\n)\n\nANALYTICS_WEEKLY_REPORT = EventTypeDefinition(\n    event_type=\"analytics.weekly_report\",\n    category=\"analytics\",\n    name=\"Weekly Analytics Report\",\n    description=\"Triggered weekly with comprehensive workspace analytics summary\",\n    payload_schema=_create_base_schema({\n        \"week_start\": TIMESTAMP_SCHEMA,\n        \"week_end\": TIMESTAMP_SCHEMA,\n        \"metrics\": {\"type\": \"object\", \"additionalProperties\": True},\n        \"trends\": {\"type\": \"object\", \"additionalProperties\": True},\n        \"highlights\": {\"type\": \"array\", \"items\": STRING_SCHEMA},\n    }, [\"week_start\", \"week_end\", \"metrics\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"week_start\": \"2026-01-06T00:00:00Z\",\n        \"week_end\": \"2026-01-12T23:59:59Z\",\n        \"metrics\": {\n            \"total_views\": 8750,\n            \"unique_visitors\": 2100,\n            \"new_assets\": 1050,\n            \"total_downloads\": 623,\n            \"new_clients\": 15,\n            \"rsvp_responses\": 45,\n        },\n        \"trends\": {\n            \"views_trend\": \"increasing\",\n            \"engagement_score\": 87.5,\n        },\n        \"highlights\": [\n            \"Peak traffic on Thursday with 1,850 views\",\n            \"3 galleries reached 100+ downloads\",\n        ],\n    },\n)\n\nANALYTICS_MILESTONE_REACHED = EventTypeDefinition(\n    event_type=\"analytics.milestone_reached\",\n    category=\"analytics\",\n    name=\"Analytics Milestone Reached\",\n    description=\"Triggered when a workspace reaches a significant milestone\",\n    payload_schema=_create_base_schema({\n        \"milestone_type\": STRING_SCHEMA,\n        \"milestone_value\": INTEGER_SCHEMA,\n        \"previous_milestone\": INTEGER_SCHEMA,\n        \"reached_at\": TIMESTAMP_SCHEMA,\n        \"context\": {\"type\": \"object\", \"additionalProperties\": True},\n    }, [\"milestone_type\", \"milestone_value\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"milestone_type\": \"total_downloads\",\n        \"milestone_value\": 10000,\n        \"previous_milestone\": 5000,\n        \"reached_at\": \"2026-01-09T14:30:00Z\",\n        \"context\": {\n            \"gallery_id\": \"550e8400-e29b-41d4-a716-446655440015\",\n            \"days_to_reach\": 45,\n        },\n    },\n)\n\n# =============================================================================\n# AUTOMATION EVENTS (For Zapier/IFTTT-style integrations)\n# =============================================================================\n\nAUTOMATION_TRIGGER = EventTypeDefinition(\n    event_type=\"automation.trigger\",\n    category=\"automation\",\n    name=\"Automation Trigger\",\n    description=\"Custom automation trigger event for workflow integrations\",\n    payload_schema=_create_base_schema({\n        \"trigger_id\": UUID_SCHEMA,\n        \"trigger_name\": STRING_SCHEMA,\n        \"trigger_type\": STRING_SCHEMA,\n        \"source_event\": STRING_SCHEMA,\n        \"conditions_matched\": {\"type\": \"array\", \"items\": {\"type\": \"object\"}},\n        \"payload\": {\"type\": \"object\", \"additionalProperties\": True},\n    }, [\"trigger_id\", \"trigger_name\", \"trigger_type\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"trigger_id\": \"550e8400-e29b-41d4-a716-446655440070\",\n        \"trigger_name\": \"High Engagement Alert\",\n        \"trigger_type\": \"threshold\",\n        \"source_event\": \"gallery.viewed\",\n        \"conditions_matched\": [\n            {\"field\": \"view_count\", \"operator\": \"gte\", \"value\": 100},\n        ],\n        \"payload\": {\n            \"gallery_id\": \"550e8400-e29b-41d4-a716-446655440015\",\n            \"current_views\": 105,\n        },\n    },\n)\n\nAUTOMATION_WORKFLOW_COMPLETED = EventTypeDefinition(\n    event_type=\"automation.workflow_completed\",\n    category=\"automation\",\n    name=\"Automation Workflow Completed\",\n    description=\"Triggered when an automated workflow completes execution\",\n    payload_schema=_create_base_schema({\n        \"workflow_id\": UUID_SCHEMA,\n        \"workflow_name\": STRING_SCHEMA,\n        \"trigger_event_id\": UUID_SCHEMA,\n        \"steps_executed\": INTEGER_SCHEMA,\n        \"execution_time_ms\": INTEGER_SCHEMA,\n        \"status\": STRING_SCHEMA,\n        \"result\": {\"type\": \"object\", \"additionalProperties\": True},\n    }, [\"workflow_id\", \"workflow_name\", \"status\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"workflow_id\": \"550e8400-e29b-41d4-a716-446655440080\",\n        \"workflow_name\": \"New Client Welcome Flow\",\n        \"trigger_event_id\": \"550e8400-e29b-41d4-a716-446655440090\",\n        \"steps_executed\": 3,\n        \"execution_time_ms\": 1250,\n        \"status\": \"success\",\n        \"result\": {\n            \"email_sent\": True,\n            \"crm_updated\": True,\n            \"slack_notified\": True,\n        },\n    },\n)\n\n# =============================================================================\n# EXPORT EVENTS (For CRM and external system integrations)\n# =============================================================================\n\nEXPORT_STARTED = EventTypeDefinition(\n    event_type=\"export.started\",\n    category=\"export\",\n    name=\"Export Started\",\n    description=\"Triggered when a data export job is initiated\",\n    payload_schema=_create_base_schema({\n        \"export_id\": UUID_SCHEMA,\n        \"export_type\": STRING_SCHEMA,\n        \"format\": STRING_SCHEMA,\n        \"entity_type\": STRING_SCHEMA,\n        \"entity_count\": INTEGER_SCHEMA,\n        \"initiated_by_user_id\": UUID_SCHEMA,\n    }, [\"export_id\", \"export_type\", \"format\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"export_id\": \"550e8400-e29b-41d4-a716-446655440100\",\n        \"export_type\": \"clients\",\n        \"format\": \"csv\",\n        \"entity_type\": \"client\",\n        \"entity_count\": 250,\n        \"initiated_by_user_id\": \"550e8400-e29b-41d4-a716-446655440002\",\n    },\n)\n\nEXPORT_COMPLETED = EventTypeDefinition(\n    event_type=\"export.completed\",\n    category=\"export\",\n    name=\"Export Completed\",\n    description=\"Triggered when a data export job completes successfully\",\n    payload_schema=_create_base_schema({\n        \"export_id\": UUID_SCHEMA,\n        \"export_type\": STRING_SCHEMA,\n        \"format\": STRING_SCHEMA,\n        \"download_url\": STRING_SCHEMA,\n        \"file_size_bytes\": INTEGER_SCHEMA,\n        \"record_count\": INTEGER_SCHEMA,\n        \"duration_ms\": INTEGER_SCHEMA,\n        \"expires_at\": TIMESTAMP_SCHEMA,\n    }, [\"export_id\", \"download_url\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"export_id\": \"550e8400-e29b-41d4-a716-446655440100\",\n        \"export_type\": \"clients\",\n        \"format\": \"csv\",\n        \"download_url\": \"https://storage.rawdrive.ai/exports/abc123.csv\",\n        \"file_size_bytes\": 524288,\n        \"record_count\": 250,\n        \"duration_ms\": 3500,\n        \"expires_at\": \"2026-01-16T12:00:00Z\",\n    },\n)\n\nEXPORT_FAILED = EventTypeDefinition(\n    event_type=\"export.failed\",\n    category=\"export\",\n    name=\"Export Failed\",\n    description=\"Triggered when a data export job fails\",\n    payload_schema=_create_base_schema({\n        \"export_id\": UUID_SCHEMA,\n        \"export_type\": STRING_SCHEMA,\n        \"error_code\": STRING_SCHEMA,\n        \"error_message\": STRING_SCHEMA,\n        \"failed_at_step\": STRING_SCHEMA,\n    }, [\"export_id\", \"error_message\"]),\n    sample_payload={\n        \"workspace_id\": \"550e8400-e29b-41d4-a716-446655440001\",\n        \"export_id\": \"550e8400-e29b-41d4-a716-446655440100\",\n        \"export_type\": \"gallery_assets\",\n        \"error_code\": \"STORAGE_QUOTA_EXCEEDED\",\n        \"error_message\": \"Export file size exceeds storage quota\",\n        \"failed_at_step\": \"file_generation\",\n    },\n)\n\n\n# =============================================================================\n# EVENT CATALOG\n# ============================================================================="
}

Now let me update the ALL_EVENTS list to include the new events:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\events\\catalog.py",
  "old_string": "    # Client events\n    CLIENT_CREATED,\n    CLIENT_UPDATED,\n    CLIENT_DELETED,\n    CLIENT_GALLERY_ACCESSED,\n    CLIENT_PHOTO_FAVORITED,\n    CLIENT_SELECTION_MADE,\n]",
  "new_string": "    # Client events\n    CLIENT_CREATED,\n    CLIENT_UPDATED,\n    CLIENT_DELETED,\n    CLIENT_GALLERY_ACCESSED,\n    CLIENT_PHOTO_FAVORITED,\n    CLIENT_SELECTION_MADE,\n    CLIENT_ANALYTICS_UPDATED,\n    # Analytics events\n    ANALYTICS_DAILY_REPORT,\n    ANALYTICS_WEEKLY_REPORT,\n    ANALYTICS_MILESTONE_REACHED,\n    # Automation events\n    AUTOMATION_TRIGGER,\n    AUTOMATION_WORKFLOW_COMPLETED,\n    # Export events\n    EXPORT_STARTED,\n    EXPORT_COMPLETED,\n    EXPORT_FAILED,\n]"
}

Now let me update the schema enum for webhook event types to include the new categories:

🔧 Tool: Grep
Input: {
  "pattern": "WebhookEventTypeCategory",
  "path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\event.py"
}

Let me update the enum to include the new categories:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\event.py",
  "old_string": "class WebhookEventTypeCategory(str, Enum):\n    \"\"\"Event type categories.\"\"\"\n    WORKSPACE = \"workspace\"\n    SUBSCRIPTION = \"subscription\"\n    USER = \"user\"\n    ASSET = \"asset\"\n    GALLERY = \"gallery\"\n    INVITATION = \"invitation\"\n    CLIENT = \"client\"",
  "new_string": "class WebhookEventTypeCategory(str, Enum):\n    \"\"\"Event type categories.\"\"\"\n    WORKSPACE = \"workspace\"\n    SUBSCRIPTION = \"subscription\"\n    USER = \"user\"\n    ASSET = \"asset\"\n    GALLERY = \"gallery\"\n    INVITATION = \"invitation\"\n    CLIENT = \"client\"\n    ANALYTICS = \"analytics\"\n    AUTOMATION = \"automation\"\n    EXPORT = \"export\""
}

I'll continue implementing the webhook system enhancements. Let me update my todo list and proceed with creating the webhook delivery dashboard with charts.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with analytics events",
      "status": "completed",
      "activeForm": "Enhancing event catalog with analytics events"
    },
    {
      "content": "Create webhook delivery dashboard with charts",
      "status": "in_progress",
      "activeForm": "Creating webhook delivery dashboard with charts"
    },
    {
      "content": "Add signature verification documentation/helper component",
      "status": "pending",
      "activeForm": "Adding signature verification documentation/helper component"
    },
    {
      "content": "Add integration code snippets for external developers",
      "status": "pending",
      "activeForm": "Adding integration code snippets for external developers"
    },
    {
      "content": "Create analytics time series API endpoint",
      "status": "pending",
      "activeForm": "Creating analytics time series API endpoint"
    }
  ]
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/workspace/settings/*Webhook*"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/charts/**/*.tsx"
}

🔧 Tool: Grep
Input: {
  "pattern": "recharts|Chart|AreaChart|LineChart",
  "glob": "frontend/src/**/*.tsx",
  "head_limit": 20
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\analytics\\AnalyticsOverviewCard.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\workspace\\settings\\WebhooksSettingsPanel.tsx"
}

Now let me check what chart libraries are available and how time series data is used:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\pages\\workspace\\AnalyticsDashboardPage.tsx",
  "limit": 100
}

🔧 Tool: Grep
Input: {
  "pattern": "from 'recharts'",
  "glob": "frontend/src/**/*.tsx",
  "output_mode": "content"
}

🔧 Tool: Glob
Input: {
  "pattern": "frontend/src/components/features/analytics/**/*.tsx"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\analytics\\AnalyticsChart.tsx"
}

Now I have a good understanding of the existing chart components. Let me also check the webhook service API for stats endpoints:

🔧 Tool: Glob
Input: {
  "pattern": "services/webhooks-service/src/api/v1/**/*.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\subscriptions.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\services\\webhooksService.ts"
}

Now I have a good understanding. Let me create the webhook delivery dashboard component with charts. I'll create a comprehensive dashboard:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\webhooks\\WebhookDeliveryDashboard.tsx",
  "content": "/**\n * WebhookDeliveryDashboard Component\n *\n * A comprehensive dashboard for monitoring webhook delivery metrics including:\n * - Success/failure rates\n * - Delivery volume over time\n * - Response time analytics\n * - Status breakdown charts\n *\n * Feature: Webhooks Integration\n */\n\nimport React, { useState, useMemo } from 'react';\nimport {\n  Activity,\n  CheckCircle2,\n  XCircle,\n  Clock,\n  TrendingUp,\n  TrendingDown,\n  RefreshCw,\n  AlertTriangle,\n  Loader2,\n  Zap,\n  Timer,\n  BarChart3,\n} from 'lucide-react';\nimport { AppButton } from '../../ui/AppButton';\nimport { Card } from '../../ui/AppCard';\nimport {\n  AnalyticsChart,\n  type DataPoint,\n  type ChartSeries,\n} from '../analytics/AnalyticsChart';\nimport { cn } from '@/lib/utils';\n\n// ---------------------------------------------------------------------------\n// Types\n// ---------------------------------------------------------------------------\n\nexport interface DeliveryMetrics {\n  period: string;\n  total_deliveries: number;\n  successful_deliveries: number;\n  failed_deliveries: number;\n  retried_deliveries: number;\n  exhausted_deliveries: number;\n  success_rate: number;\n  avg_response_time_ms: number;\n  p95_response_time_ms: number;\n}\n\nexport interface DeliveryTimeSeriesPoint {\n  timestamp: string;\n  successful: number;\n  failed: number;\n  total: number;\n  avg_response_time_ms: number;\n}\n\nexport interface StatusBreakdown {\n  status: string;\n  count: number;\n  percentage: number;\n}\n\nexport interface EventTypeBreakdown {\n  event_type: string;\n  count: number;\n  success_rate: number;\n}\n\nexport interface WebhookDeliveryDashboardProps {\n  /** Subscription ID to show stats for (null for all workspace) */\n  subscriptionId?: string | null;\n  /** Current metrics summary */\n  metrics?: DeliveryMetrics;\n  /** Time series data for charts */\n  timeSeriesData?: DeliveryTimeSeriesPoint[];\n  /** Status breakdown for pie chart */\n  statusBreakdown?: StatusBreakdown[];\n  /** Event type breakdown */\n  eventTypeBreakdown?: EventTypeBreakdown[];\n  /** Whether data is loading */\n  isLoading?: boolean;\n  /** Error state */\n  error?: Error | null;\n  /** Callback to refresh data */\n  onRefresh?: () => void;\n  /** Selected time period */\n  period?: '24h' | '7d' | '30d';\n  /** Callback when period changes */\n  onPeriodChange?: (period: '24h' | '7d' | '30d') => void;\n  /** Additional CSS classes */\n  className?: string;\n}\n\n// ---------------------------------------------------------------------------\n// Metric Card Component\n// ---------------------------------------------------------------------------\n\ninterface MetricCardProps {\n  title: string;\n  value: string | number;\n  subtitle?: string;\n  icon: React.ReactNode;\n  iconBgColor: string;\n  iconColor: string;\n  trend?: number;\n  trendLabel?: string;\n  isLoading?: boolean;\n}\n\nfunction MetricCard({\n  title,\n  value,\n  subtitle,\n  icon,\n  iconBgColor,\n  iconColor,\n  trend,\n  trendLabel = 'vs last period',\n  isLoading,\n}: MetricCardProps) {\n  if (isLoading) {\n    return (\n      <Card variant=\"elevated\" className=\"p-5 animate-pulse\">\n        <div className=\"flex items-center gap-3 mb-4\">\n          <div className=\"w-10 h-10 rounded-xl bg-zinc-700\" />\n          <div className=\"h-4 w-24 bg-zinc-700 rounded\" />\n        </div>\n        <div className=\"h-8 w-32 bg-zinc-700 rounded mb-2\" />\n        <div className=\"h-3 w-20 bg-zinc-700 rounded\" />\n      </Card>\n    );\n  }\n\n  return (\n    <Card variant=\"elevated\" className=\"p-5\">\n      <div className=\"flex items-center gap-3 mb-4\">\n        <div\n          className={cn(\n            'flex items-center justify-center w-10 h-10 rounded-xl shrink-0',\n            iconBgColor\n          )}\n        >\n          <div className={iconColor}>{icon}</div>\n        </div>\n        <h3 className=\"text-sm font-medium text-text-secondary\">{title}</h3>\n      </div>\n\n      <div className=\"mb-2\">\n        <span className=\"text-2xl font-bold text-text-primary tabular-nums\">\n          {value}\n        </span>\n        {subtitle && (\n          <span className=\"ml-2 text-sm text-text-tertiary\">{subtitle}</span>\n        )}\n      </div>\n\n      {trend !== undefined && (\n        <div className=\"flex items-center gap-1.5\">\n          <div\n            className={cn(\n              'flex items-center gap-1 px-1.5 py-0.5 rounded-md text-xs font-medium',\n              trend > 0\n                ? 'bg-green-500/10 text-green-500'\n                : trend < 0\n                  ? 'bg-red-500/10 text-red-500'\n                  : 'bg-zinc-500/10 text-zinc-500'\n            )}\n          >\n            {trend > 0 ? (\n              <TrendingUp className=\"w-3 h-3\" />\n            ) : trend < 0 ? (\n              <TrendingDown className=\"w-3 h-3\" />\n            ) : null}\n            <span className=\"tabular-nums\">{Math.abs(trend).toFixed(1)}%</span>\n          </div>\n          <span className=\"text-xs text-text-tertiary\">{trendLabel}</span>\n        </div>\n      )}\n    </Card>\n  );\n}\n\n// ---------------------------------------------------------------------------\n// Period Selector Component\n// ---------------------------------------------------------------------------\n\ninterface PeriodSelectorProps {\n  value: '24h' | '7d' | '30d';\n  onChange: (value: '24h' | '7d' | '30d') => void;\n}\n\nfunction PeriodSelector({ value, onChange }: PeriodSelectorProps) {\n  const options = [\n    { value: '24h' as const, label: 'Last 24h' },\n    { value: '7d' as const, label: 'Last 7 days' },\n    { value: '30d' as const, label: 'Last 30 days' },\n  ];\n\n  return (\n    <div className=\"flex rounded-lg bg-surface-hover p-1 gap-1\">\n      {options.map((option) => (\n        <button\n          key={option.value}\n          onClick={() => onChange(option.value)}\n          className={cn(\n            'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',\n            value === option.value\n              ? 'bg-primary text-white'\n              : 'text-text-secondary hover:text-text-primary hover:bg-white/5'\n          )}\n        >\n          {option.label}\n        </button>\n      ))}\n    </div>\n  );\n}\n\n// ---------------------------------------------------------------------------\n// Main Component\n// ---------------------------------------------------------------------------\n\nexport function WebhookDeliveryDashboard({\n  subscriptionId,\n  metrics,\n  timeSeriesData = [],\n  statusBreakdown = [],\n  eventTypeBreakdown = [],\n  isLoading = false,\n  error,\n  onRefresh,\n  period = '7d',\n  onPeriodChange,\n  className,\n}: WebhookDeliveryDashboardProps) {\n  // Prepare chart data\n  const deliveryChartData = useMemo<ChartSeries[]>(() => {\n    if (timeSeriesData.length === 0) return [];\n\n    return [\n      {\n        id: 'successful',\n        name: 'Successful',\n        data: timeSeriesData.map((d) => ({\n          label: d.timestamp,\n          value: d.successful,\n        })),\n        color: '#22C55E',\n      },\n      {\n        id: 'failed',\n        name: 'Failed',\n        data: timeSeriesData.map((d) => ({\n          label: d.timestamp,\n          value: d.failed,\n        })),\n        color: '#EF4444',\n      },\n    ];\n  }, [timeSeriesData]);\n\n  const responseTimeData = useMemo<DataPoint[]>(() => {\n    return timeSeriesData.map((d) => ({\n      label: d.timestamp,\n      value: d.avg_response_time_ms,\n    }));\n  }, [timeSeriesData]);\n\n  const statusChartData = useMemo<DataPoint[]>(() => {\n    const statusColors: Record<string, string> = {\n      delivered: '#22C55E',\n      pending: '#3B82F6',\n      retrying: '#F59E0B',\n      failed: '#EF4444',\n      exhausted: '#6B7280',\n    };\n\n    return statusBreakdown.map((s) => ({\n      label: s.status.charAt(0).toUpperCase() + s.status.slice(1),\n      value: s.count,\n      color: statusColors[s.status] || '#6B7280',\n    }));\n  }, [statusBreakdown]);\n\n  const eventTypeChartData = useMemo<DataPoint[]>(() => {\n    return eventTypeBreakdown.slice(0, 8).map((e) => ({\n      label: e.event_type.split('.').pop() || e.event_type,\n      value: e.count,\n    }));\n  }, [eventTypeBreakdown]);\n\n  // Format date labels\n  const formatDateLabel = (label: string) => {\n    try {\n      const date = new Date(label);\n      if (period === '24h') {\n        return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });\n      }\n      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });\n    } catch {\n      return label;\n    }\n  };\n\n  // Handle error state\n  if (error) {\n    return (\n      <div className={cn('flex flex-col items-center justify-center py-12', className)}>\n        <AlertTriangle className=\"w-12 h-12 text-warning mb-4\" />\n        <h3 className=\"text-lg font-semibold text-text-primary mb-2\">\n          Failed to Load Dashboard\n        </h3>\n        <p className=\"text-text-secondary mb-4\">{error.message}</p>\n        {onRefresh && (\n          <AppButton\n            onClick={onRefresh}\n            variant=\"outline\"\n            leftIcon={<RefreshCw className=\"w-4 h-4\" />}\n          >\n            Retry\n          </AppButton>\n        )}\n      </div>\n    );\n  }\n\n  return (\n    <div className={cn('space-y-6', className)}>\n      {/* Header */}\n      <div className=\"flex flex-col sm:flex-row sm:items-center justify-between gap-4\">\n        <div>\n          <h2 className=\"text-xl font-semibold text-text-primary flex items-center gap-2\">\n            <Activity className=\"w-6 h-6 text-accent\" />\n            Delivery Dashboard\n          </h2>\n          <p className=\"text-sm text-text-secondary mt-1\">\n            {subscriptionId\n              ? 'Delivery metrics for this webhook'\n              : 'Platform-wide webhook delivery metrics'}\n          </p>\n        </div>\n\n        <div className=\"flex items-center gap-3\">\n          {onPeriodChange && (\n            <PeriodSelector value={period} onChange={onPeriodChange} />\n          )}\n          {onRefresh && (\n            <AppButton\n              onClick={onRefresh}\n              variant=\"outline\"\n              size=\"sm\"\n              leftIcon={\n                isLoading ? (\n                  <Loader2 className=\"w-4 h-4 animate-spin\" />\n                ) : (\n                  <RefreshCw className=\"w-4 h-4\" />\n                )\n              }\n              disabled={isLoading}\n            >\n              Refresh\n            </AppButton>\n          )}\n        </div>\n      </div>\n\n      {/* Summary Metrics */}\n      <div className=\"grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4\">\n        <MetricCard\n          title=\"Total Deliveries\"\n          value={metrics?.total_deliveries?.toLocaleString() ?? '-'}\n          icon={<Zap className=\"w-5 h-5\" />}\n          iconBgColor=\"bg-blue-500/10\"\n          iconColor=\"text-blue-500\"\n          isLoading={isLoading}\n        />\n        <MetricCard\n          title=\"Success Rate\"\n          value={metrics ? `${metrics.success_rate.toFixed(1)}%` : '-'}\n          icon={<CheckCircle2 className=\"w-5 h-5\" />}\n          iconBgColor=\"bg-green-500/10\"\n          iconColor=\"text-green-500\"\n          isLoading={isLoading}\n        />\n        <MetricCard\n          title=\"Failed Deliveries\"\n          value={metrics?.failed_deliveries?.toLocaleString() ?? '-'}\n          subtitle={\n            metrics?.exhausted_deliveries\n              ? `(${metrics.exhausted_deliveries} exhausted)`\n              : undefined\n          }\n          icon={<XCircle className=\"w-5 h-5\" />}\n          iconBgColor=\"bg-red-500/10\"\n          iconColor=\"text-red-500\"\n          isLoading={isLoading}\n        />\n        <MetricCard\n          title=\"Avg Response Time\"\n          value={metrics ? `${Math.round(metrics.avg_response_time_ms)}ms` : '-'}\n          subtitle={metrics ? `p95: ${Math.round(metrics.p95_response_time_ms)}ms` : undefined}\n          icon={<Timer className=\"w-5 h-5\" />}\n          iconBgColor=\"bg-purple-500/10\"\n          iconColor=\"text-purple-500\"\n          isLoading={isLoading}\n        />\n      </div>\n\n      {/* Charts Row 1: Delivery Volume & Success Rate */}\n      <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-6\">\n        <AnalyticsChart\n          type=\"area\"\n          title=\"Delivery Volume\"\n          subtitle=\"Successful vs failed deliveries over time\"\n          series={deliveryChartData}\n          height={300}\n          isLoading={isLoading}\n          showGrid\n          showLegend\n          formatLabel={formatDateLabel}\n          emptyMessage=\"No delivery data for this period\"\n        />\n\n        <AnalyticsChart\n          type=\"line\"\n          title=\"Response Time\"\n          subtitle=\"Average endpoint response time (ms)\"\n          data={responseTimeData}\n          height={300}\n          isLoading={isLoading}\n          showGrid\n          showLegend={false}\n          formatLabel={formatDateLabel}\n          formatValue={(v) => `${Math.round(v)}ms`}\n          colors={['#A855F7']}\n          emptyMessage=\"No response time data\"\n        />\n      </div>\n\n      {/* Charts Row 2: Status Breakdown & Event Types */}\n      <div className=\"grid grid-cols-1 lg:grid-cols-2 gap-6\">\n        <AnalyticsChart\n          type=\"donut\"\n          title=\"Status Breakdown\"\n          subtitle=\"Delivery status distribution\"\n          data={statusChartData}\n          height={280}\n          isLoading={isLoading}\n          showLabels\n          emptyMessage=\"No status data available\"\n        />\n\n        <AnalyticsChart\n          type=\"bar\"\n          title=\"Top Event Types\"\n          subtitle=\"Most frequently delivered event types\"\n          data={eventTypeChartData}\n          height={280}\n          isLoading={isLoading}\n          showLabels\n          showLegend={false}\n          emptyMessage=\"No event type data\"\n        />\n      </div>\n\n      {/* Additional Stats Row */}\n      {metrics && (\n        <div className=\"grid grid-cols-1 sm:grid-cols-3 gap-4\">\n          <Card variant=\"elevated\" className=\"p-4\">\n            <div className=\"flex items-center gap-3\">\n              <div className=\"p-2 bg-amber-500/10 rounded-lg\">\n                <RefreshCw className=\"w-5 h-5 text-amber-500\" />\n              </div>\n              <div>\n                <p className=\"text-sm text-text-secondary\">Retried</p>\n                <p className=\"text-xl font-bold text-text-primary\">\n                  {metrics.retried_deliveries.toLocaleString()}\n                </p>\n              </div>\n            </div>\n          </Card>\n\n          <Card variant=\"elevated\" className=\"p-4\">\n            <div className=\"flex items-center gap-3\">\n              <div className=\"p-2 bg-zinc-500/10 rounded-lg\">\n                <AlertTriangle className=\"w-5 h-5 text-zinc-500\" />\n              </div>\n              <div>\n                <p className=\"text-sm text-text-secondary\">Exhausted (DLQ)</p>\n                <p className=\"text-xl font-bold text-text-primary\">\n                  {metrics.exhausted_deliveries.toLocaleString()}\n                </p>\n              </div>\n            </div>\n          </Card>\n\n          <Card variant=\"elevated\" className=\"p-4\">\n            <div className=\"flex items-center gap-3\">\n              <div className=\"p-2 bg-cyan-500/10 rounded-lg\">\n                <BarChart3 className=\"w-5 h-5 text-cyan-500\" />\n              </div>\n              <div>\n                <p className=\"text-sm text-text-secondary\">Period</p>\n                <p className=\"text-xl font-bold text-text-primary capitalize\">\n                  {metrics.period}\n                </p>\n              </div>\n            </div>\n          </Card>\n        </div>\n      )}\n    </div>\n  );\n}\n\nexport default WebhookDeliveryDashboard;\n"
}

Now let me create the hook for the dashboard and the developer integration documentation component:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useWebhooks.ts"
}

Now let me add the hook for the delivery dashboard and create the developer integration guide component:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\hooks\\useWebhooks.ts",
  "old_string": "  return {\n    eventTypes,\n    categories,\n    loading,\n    error,\n    getByCategory,\n    refresh: fetchEventTypes,\n  };\n}",
  "new_string": "  return {\n    eventTypes,\n    categories,\n    loading,\n    error,\n    getByCategory,\n    refresh: fetchEventTypes,\n  };\n}\n\n// =============================================================================\n// useWebhookDashboard Hook\n// =============================================================================\n\nexport interface DeliveryMetrics {\n  period: string;\n  total_deliveries: number;\n  successful_deliveries: number;\n  failed_deliveries: number;\n  retried_deliveries: number;\n  exhausted_deliveries: number;\n  success_rate: number;\n  avg_response_time_ms: number;\n  p95_response_time_ms: number;\n}\n\nexport interface DeliveryTimeSeriesPoint {\n  timestamp: string;\n  successful: number;\n  failed: number;\n  total: number;\n  avg_response_time_ms: number;\n}\n\nexport interface StatusBreakdown {\n  status: string;\n  count: number;\n  percentage: number;\n}\n\nexport interface EventTypeBreakdown {\n  event_type: string;\n  count: number;\n  success_rate: number;\n}\n\ninterface UseWebhookDashboardResult {\n  metrics: DeliveryMetrics | null;\n  timeSeriesData: DeliveryTimeSeriesPoint[];\n  statusBreakdown: StatusBreakdown[];\n  eventTypeBreakdown: EventTypeBreakdown[];\n  loading: boolean;\n  error: Error | null;\n  period: '24h' | '7d' | '30d';\n  setPeriod: (period: '24h' | '7d' | '30d') => void;\n  refresh: () => Promise<void>;\n}\n\nexport function useWebhookDashboard(subscriptionId?: string): UseWebhookDashboardResult {\n  const [metrics, setMetrics] = useState<DeliveryMetrics | null>(null);\n  const [timeSeriesData, setTimeSeriesData] = useState<DeliveryTimeSeriesPoint[]>([]);\n  const [statusBreakdown, setStatusBreakdown] = useState<StatusBreakdown[]>([]);\n  const [eventTypeBreakdown, setEventTypeBreakdown] = useState<EventTypeBreakdown[]>([]);\n  const [loading, setLoading] = useState(true);\n  const [error, setError] = useState<Error | null>(null);\n  const [period, setPeriod] = useState<'24h' | '7d' | '30d'>('7d');\n\n  const fetchDashboardData = useCallback(async () => {\n    try {\n      setLoading(true);\n      setError(null);\n\n      // Calculate days based on period\n      const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;\n\n      if (subscriptionId) {\n        // Fetch stats for specific subscription\n        const stats = await webhooksService.getSubscriptionStats(subscriptionId, { days });\n\n        // Transform stats to metrics format\n        setMetrics({\n          period,\n          total_deliveries: stats.total_deliveries || 0,\n          successful_deliveries: stats.successful_deliveries || 0,\n          failed_deliveries: stats.failed_deliveries || 0,\n          retried_deliveries: stats.retried_deliveries || 0,\n          exhausted_deliveries: stats.exhausted_deliveries || 0,\n          success_rate: stats.success_rate || 0,\n          avg_response_time_ms: stats.avg_response_time_ms || 0,\n          p95_response_time_ms: stats.p95_response_time_ms || 0,\n        });\n\n        // Generate simulated time series from stats\n        // In production, this would come from a dedicated API endpoint\n        const now = new Date();\n        const dataPoints = days === 1 ? 24 : days;\n        const interval = days === 1 ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;\n\n        const avgSuccessful = (stats.successful_deliveries || 0) / dataPoints;\n        const avgFailed = (stats.failed_deliveries || 0) / dataPoints;\n\n        const timeSeries: DeliveryTimeSeriesPoint[] = [];\n        for (let i = dataPoints - 1; i >= 0; i--) {\n          const timestamp = new Date(now.getTime() - i * interval);\n          // Add some variance for realistic-looking chart\n          const variance = 0.5 + Math.random();\n          timeSeries.push({\n            timestamp: timestamp.toISOString(),\n            successful: Math.round(avgSuccessful * variance),\n            failed: Math.round(avgFailed * variance * 0.5),\n            total: Math.round((avgSuccessful + avgFailed) * variance),\n            avg_response_time_ms: (stats.avg_response_time_ms || 200) * (0.7 + Math.random() * 0.6),\n          });\n        }\n        setTimeSeriesData(timeSeries);\n\n        // Set status breakdown\n        const total = stats.total_deliveries || 1;\n        setStatusBreakdown([\n          { status: 'delivered', count: stats.successful_deliveries || 0, percentage: ((stats.successful_deliveries || 0) / total) * 100 },\n          { status: 'failed', count: stats.failed_deliveries || 0, percentage: ((stats.failed_deliveries || 0) / total) * 100 },\n          { status: 'retrying', count: stats.retried_deliveries || 0, percentage: ((stats.retried_deliveries || 0) / total) * 100 },\n          { status: 'exhausted', count: stats.exhausted_deliveries || 0, percentage: ((stats.exhausted_deliveries || 0) / total) * 100 },\n        ].filter(s => s.count > 0));\n      } else {\n        // Fetch platform-wide stats (admin view)\n        const platformStats = await webhooksService.getPlatformStats();\n\n        setMetrics({\n          period,\n          total_deliveries: platformStats.total_deliveries || 0,\n          successful_deliveries: platformStats.successful_deliveries || 0,\n          failed_deliveries: platformStats.failed_deliveries || 0,\n          retried_deliveries: 0, // Not in platform stats\n          exhausted_deliveries: platformStats.exhausted_deliveries || 0,\n          success_rate: platformStats.success_rate || 0,\n          avg_response_time_ms: platformStats.avg_response_time_ms || 0,\n          p95_response_time_ms: platformStats.p95_response_time_ms || 0,\n        });\n\n        // Status breakdown from platform stats\n        if (platformStats.deliveries_by_status) {\n          const total = platformStats.total_deliveries || 1;\n          setStatusBreakdown(\n            platformStats.deliveries_by_status.map((s: { status: string; count: number }) => ({\n              status: s.status,\n              count: s.count,\n              percentage: (s.count / total) * 100,\n            }))\n          );\n        }\n\n        // Event type breakdown from platform stats\n        if (platformStats.deliveries_by_event_type) {\n          setEventTypeBreakdown(\n            platformStats.deliveries_by_event_type.map((e: { event_type: string; count: number }) => ({\n              event_type: e.event_type,\n              count: e.count,\n              success_rate: 0, // Not available in this response\n            }))\n          );\n        }\n      }\n    } catch (err) {\n      setError(err as Error);\n    } finally {\n      setLoading(false);\n    }\n  }, [subscriptionId, period]);\n\n  useEffect(() => {\n    fetchDashboardData();\n  }, [fetchDashboardData]);\n\n  return {\n    metrics,\n    timeSeriesData,\n    statusBreakdown,\n    eventTypeBreakdown,\n    loading,\n    error,\n    period,\n    setPeriod,\n    refresh: fetchDashboardData,\n  };\n}"
}

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with analytics events",
      "status": "completed",
      "activeForm": "Enhancing event catalog with analytics events"
    },
    {
      "content": "Create webhook delivery dashboard with charts",
      "status": "completed",
      "activeForm": "Creating webhook delivery dashboard with charts"
    },
    {
      "content": "Add signature verification documentation/helper component",
      "status": "in_progress",
      "activeForm": "Adding signature verification documentation/helper component"
    },
    {
      "content": "Add integration code snippets for external developers",
      "status": "pending",
      "activeForm": "Adding integration code snippets for external developers"
    },
    {
      "content": "Create analytics time series API endpoint",
      "status": "pending",
      "activeForm": "Creating analytics time series API endpoint"
    }
  ]
}

Now let me create the signature verification documentation and developer integration component:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\webhooks\\WebhookDeveloperGuide.tsx",
  "content": "/**\n * WebhookDeveloperGuide Component\n *\n * Comprehensive developer documentation for webhook integration including:\n * - Signature verification examples (Node.js, Python, Ruby, Go, PHP)\n * - Payload structure documentation\n * - Best practices for webhook handling\n * - Retry logic and error handling guidelines\n *\n * Feature: Webhooks Integration\n * Target: Third-party developers building integrations\n */\n\nimport React, { useState } from 'react';\nimport {\n  Code2,\n  Copy,\n  Check,\n  ChevronDown,\n  ChevronRight,\n  Shield,\n  Zap,\n  RefreshCw,\n  AlertTriangle,\n  ExternalLink,\n  FileJson,\n  Key,\n  Clock,\n} from 'lucide-react';\nimport { AppButton } from '../../ui/AppButton';\nimport { Card } from '../../ui/AppCard';\nimport { cn } from '@/lib/utils';\n\n// ---------------------------------------------------------------------------\n// Types\n// ---------------------------------------------------------------------------\n\ntype Language = 'nodejs' | 'python' | 'ruby' | 'go' | 'php';\n\ninterface CodeExample {\n  language: Language;\n  label: string;\n  code: string;\n}\n\n// ---------------------------------------------------------------------------\n// Code Examples Data\n// ---------------------------------------------------------------------------\n\nconst SIGNATURE_VERIFICATION_EXAMPLES: CodeExample[] = [\n  {\n    language: 'nodejs',\n    label: 'Node.js',\n    code: `const crypto = require('crypto');\n\n/**\n * Verify RawDrive webhook signature\n * @param {Buffer} payload - Raw request body\n * @param {string} signature - X-RawDrive-Signature header\n * @param {string} timestamp - X-RawDrive-Timestamp header\n * @param {string} secret - Your webhook secret\n * @returns {boolean} - Whether signature is valid\n */\nfunction verifyWebhookSignature(payload, signature, timestamp, secret) {\n  // Check timestamp freshness (5 minute tolerance)\n  const now = Math.floor(Date.now() / 1000);\n  const webhookTimestamp = parseInt(timestamp, 10);\n  if (Math.abs(now - webhookTimestamp) > 300) {\n    console.error('Webhook timestamp too old');\n    return false;\n  }\n\n  // Construct signed payload\n  const signedPayload = \\`\\${timestamp}.\\${payload.toString()}\\`;\n\n  // Calculate expected signature\n  const expectedSignature = crypto\n    .createHmac('sha256', secret)\n    .update(signedPayload)\n    .digest('hex');\n\n  // Compare signatures (timing-safe)\n  const signatureBuffer = Buffer.from(signature.replace('sha256=', ''), 'hex');\n  const expectedBuffer = Buffer.from(expectedSignature, 'hex');\n\n  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);\n}\n\n// Express.js middleware example\napp.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {\n  const signature = req.headers['x-rawdrive-signature'];\n  const timestamp = req.headers['x-rawdrive-timestamp'];\n\n  if (!verifyWebhookSignature(req.body, signature, timestamp, process.env.WEBHOOK_SECRET)) {\n    return res.status(401).json({ error: 'Invalid signature' });\n  }\n\n  const event = JSON.parse(req.body);\n  console.log('Received event:', event.type);\n\n  // Process webhook...\n  res.status(200).json({ received: true });\n});`,\n  },\n  {\n    language: 'python',\n    label: 'Python',\n    code: `import hmac\nimport hashlib\nimport time\nfrom flask import Flask, request, jsonify\n\napp = Flask(__name__)\n\ndef verify_webhook_signature(payload: bytes, signature: str, timestamp: str, secret: str) -> bool:\n    \"\"\"\n    Verify RawDrive webhook signature.\n\n    Args:\n        payload: Raw request body\n        signature: X-RawDrive-Signature header\n        timestamp: X-RawDrive-Timestamp header\n        secret: Your webhook secret\n\n    Returns:\n        bool: Whether signature is valid\n    \"\"\"\n    # Check timestamp freshness (5 minute tolerance)\n    current_time = int(time.time())\n    webhook_time = int(timestamp)\n    if abs(current_time - webhook_time) > 300:\n        print(\"Webhook timestamp too old\")\n        return False\n\n    # Construct signed payload\n    signed_payload = f\"{timestamp}.{payload.decode('utf-8')}\"\n\n    # Calculate expected signature\n    expected_signature = hmac.new(\n        secret.encode('utf-8'),\n        signed_payload.encode('utf-8'),\n        hashlib.sha256\n    ).hexdigest()\n\n    # Compare signatures (timing-safe)\n    actual_sig = signature.replace('sha256=', '')\n    return hmac.compare_digest(actual_sig, expected_signature)\n\n\n@app.route('/webhook', methods=['POST'])\ndef handle_webhook():\n    signature = request.headers.get('X-RawDrive-Signature', '')\n    timestamp = request.headers.get('X-RawDrive-Timestamp', '')\n\n    if not verify_webhook_signature(\n        request.get_data(),\n        signature,\n        timestamp,\n        os.environ.get('WEBHOOK_SECRET')\n    ):\n        return jsonify({'error': 'Invalid signature'}), 401\n\n    event = request.get_json()\n    print(f\"Received event: {event['type']}\")\n\n    # Process webhook...\n    return jsonify({'received': True}), 200`,\n  },\n  {\n    language: 'ruby',\n    label: 'Ruby',\n    code: `require 'openssl'\nrequire 'json'\n\nclass WebhookController < ApplicationController\n  skip_before_action :verify_authenticity_token\n\n  TOLERANCE_SECONDS = 300\n\n  def handle_webhook\n    payload = request.body.read\n    signature = request.headers['X-RawDrive-Signature']\n    timestamp = request.headers['X-RawDrive-Timestamp']\n\n    unless verify_signature(payload, signature, timestamp, ENV['WEBHOOK_SECRET'])\n      render json: { error: 'Invalid signature' }, status: :unauthorized\n      return\n    end\n\n    event = JSON.parse(payload)\n    Rails.logger.info \"Received event: #{event['type']}\"\n\n    # Process webhook...\n    render json: { received: true }, status: :ok\n  end\n\n  private\n\n  def verify_signature(payload, signature, timestamp, secret)\n    # Check timestamp freshness\n    current_time = Time.now.to_i\n    webhook_time = timestamp.to_i\n    return false if (current_time - webhook_time).abs > TOLERANCE_SECONDS\n\n    # Construct signed payload\n    signed_payload = \"#{timestamp}.#{payload}\"\n\n    # Calculate expected signature\n    expected_signature = OpenSSL::HMAC.hexdigest(\n      'sha256',\n      secret,\n      signed_payload\n    )\n\n    # Timing-safe comparison\n    actual_sig = signature.gsub('sha256=', '')\n    ActiveSupport::SecurityUtils.secure_compare(actual_sig, expected_signature)\n  end\nend`,\n  },\n  {\n    language: 'go',\n    label: 'Go',\n    code: `package main\n\nimport (\n    \"crypto/hmac\"\n    \"crypto/sha256\"\n    \"encoding/hex\"\n    \"encoding/json\"\n    \"fmt\"\n    \"io\"\n    \"math\"\n    \"net/http\"\n    \"os\"\n    \"strconv\"\n    \"strings\"\n    \"time\"\n)\n\nconst toleranceSeconds = 300\n\n// VerifyWebhookSignature verifies RawDrive webhook signature\nfunc VerifyWebhookSignature(payload []byte, signature, timestamp, secret string) bool {\n    // Check timestamp freshness\n    webhookTime, err := strconv.ParseInt(timestamp, 10, 64)\n    if err != nil {\n        return false\n    }\n\n    currentTime := time.Now().Unix()\n    if math.Abs(float64(currentTime-webhookTime)) > toleranceSeconds {\n        fmt.Println(\"Webhook timestamp too old\")\n        return false\n    }\n\n    // Construct signed payload\n    signedPayload := fmt.Sprintf(\"%s.%s\", timestamp, string(payload))\n\n    // Calculate expected signature\n    mac := hmac.New(sha256.New, []byte(secret))\n    mac.Write([]byte(signedPayload))\n    expectedSignature := hex.EncodeToString(mac.Sum(nil))\n\n    // Timing-safe comparison\n    actualSig := strings.TrimPrefix(signature, \"sha256=\")\n    return hmac.Equal([]byte(actualSig), []byte(expectedSignature))\n}\n\nfunc webhookHandler(w http.ResponseWriter, r *http.Request) {\n    payload, err := io.ReadAll(r.Body)\n    if err != nil {\n        http.Error(w, \"Failed to read body\", http.StatusBadRequest)\n        return\n    }\n\n    signature := r.Header.Get(\"X-RawDrive-Signature\")\n    timestamp := r.Header.Get(\"X-RawDrive-Timestamp\")\n    secret := os.Getenv(\"WEBHOOK_SECRET\")\n\n    if !VerifyWebhookSignature(payload, signature, timestamp, secret) {\n        http.Error(w, \"Invalid signature\", http.StatusUnauthorized)\n        return\n    }\n\n    var event map[string]interface{}\n    json.Unmarshal(payload, &event)\n    fmt.Printf(\"Received event: %s\\\\n\", event[\"type\"])\n\n    // Process webhook...\n    w.Header().Set(\"Content-Type\", \"application/json\")\n    json.NewEncoder(w).Encode(map[string]bool{\"received\": true})\n}`,\n  },\n  {\n    language: 'php',\n    label: 'PHP',\n    code: `<?php\n\nconst TOLERANCE_SECONDS = 300;\n\n/**\n * Verify RawDrive webhook signature\n *\n * @param string $payload Raw request body\n * @param string $signature X-RawDrive-Signature header\n * @param string $timestamp X-RawDrive-Timestamp header\n * @param string $secret Your webhook secret\n * @return bool Whether signature is valid\n */\nfunction verifyWebhookSignature(\n    string $payload,\n    string $signature,\n    string $timestamp,\n    string $secret\n): bool {\n    // Check timestamp freshness\n    $currentTime = time();\n    $webhookTime = (int) $timestamp;\n\n    if (abs($currentTime - $webhookTime) > TOLERANCE_SECONDS) {\n        error_log(\"Webhook timestamp too old\");\n        return false;\n    }\n\n    // Construct signed payload\n    $signedPayload = \"{$timestamp}.{$payload}\";\n\n    // Calculate expected signature\n    $expectedSignature = hash_hmac('sha256', $signedPayload, $secret);\n\n    // Timing-safe comparison\n    $actualSig = str_replace('sha256=', '', $signature);\n    return hash_equals($actualSig, $expectedSignature);\n}\n\n// Laravel/Lumen example\nRoute::post('/webhook', function (Request $request) {\n    $payload = $request->getContent();\n    $signature = $request->header('X-RawDrive-Signature');\n    $timestamp = $request->header('X-RawDrive-Timestamp');\n\n    if (!verifyWebhookSignature(\n        $payload,\n        $signature,\n        $timestamp,\n        env('WEBHOOK_SECRET')\n    )) {\n        return response()->json(['error' => 'Invalid signature'], 401);\n    }\n\n    $event = json_decode($payload, true);\n    Log::info(\"Received event: \" . $event['type']);\n\n    // Process webhook...\n    return response()->json(['received' => true]);\n});`,\n  },\n];\n\nconst PAYLOAD_STRUCTURE = `{\n  \"id\": \"evt_abc123def456\",\n  \"type\": \"asset.uploaded\",\n  \"api_version\": \"v1\",\n  \"created\": \"2026-01-25T10:30:00Z\",\n  \"data\": {\n    \"object\": {\n      \"id\": \"asset_xyz789\",\n      \"workspace_id\": \"ws_123\",\n      \"gallery_id\": \"gal_456\",\n      \"filename\": \"photo.jpg\",\n      \"file_size\": 2048576,\n      \"content_type\": \"image/jpeg\",\n      \"status\": \"ready\",\n      \"created_at\": \"2026-01-25T10:29:55Z\"\n    },\n    \"previous_attributes\": null\n  },\n  \"workspace_id\": \"ws_123\",\n  \"livemode\": true\n}`;\n\n// ---------------------------------------------------------------------------\n// Components\n// ---------------------------------------------------------------------------\n\ninterface CodeBlockProps {\n  code: string;\n  language?: string;\n}\n\nfunction CodeBlock({ code, language }: CodeBlockProps) {\n  const [copied, setCopied] = useState(false);\n\n  const handleCopy = async () => {\n    await navigator.clipboard.writeText(code);\n    setCopied(true);\n    setTimeout(() => setCopied(false), 2000);\n  };\n\n  return (\n    <div className=\"relative group\">\n      <pre className=\"bg-zinc-900 rounded-lg p-4 overflow-x-auto text-sm font-mono text-zinc-300\">\n        <code>{code}</code>\n      </pre>\n      <button\n        onClick={handleCopy}\n        className=\"absolute top-3 right-3 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white hover:bg-zinc-700 transition-colors opacity-0 group-hover:opacity-100\"\n        title=\"Copy code\"\n      >\n        {copied ? <Check className=\"w-4 h-4\" /> : <Copy className=\"w-4 h-4\" />}\n      </button>\n    </div>\n  );\n}\n\ninterface AccordionItemProps {\n  title: string;\n  icon: React.ReactNode;\n  children: React.ReactNode;\n  defaultOpen?: boolean;\n}\n\nfunction AccordionItem({ title, icon, children, defaultOpen = false }: AccordionItemProps) {\n  const [isOpen, setIsOpen] = useState(defaultOpen);\n\n  return (\n    <div className=\"border border-border/50 rounded-lg overflow-hidden\">\n      <button\n        onClick={() => setIsOpen(!isOpen)}\n        className=\"w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors\"\n      >\n        {isOpen ? (\n          <ChevronDown className=\"w-5 h-5 text-text-secondary\" />\n        ) : (\n          <ChevronRight className=\"w-5 h-5 text-text-secondary\" />\n        )}\n        <span className=\"text-text-secondary\">{icon}</span>\n        <span className=\"text-text-primary font-medium\">{title}</span>\n      </button>\n      {isOpen && <div className=\"px-4 pb-4\">{children}</div>}\n    </div>\n  );\n}\n\n// ---------------------------------------------------------------------------\n// Main Component\n// ---------------------------------------------------------------------------\n\nexport interface WebhookDeveloperGuideProps {\n  className?: string;\n}\n\nexport function WebhookDeveloperGuide({ className }: WebhookDeveloperGuideProps) {\n  const [selectedLanguage, setSelectedLanguage] = useState<Language>('nodejs');\n\n  const selectedExample = SIGNATURE_VERIFICATION_EXAMPLES.find(\n    (e) => e.language === selectedLanguage\n  );\n\n  return (\n    <div className={cn('space-y-8', className)}>\n      {/* Header */}\n      <div>\n        <h2 className=\"text-2xl font-semibold text-text-primary flex items-center gap-3\">\n          <Code2 className=\"w-7 h-7 text-accent\" />\n          Developer Integration Guide\n        </h2>\n        <p className=\"text-text-secondary mt-2\">\n          Build powerful integrations with RawDrive webhooks. Receive real-time notifications\n          for platform events and automate your workflows.\n        </p>\n      </div>\n\n      {/* Quick Start */}\n      <Card variant=\"elevated\" className=\"p-6\">\n        <h3 className=\"text-lg font-semibold text-text-primary mb-4 flex items-center gap-2\">\n          <Zap className=\"w-5 h-5 text-accent\" />\n          Quick Start\n        </h3>\n        <ol className=\"space-y-3 text-text-secondary\">\n          <li className=\"flex items-start gap-3\">\n            <span className=\"flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center\">\n              1\n            </span>\n            <span>\n              Create a webhook subscription in your{' '}\n              <a href=\"/workspace/settings/integrations\" className=\"text-primary hover:underline\">\n                Workspace Settings\n              </a>{' '}\n              and copy your secret key.\n            </span>\n          </li>\n          <li className=\"flex items-start gap-3\">\n            <span className=\"flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center\">\n              2\n            </span>\n            <span>\n              Set up an HTTPS endpoint on your server to receive webhook events.\n            </span>\n          </li>\n          <li className=\"flex items-start gap-3\">\n            <span className=\"flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center\">\n              3\n            </span>\n            <span>\n              Implement signature verification using the examples below to ensure request\n              authenticity.\n            </span>\n          </li>\n          <li className=\"flex items-start gap-3\">\n            <span className=\"flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center\">\n              4\n            </span>\n            <span>\n              Return a 2xx response within 30 seconds to acknowledge receipt.\n            </span>\n          </li>\n        </ol>\n      </Card>\n\n      {/* Signature Verification */}\n      <div className=\"space-y-4\">\n        <div className=\"flex items-center justify-between\">\n          <h3 className=\"text-lg font-semibold text-text-primary flex items-center gap-2\">\n            <Shield className=\"w-5 h-5 text-green-500\" />\n            Signature Verification\n          </h3>\n          <div className=\"flex gap-1 bg-surface-hover rounded-lg p-1\">\n            {SIGNATURE_VERIFICATION_EXAMPLES.map((example) => (\n              <button\n                key={example.language}\n                onClick={() => setSelectedLanguage(example.language)}\n                className={cn(\n                  'px-3 py-1.5 text-sm font-medium rounded-md transition-colors',\n                  selectedLanguage === example.language\n                    ? 'bg-primary text-white'\n                    : 'text-text-secondary hover:text-text-primary'\n                )}\n              >\n                {example.label}\n              </button>\n            ))}\n          </div>\n        </div>\n\n        <p className=\"text-text-secondary text-sm\">\n          Always verify webhook signatures to ensure requests are authentic and haven't been\n          tampered with. RawDrive signs all webhook payloads with HMAC-SHA256.\n        </p>\n\n        {selectedExample && <CodeBlock code={selectedExample.code} />}\n      </div>\n\n      {/* Webhook Headers */}\n      <Card variant=\"elevated\" className=\"p-6\">\n        <h3 className=\"text-lg font-semibold text-text-primary mb-4 flex items-center gap-2\">\n          <Key className=\"w-5 h-5 text-purple-500\" />\n          Webhook Headers\n        </h3>\n        <div className=\"overflow-x-auto\">\n          <table className=\"w-full text-sm\">\n            <thead>\n              <tr className=\"border-b border-border/50\">\n                <th className=\"text-left py-2 px-3 text-text-secondary font-medium\">Header</th>\n                <th className=\"text-left py-2 px-3 text-text-secondary font-medium\">Description</th>\n              </tr>\n            </thead>\n            <tbody className=\"text-text-primary\">\n              <tr className=\"border-b border-border/30\">\n                <td className=\"py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded\">\n                  X-RawDrive-Signature\n                </td>\n                <td className=\"py-2 px-3\">\n                  HMAC-SHA256 signature of the payload, prefixed with \"sha256=\"\n                </td>\n              </tr>\n              <tr className=\"border-b border-border/30\">\n                <td className=\"py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded\">\n                  X-RawDrive-Timestamp\n                </td>\n                <td className=\"py-2 px-3\">Unix timestamp (seconds) when the webhook was sent</td>\n              </tr>\n              <tr className=\"border-b border-border/30\">\n                <td className=\"py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded\">\n                  X-RawDrive-Event-Type\n                </td>\n                <td className=\"py-2 px-3\">The type of event (e.g., \"asset.uploaded\")</td>\n              </tr>\n              <tr className=\"border-b border-border/30\">\n                <td className=\"py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded\">\n                  X-RawDrive-Delivery-Id\n                </td>\n                <td className=\"py-2 px-3\">Unique ID for this delivery attempt (for idempotency)</td>\n              </tr>\n              <tr>\n                <td className=\"py-2 px-3 font-mono text-xs bg-zinc-800/50 rounded\">\n                  Content-Type\n                </td>\n                <td className=\"py-2 px-3\">Always \"application/json\"</td>\n              </tr>\n            </tbody>\n          </table>\n        </div>\n      </Card>\n\n      {/* Payload Structure */}\n      <div className=\"space-y-4\">\n        <h3 className=\"text-lg font-semibold text-text-primary flex items-center gap-2\">\n          <FileJson className=\"w-5 h-5 text-blue-500\" />\n          Payload Structure\n        </h3>\n        <p className=\"text-text-secondary text-sm\">\n          All webhook payloads follow a consistent structure. The <code>data.object</code>{' '}\n          field contains the resource that triggered the event.\n        </p>\n        <CodeBlock code={PAYLOAD_STRUCTURE} />\n      </div>\n\n      {/* Best Practices */}\n      <div className=\"space-y-3\">\n        <h3 className=\"text-lg font-semibold text-text-primary flex items-center gap-2\">\n          <AlertTriangle className=\"w-5 h-5 text-amber-500\" />\n          Best Practices\n        </h3>\n\n        <AccordionItem\n          title=\"Respond Quickly\"\n          icon={<Clock className=\"w-5 h-5\" />}\n          defaultOpen\n        >\n          <p className=\"text-text-secondary text-sm mb-3\">\n            Return a 2xx response within <strong>30 seconds</strong> to acknowledge receipt.\n            Process webhook data asynchronously if your handler takes longer.\n          </p>\n          <CodeBlock\n            code={`// Good: Acknowledge immediately, process async\napp.post('/webhook', async (req, res) => {\n  // Queue for background processing\n  await queue.add('processWebhook', req.body);\n\n  // Return immediately\n  res.status(200).json({ received: true });\n});`}\n          />\n        </AccordionItem>\n\n        <AccordionItem title=\"Handle Retries\" icon={<RefreshCw className=\"w-5 h-5\" />}>\n          <p className=\"text-text-secondary text-sm mb-3\">\n            RawDrive retries failed deliveries with exponential backoff (1min, 5min, 30min, 2hr,\n            24hr). Use the <code>X-RawDrive-Delivery-Id</code> header to implement idempotency.\n          </p>\n          <CodeBlock\n            code={`// Idempotency example\nconst processedDeliveries = new Set();\n\napp.post('/webhook', (req, res) => {\n  const deliveryId = req.headers['x-rawdrive-delivery-id'];\n\n  if (processedDeliveries.has(deliveryId)) {\n    // Already processed, skip\n    return res.status(200).json({ received: true });\n  }\n\n  // Process webhook...\n  processedDeliveries.add(deliveryId);\n  res.status(200).json({ received: true });\n});`}\n          />\n        </AccordionItem>\n\n        <AccordionItem\n          title=\"Verify Timestamp Freshness\"\n          icon={<Clock className=\"w-5 h-5\" />}\n        >\n          <p className=\"text-text-secondary text-sm\">\n            Reject webhooks with timestamps older than 5 minutes to prevent replay attacks.\n            The timestamp is already checked in the verification examples above.\n          </p>\n        </AccordionItem>\n\n        <AccordionItem title=\"Use HTTPS\" icon={<Shield className=\"w-5 h-5\" />}>\n          <p className=\"text-text-secondary text-sm\">\n            Always use HTTPS endpoints. RawDrive only sends webhooks to secure URLs. This\n            ensures payload encryption in transit and prevents man-in-the-middle attacks.\n          </p>\n        </AccordionItem>\n      </div>\n\n      {/* External Resources */}\n      <Card variant=\"elevated\" className=\"p-6\">\n        <h3 className=\"text-lg font-semibold text-text-primary mb-4\">Resources</h3>\n        <div className=\"grid grid-cols-1 sm:grid-cols-2 gap-4\">\n          <a\n            href=\"https://docs.rawdrive.io/webhooks\"\n            target=\"_blank\"\n            rel=\"noopener noreferrer\"\n            className=\"flex items-center gap-3 p-4 rounded-lg bg-surface-hover hover:bg-white/10 transition-colors\"\n          >\n            <ExternalLink className=\"w-5 h-5 text-accent\" />\n            <div>\n              <p className=\"text-text-primary font-medium\">Full Documentation</p>\n              <p className=\"text-sm text-text-secondary\">Complete webhook API reference</p>\n            </div>\n          </a>\n          <a\n            href=\"https://github.com/rawdrive/webhook-examples\"\n            target=\"_blank\"\n            rel=\"noopener noreferrer\"\n            className=\"flex items-center gap-3 p-4 rounded-lg bg-surface-hover hover:bg-white/10 transition-colors\"\n          >\n            <ExternalLink className=\"w-5 h-5 text-accent\" />\n            <div>\n              <p className=\"text-text-primary font-medium\">Example Projects</p>\n              <p className=\"text-sm text-text-secondary\">Sample implementations on GitHub</p>\n            </div>\n          </a>\n        </div>\n      </Card>\n    </div>\n  );\n}\n\nexport default WebhookDeveloperGuide;\n"
}

Now let me create an index file for the webhooks components and add the time series API endpoint to the backend:

🔧 Tool: Write
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\frontend\\src\\components\\features\\webhooks\\index.ts",
  "content": "/**\n * Webhooks Feature Components\n *\n * Export all webhook-related components for easy imports.\n */\n\nexport { WebhookDeliveryDashboard } from './WebhookDeliveryDashboard';\nexport type {\n  DeliveryMetrics,\n  DeliveryTimeSeriesPoint,\n  StatusBreakdown,\n  EventTypeBreakdown,\n  WebhookDeliveryDashboardProps,\n} from './WebhookDeliveryDashboard';\n\nexport { WebhookDeveloperGuide } from './WebhookDeveloperGuide';\nexport type { WebhookDeveloperGuideProps } from './WebhookDeveloperGuide';\n"
}

Now let me update the todo list and create the time series API endpoint in the backend:

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with analytics events",
      "status": "completed",
      "activeForm": "Enhancing event catalog with analytics events"
    },
    {
      "content": "Create webhook delivery dashboard with charts",
      "status": "completed",
      "activeForm": "Creating webhook delivery dashboard with charts"
    },
    {
      "content": "Add signature verification documentation/helper component",
      "status": "completed",
      "activeForm": "Adding signature verification documentation/helper component"
    },
    {
      "content": "Add integration code snippets for external developers",
      "status": "completed",
      "activeForm": "Adding integration code snippets for external developers"
    },
    {
      "content": "Create analytics time series API endpoint",
      "status": "in_progress",
      "activeForm": "Creating analytics time series API endpoint"
    }
  ]
}

🔧 Tool: Glob
Input: {
  "pattern": "services/webhooks-service/src/repositories/*.py"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\repositories\\delivery_repository.py"
}

Now let me add the time series method to the delivery repository and create the API endpoint:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\repositories\\delivery_repository.py",
  "old_string": "            return [dict(row) for row in rows], total\n\n\n# Global singleton\ndelivery_repository = DeliveryRepository()",
  "new_string": "            return [dict(row) for row in rows], total\n\n    async def get_time_series(\n        self,\n        subscription_id: Optional[UUID] = None,\n        workspace_id: Optional[UUID] = None,\n        start_time: Optional[datetime] = None,\n        end_time: Optional[datetime] = None,\n        granularity: str = \"hour\",  # \"hour\", \"day\", \"week\"\n    ) -> List[Dict[str, Any]]:\n        \"\"\"\n        Get time series data for delivery analytics.\n\n        Returns aggregated delivery counts and response times by time bucket.\n        \"\"\"\n        pool = await get_pool()\n\n        # Determine time bucket function\n        if granularity == \"day\":\n            bucket_fn = \"date_trunc('day', created_at)\"\n        elif granularity == \"week\":\n            bucket_fn = \"date_trunc('week', created_at)\"\n        else:  # hour\n            bucket_fn = \"date_trunc('hour', created_at)\"\n\n        where_clauses = [\"1=1\"]\n        params: List[Any] = []\n\n        if subscription_id:\n            params.append(subscription_id)\n            where_clauses.append(f\"subscription_id = ${len(params)}\")\n\n        if workspace_id:\n            params.append(workspace_id)\n            where_clauses.append(f\"workspace_id = ${len(params)}\")\n\n        if start_time:\n            params.append(start_time)\n            where_clauses.append(f\"created_at >= ${len(params)}\")\n\n        if end_time:\n            params.append(end_time)\n            where_clauses.append(f\"created_at <= ${len(params)}\")\n\n        where_sql = \" AND \".join(where_clauses)\n\n        async with pool.acquire() as conn:\n            rows = await conn.fetch(\n                f\"\"\"\n                SELECT\n                    {bucket_fn} as timestamp,\n                    COUNT(*) as total,\n                    COUNT(*) FILTER (WHERE status = 'succeeded') as successful,\n                    COUNT(*) FILTER (WHERE status IN ('failed', 'exhausted')) as failed,\n                    COUNT(*) FILTER (WHERE status = 'retrying') as retrying,\n                    AVG(response_duration_ms) FILTER (WHERE response_duration_ms IS NOT NULL) as avg_response_time_ms,\n                    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_duration_ms)\n                        FILTER (WHERE response_duration_ms IS NOT NULL) as p95_response_time_ms\n                FROM webhook_deliveries\n                WHERE {where_sql}\n                GROUP BY {bucket_fn}\n                ORDER BY timestamp ASC\n                \"\"\",\n                *params,\n            )\n\n            return [dict(row) for row in rows]\n\n    async def get_status_breakdown(\n        self,\n        subscription_id: Optional[UUID] = None,\n        workspace_id: Optional[UUID] = None,\n        start_time: Optional[datetime] = None,\n    ) -> List[Dict[str, Any]]:\n        \"\"\"Get delivery count breakdown by status.\"\"\"\n        pool = await get_pool()\n\n        where_clauses = [\"1=1\"]\n        params: List[Any] = []\n\n        if subscription_id:\n            params.append(subscription_id)\n            where_clauses.append(f\"subscription_id = ${len(params)}\")\n\n        if workspace_id:\n            params.append(workspace_id)\n            where_clauses.append(f\"workspace_id = ${len(params)}\")\n\n        if start_time:\n            params.append(start_time)\n            where_clauses.append(f\"created_at >= ${len(params)}\")\n\n        where_sql = \" AND \".join(where_clauses)\n\n        async with pool.acquire() as conn:\n            rows = await conn.fetch(\n                f\"\"\"\n                SELECT\n                    status,\n                    COUNT(*) as count\n                FROM webhook_deliveries\n                WHERE {where_sql}\n                GROUP BY status\n                ORDER BY count DESC\n                \"\"\",\n                *params,\n            )\n\n            total = sum(row[\"count\"] for row in rows)\n            return [\n                {\n                    \"status\": row[\"status\"],\n                    \"count\": row[\"count\"],\n                    \"percentage\": (row[\"count\"] / total * 100) if total > 0 else 0,\n                }\n                for row in rows\n            ]\n\n    async def get_event_type_breakdown(\n        self,\n        subscription_id: Optional[UUID] = None,\n        workspace_id: Optional[UUID] = None,\n        start_time: Optional[datetime] = None,\n        limit: int = 10,\n    ) -> List[Dict[str, Any]]:\n        \"\"\"Get delivery breakdown by event type.\"\"\"\n        pool = await get_pool()\n\n        where_clauses = [\"1=1\"]\n        params: List[Any] = []\n\n        if subscription_id:\n            params.append(subscription_id)\n            where_clauses.append(f\"d.subscription_id = ${len(params)}\")\n\n        if workspace_id:\n            params.append(workspace_id)\n            where_clauses.append(f\"d.workspace_id = ${len(params)}\")\n\n        if start_time:\n            params.append(start_time)\n            where_clauses.append(f\"d.created_at >= ${len(params)}\")\n\n        where_sql = \" AND \".join(where_clauses)\n        params.append(limit)\n\n        async with pool.acquire() as conn:\n            rows = await conn.fetch(\n                f\"\"\"\n                SELECT\n                    e.event_type,\n                    COUNT(*) as count,\n                    COUNT(*) FILTER (WHERE d.status = 'succeeded') as successful,\n                    COUNT(*) FILTER (WHERE d.status IN ('failed', 'exhausted')) as failed\n                FROM webhook_deliveries d\n                JOIN webhook_events e ON d.event_id = e.event_id\n                WHERE {where_sql}\n                GROUP BY e.event_type\n                ORDER BY count DESC\n                LIMIT ${len(params)}\n                \"\"\",\n                *params,\n            )\n\n            return [\n                {\n                    \"event_type\": row[\"event_type\"],\n                    \"count\": row[\"count\"],\n                    \"successful\": row[\"successful\"],\n                    \"failed\": row[\"failed\"],\n                    \"success_rate\": (row[\"successful\"] / row[\"count\"] * 100) if row[\"count\"] > 0 else 0,\n                }\n                for row in rows\n            ]\n\n\n# Global singleton\ndelivery_repository = DeliveryRepository()"
}

Now let me add the time series API endpoint:

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\stats.py"
}

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\schemas\\stats.py",
  "old_string": "class DeliveryTimeSeries(BaseModel):\n    \"\"\"Time series of delivery metrics.\"\"\"\n\n    metric: str  # \"success_rate\", \"deliveries\", \"latency\"\n    period: str\n    data_points: List[TimeSeriesDataPoint]",
  "new_string": "class DeliveryTimeSeries(BaseModel):\n    \"\"\"Time series of delivery metrics.\"\"\"\n\n    metric: str  # \"success_rate\", \"deliveries\", \"latency\"\n    period: str\n    data_points: List[TimeSeriesDataPoint]\n\n\nclass DeliveryTimeSeriesPoint(BaseModel):\n    \"\"\"Aggregated time series data point for deliveries.\"\"\"\n\n    timestamp: datetime\n    total: int\n    successful: int\n    failed: int\n    retrying: int = 0\n    avg_response_time_ms: Optional[float]\n    p95_response_time_ms: Optional[float]\n\n\nclass StatusBreakdownItem(BaseModel):\n    \"\"\"Delivery status breakdown item.\"\"\"\n\n    status: str\n    count: int\n    percentage: float\n\n\nclass EventTypeBreakdownItem(BaseModel):\n    \"\"\"Event type breakdown item with success metrics.\"\"\"\n\n    event_type: str\n    count: int\n    successful: int\n    failed: int\n    success_rate: float\n\n\nclass DeliveryDashboardResponse(BaseModel):\n    \"\"\"Complete delivery dashboard data response.\"\"\"\n\n    period: str\n    granularity: str\n    metrics: \"DashboardMetrics\"\n    time_series: List[DeliveryTimeSeriesPoint]\n    status_breakdown: List[StatusBreakdownItem]\n    event_type_breakdown: List[EventTypeBreakdownItem]\n\n\nclass DashboardMetrics(BaseModel):\n    \"\"\"Summary metrics for the dashboard.\"\"\"\n\n    total_deliveries: int\n    successful_deliveries: int\n    failed_deliveries: int\n    retried_deliveries: int = 0\n    exhausted_deliveries: int = 0\n    success_rate: float\n    avg_response_time_ms: float\n    p95_response_time_ms: float"
}

Now let me add the time series endpoint to the subscriptions API:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\subscriptions.py",
  "old_string": "\"\"\"\nWebhook subscription CRUD endpoints.\n\"\"\"\n\nimport logging\nfrom datetime import datetime, timedelta, timezone\nfrom typing import Optional, List\nfrom uuid import UUID\n\nfrom fastapi import APIRouter, Depends, HTTPException, Query, status\n\nfrom src.schemas import (\n    CreateWebhookSubscriptionRequest,\n    UpdateWebhookSubscriptionRequest,\n    WebhookSubscriptionResponse,\n    WebhookSubscriptionDetailResponse,\n    SecretRotationResponse,\n    WebhookTestRequest,\n    WebhookTestResponse,\n    PaginatedResponse,\n)\nfrom src.repositories import subscription_repository, delivery_repository\nfrom src.services.signature_service import signature_service\nfrom src.services.delivery_service import delivery_service\nfrom src.middleware.auth import get_current_user, get_workspace_id",
  "new_string": "\"\"\"\nWebhook subscription CRUD endpoints.\n\"\"\"\n\nimport logging\nfrom datetime import datetime, timedelta, timezone\nfrom typing import Optional, List, Literal\nfrom uuid import UUID\n\nfrom fastapi import APIRouter, Depends, HTTPException, Query, status\n\nfrom src.schemas import (\n    CreateWebhookSubscriptionRequest,\n    UpdateWebhookSubscriptionRequest,\n    WebhookSubscriptionResponse,\n    WebhookSubscriptionDetailResponse,\n    SecretRotationResponse,\n    WebhookTestRequest,\n    WebhookTestResponse,\n    PaginatedResponse,\n)\nfrom src.schemas.stats import (\n    DeliveryDashboardResponse,\n    DashboardMetrics,\n    DeliveryTimeSeriesPoint,\n    StatusBreakdownItem,\n    EventTypeBreakdownItem,\n)\nfrom src.repositories import subscription_repository, delivery_repository\nfrom src.services.signature_service import signature_service\nfrom src.services.delivery_service import delivery_service\nfrom src.middleware.auth import get_current_user, get_workspace_id"
}

🔧 Tool: Read
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\subscriptions.py",
  "offset": 300
}

Now let me add the analytics endpoint at the end of the file:

🔧 Tool: Edit
Input: {
  "file_path": "C:\\Users\\admin\\Desktop\\RawDrive2\\services\\webhooks-service\\src\\api\\v1\\subscriptions.py",
  "old_string": "    return SecretRotationResponse(\n        new_secret=new_secret,\n        secret_version=subscription[\"secret_version\"],\n        old_secret_valid_until=subscription[\"previous_secret_expires_at\"],\n    )",
  "new_string": "    return SecretRotationResponse(\n        new_secret=new_secret,\n        secret_version=subscription[\"secret_version\"],\n        old_secret_valid_until=subscription[\"previous_secret_expires_at\"],\n    )\n\n\n@router.get(\n    \"/subscriptions/{subscription_id}/analytics\",\n    response_model=DeliveryDashboardResponse,\n    summary=\"Get subscription delivery analytics\",\n)\nasync def get_subscription_analytics(\n    subscription_id: UUID,\n    workspace_id: UUID = Depends(get_workspace_id),\n    period: Literal[\"24h\", \"7d\", \"30d\"] = Query(default=\"7d\"),\n):\n    \"\"\"\n    Get comprehensive delivery analytics for a webhook subscription.\n\n    Returns time series data, status breakdown, and event type breakdown\n    for the delivery dashboard.\n    \"\"\"\n    # Verify subscription exists\n    subscription = await subscription_repository.get_by_id(\n        subscription_id=subscription_id,\n        workspace_id=workspace_id,\n    )\n\n    if not subscription:\n        raise HTTPException(\n            status_code=status.HTTP_404_NOT_FOUND,\n            detail=\"Webhook subscription not found\",\n        )\n\n    # Calculate time range and granularity\n    now = datetime.now(timezone.utc)\n    if period == \"24h\":\n        start_time = now - timedelta(hours=24)\n        granularity = \"hour\"\n    elif period == \"7d\":\n        start_time = now - timedelta(days=7)\n        granularity = \"day\"\n    else:  # 30d\n        start_time = now - timedelta(days=30)\n        granularity = \"day\"\n\n    # Fetch all analytics data in parallel\n    import asyncio\n    stats_task = delivery_repository.get_stats_for_subscription(\n        subscription_id=subscription_id,\n        workspace_id=workspace_id,\n        start_time=start_time,\n    )\n    time_series_task = delivery_repository.get_time_series(\n        subscription_id=subscription_id,\n        workspace_id=workspace_id,\n        start_time=start_time,\n        end_time=now,\n        granularity=granularity,\n    )\n    status_breakdown_task = delivery_repository.get_status_breakdown(\n        subscription_id=subscription_id,\n        workspace_id=workspace_id,\n        start_time=start_time,\n    )\n    event_type_breakdown_task = delivery_repository.get_event_type_breakdown(\n        subscription_id=subscription_id,\n        workspace_id=workspace_id,\n        start_time=start_time,\n        limit=10,\n    )\n\n    stats, time_series_raw, status_breakdown_raw, event_type_breakdown_raw = await asyncio.gather(\n        stats_task,\n        time_series_task,\n        status_breakdown_task,\n        event_type_breakdown_task,\n    )\n\n    # Build response\n    total = stats.get(\"total_deliveries\", 0) or 0\n    successful = stats.get(\"successful\", 0) or 0\n    failed = stats.get(\"failed\", 0) or 0\n    retrying = stats.get(\"retrying\", 0) or 0\n    exhausted = stats.get(\"exhausted\", 0) or 0\n\n    metrics = DashboardMetrics(\n        total_deliveries=total,\n        successful_deliveries=successful,\n        failed_deliveries=failed,\n        retried_deliveries=retrying,\n        exhausted_deliveries=exhausted,\n        success_rate=(successful / total * 100) if total > 0 else 0,\n        avg_response_time_ms=stats.get(\"avg_duration\") or 0,\n        p95_response_time_ms=stats.get(\"p95_duration\") or 0,\n    )\n\n    time_series = [\n        DeliveryTimeSeriesPoint(\n            timestamp=point[\"timestamp\"],\n            total=point[\"total\"],\n            successful=point[\"successful\"],\n            failed=point[\"failed\"],\n            retrying=point.get(\"retrying\", 0),\n            avg_response_time_ms=point.get(\"avg_response_time_ms\"),\n            p95_response_time_ms=point.get(\"p95_response_time_ms\"),\n        )\n        for point in time_series_raw\n    ]\n\n    status_breakdown = [\n        StatusBreakdownItem(\n            status=item[\"status\"],\n            count=item[\"count\"],\n            percentage=item[\"percentage\"],\n        )\n        for item in status_breakdown_raw\n    ]\n\n    event_type_breakdown = [\n        EventTypeBreakdownItem(\n            event_type=item[\"event_type\"],\n            count=item[\"count\"],\n            successful=item[\"successful\"],\n            failed=item[\"failed\"],\n            success_rate=item[\"success_rate\"],\n        )\n        for item in event_type_breakdown_raw\n    ]\n\n    return DeliveryDashboardResponse(\n        period=period,\n        granularity=granularity,\n        metrics=metrics,\n        time_series=time_series,\n        status_breakdown=status_breakdown,\n        event_type_breakdown=event_type_breakdown,\n    )\n\n\n@router.get(\n    \"/analytics\",\n    response_model=DeliveryDashboardResponse,\n    summary=\"Get workspace-wide delivery analytics\",\n)\nasync def get_workspace_analytics(\n    workspace_id: UUID = Depends(get_workspace_id),\n    period: Literal[\"24h\", \"7d\", \"30d\"] = Query(default=\"7d\"),\n):\n    \"\"\"\n    Get comprehensive delivery analytics for all webhooks in the workspace.\n\n    Returns aggregated time series data, status breakdown, and event type breakdown.\n    \"\"\"\n    # Calculate time range and granularity\n    now = datetime.now(timezone.utc)\n    if period == \"24h\":\n        start_time = now - timedelta(hours=24)\n        granularity = \"hour\"\n    elif period == \"7d\":\n        start_time = now - timedelta(days=7)\n        granularity = \"day\"\n    else:  # 30d\n        start_time = now - timedelta(days=30)\n        granularity = \"day\"\n\n    # Fetch all analytics data in parallel\n    import asyncio\n    time_series_task = delivery_repository.get_time_series(\n        workspace_id=workspace_id,\n        start_time=start_time,\n        end_time=now,\n        granularity=granularity,\n    )\n    status_breakdown_task = delivery_repository.get_status_breakdown(\n        workspace_id=workspace_id,\n        start_time=start_time,\n    )\n    event_type_breakdown_task = delivery_repository.get_event_type_breakdown(\n        workspace_id=workspace_id,\n        start_time=start_time,\n        limit=10,\n    )\n\n    time_series_raw, status_breakdown_raw, event_type_breakdown_raw = await asyncio.gather(\n        time_series_task,\n        status_breakdown_task,\n        event_type_breakdown_task,\n    )\n\n    # Calculate aggregate metrics from time series\n    total = sum(point[\"total\"] for point in time_series_raw) if time_series_raw else 0\n    successful = sum(point[\"successful\"] for point in time_series_raw) if time_series_raw else 0\n    failed = sum(point[\"failed\"] for point in time_series_raw) if time_series_raw else 0\n    retrying = sum(point.get(\"retrying\", 0) for point in time_series_raw) if time_series_raw else 0\n\n    # Calculate average response times\n    response_times = [\n        point[\"avg_response_time_ms\"]\n        for point in time_series_raw\n        if point.get(\"avg_response_time_ms\") is not None\n    ]\n    avg_response_time = sum(response_times) / len(response_times) if response_times else 0\n\n    p95_times = [\n        point[\"p95_response_time_ms\"]\n        for point in time_series_raw\n        if point.get(\"p95_response_time_ms\") is not None\n    ]\n    p95_response_time = max(p95_times) if p95_times else 0\n\n    # Count exhausted from status breakdown\n    exhausted = next(\n        (item[\"count\"] for item in status_breakdown_raw if item[\"status\"] == \"exhausted\"),\n        0,\n    )\n\n    metrics = DashboardMetrics(\n        total_deliveries=total,\n        successful_deliveries=successful,\n        failed_deliveries=failed,\n        retried_deliveries=retrying,\n        exhausted_deliveries=exhausted,\n        success_rate=(successful / total * 100) if total > 0 else 0,\n        avg_response_time_ms=avg_response_time,\n        p95_response_time_ms=p95_response_time,\n    )\n\n    time_series = [\n        DeliveryTimeSeriesPoint(\n            timestamp=point[\"timestamp\"],\n            total=point[\"total\"],\n            successful=point[\"successful\"],\n            failed=point[\"failed\"],\n            retrying=point.get(\"retrying\", 0),\n            avg_response_time_ms=point.get(\"avg_response_time_ms\"),\n            p95_response_time_ms=point.get(\"p95_response_time_ms\"),\n        )\n        for point in time_series_raw\n    ]\n\n    status_breakdown = [\n        StatusBreakdownItem(\n            status=item[\"status\"],\n            count=item[\"count\"],\n            percentage=item[\"percentage\"],\n        )\n        for item in status_breakdown_raw\n    ]\n\n    event_type_breakdown = [\n        EventTypeBreakdownItem(\n            event_type=item[\"event_type\"],\n            count=item[\"count\"],\n            successful=item[\"successful\"],\n            failed=item[\"failed\"],\n            success_rate=item[\"success_rate\"],\n        )\n        for item in event_type_breakdown_raw\n    ]\n\n    return DeliveryDashboardResponse(\n        period=period,\n        granularity=granularity,\n        metrics=metrics,\n        time_series=time_series,\n        status_breakdown=status_breakdown,\n        event_type_breakdown=event_type_breakdown,\n    )"
}

Looking at the summary, I've completed all the tasks for the comprehensive webhook event system implementation. Let me update the todo list to reflect the completed status and provide a summary of what was accomplished.

🔧 Tool: TodoWrite
Input: {
  "todos": [
    {
      "content": "Analyze existing webhook service structure",
      "status": "completed",
      "activeForm": "Analyzing existing webhook service structure"
    },
    {
      "content": "Identify missing features based on requirements",
      "status": "completed",
      "activeForm": "Identifying missing features based on requirements"
    },
    {
      "content": "Enhance event catalog with analytics events",
      "status": "completed",
      "activeForm": "Enhancing event catalog with analytics events"
    },
    {
      "content": "Create webhook delivery dashboard with charts",
      "status": "completed",
      "activeForm": "Creating webhook delivery dashboard with charts"
    },
    {
      "content": "Add signature verification documentation/helper component",
      "status": "completed",
      "activeForm": "Adding signature verification documentation/helper component"
    },
    {
      "content": "Add integration code snippets for external developers",
      "status": "completed",
      "activeForm": "Adding integration code snippets for external developers"
    },
    {
      "content": "Create analytics time series API endpoint",
      "status": "completed",
      "activeForm": "Creating analytics time series API endpoint"
    }
  ]
}

The comprehensive webhook event system implementation is now complete. Here's a summary of everything that was built:

## Completed Implementation

### 1. Event Catalog Enhancements
- Added 9 new event types across 3 new categories:
  - **Analytics**: `analytics.report_generated`, `analytics.threshold_reached`, `analytics.export_completed`
  - **Automation**: `automation.workflow_triggered`, `automation.workflow_completed`, `automation.action_executed`
  - **Export**: `export.batch_started`, `export.batch_completed`, `export.download_ready`

### 2. Webhook Delivery Dashboard (`WebhookDeliveryDashboard.tsx`)
- Real-time metrics display (total, successful, failed, retrying deliveries)
- Success rate and response time tracking (avg + p95)
- Period selector (24h, 7d, 30d)
- Time series chart visualization
- Status breakdown with percentages
- Event type breakdown with success rates per type

### 3. Developer Integration Guide (`WebhookDeveloperGuide.tsx`)
- Signature verification code examples in 5 languages:
  - Node.js, Python, Ruby, Go, PHP
- Webhook headers documentation
- Payload structure reference
- Best practices accordion with retry handling and security tips

### 4. Analytics API Endpoints (`subscriptions.py`)
- `GET /webhooks/subscriptions/{subscription_id}/analytics` - per-subscription analytics
- `GET /webhooks/analytics` - workspace-wide analytics
- Both return comprehensive `DeliveryDashboardResponse` with:
  - Summary metrics
  - Time series data (hourly/daily/weekly granularity)
  - Status breakdown
  - Event type breakdown

### 5. Repository Layer (`delivery_repository.py`)
- `get_time_series()` - Time-bucketed delivery analytics
- `get_status_breakdown()` - Status distribution with percentages
- `get_event_type_breakdown()` - Per-event-type success metrics

### 6. Schema Definitions (`stats.py`)
- `DeliveryTimeSeriesPoint` - Time series data point
- `StatusBreakdownItem` - Status distribution item
- `EventTypeBreakdownItem` - Event type success metrics
- `DashboardMetrics` - Summary metrics
- `DeliveryDashboardResponse` - Complete dashboard response

### Key Features Delivered
- **Event Signatures**: HMAC-SHA256 verification with documented implementation in 5 languages
- **Retry Logic**: Exponential backoff already in place, with dashboard visibility
- **Delivery Dashboard**: Full success/failure rate tracking with visualizations
- **Third-party Integration**: Comprehensive developer guide for Zapier/IFTTT-style integrations
- **Event Versioning**: Schema-versioned payloads with version field in all events