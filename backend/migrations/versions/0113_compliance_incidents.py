"""Incidents table for security and compliance incident management.

Creates the incidents table to track and manage security and compliance incidents:
- Security breaches and data leaks
- Policy violations and compliance failures
- System failures and data integrity issues
- Third-party security incidents affecting the platform

The table supports:
- Multi-tenant workspace isolation
- Incident lifecycle tracking with status workflow
- Severity and impact classification
- Investigation and remediation tracking
- Regulatory notification requirements (GDPR 72-hour rule)
- Post-incident review and lessons learned
- Integration with legal holds for evidence preservation

Feature: Audit & Compliance System
Revision ID: 0113
Revises: 0112
Create Date: 2026-01-06
"""

from alembic import op

# Revision identifiers used by Alembic
revision = "0113"
down_revision = "0112"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create incidents table with comprehensive incident management."""

    # =========================================================================
    # 1. Create incidents table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS incidents (
            -- Primary key
            incident_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- Multi-tenant isolation
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Incident identification
            incident_number VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,

            -- Incident classification
            incident_type VARCHAR(50) NOT NULL,
            category VARCHAR(50) NOT NULL DEFAULT 'security',

            -- Severity and impact
            severity VARCHAR(20) NOT NULL DEFAULT 'medium',
            impact VARCHAR(20) NOT NULL DEFAULT 'medium',
            urgency VARCHAR(20) NOT NULL DEFAULT 'medium',
            priority VARCHAR(20) NOT NULL DEFAULT 'medium',

            -- Status tracking
            status VARCHAR(30) NOT NULL DEFAULT 'detected',
            status_reason TEXT,

            -- Detection information
            detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            detected_by_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            detection_method VARCHAR(30) NOT NULL DEFAULT 'manual',
            detection_source VARCHAR(100),

            -- Affected scope
            affected_users_count INTEGER NOT NULL DEFAULT 0,
            affected_resources_count INTEGER NOT NULL DEFAULT 0,
            affected_data_categories JSONB NOT NULL DEFAULT '[]',
            affected_systems JSONB NOT NULL DEFAULT '[]',
            geographic_scope JSONB NOT NULL DEFAULT '[]',

            -- Data breach specific (GDPR Article 33)
            is_data_breach BOOLEAN NOT NULL DEFAULT false,
            personal_data_involved BOOLEAN NOT NULL DEFAULT false,
            data_subjects_count INTEGER,
            data_categories_affected JSONB NOT NULL DEFAULT '[]',
            breach_type VARCHAR(30),

            -- Regulatory notification tracking
            requires_notification BOOLEAN NOT NULL DEFAULT false,
            notification_deadline_at TIMESTAMPTZ,
            authority_notified_at TIMESTAMPTZ,
            authority_notification_reference VARCHAR(100),
            subjects_notified_at TIMESTAMPTZ,
            subjects_notification_count INTEGER,

            -- Assignment and ownership
            assigned_to_user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            incident_commander_id UUID REFERENCES users(user_id) ON DELETE SET NULL,
            team_members JSONB NOT NULL DEFAULT '[]',

            -- Investigation tracking
            investigation_started_at TIMESTAMPTZ,
            investigation_completed_at TIMESTAMPTZ,
            root_cause TEXT,
            root_cause_category VARCHAR(50),
            attack_vector VARCHAR(100),
            threat_actor_type VARCHAR(50),

            -- Containment and remediation
            containment_started_at TIMESTAMPTZ,
            containment_completed_at TIMESTAMPTZ,
            containment_actions JSONB NOT NULL DEFAULT '[]',

            eradication_started_at TIMESTAMPTZ,
            eradication_completed_at TIMESTAMPTZ,
            eradication_actions JSONB NOT NULL DEFAULT '[]',

            recovery_started_at TIMESTAMPTZ,
            recovery_completed_at TIMESTAMPTZ,
            recovery_actions JSONB NOT NULL DEFAULT '[]',

            -- Resolution
            resolved_at TIMESTAMPTZ,
            resolution_summary TEXT,
            resolution_type VARCHAR(30),

            -- Post-incident
            post_incident_review_at TIMESTAMPTZ,
            lessons_learned TEXT,
            recommendations JSONB NOT NULL DEFAULT '[]',
            follow_up_actions JSONB NOT NULL DEFAULT '[]',

            -- Evidence and documentation
            evidence_preserved BOOLEAN NOT NULL DEFAULT false,
            evidence_location VARCHAR(500),
            legal_hold_id UUID REFERENCES legal_holds(hold_id) ON DELETE SET NULL,

            -- Related entities
            related_incident_ids JSONB NOT NULL DEFAULT '[]',
            related_dsr_ids JSONB NOT NULL DEFAULT '[]',

            -- External references
            external_ticket_id VARCHAR(100),
            external_ticket_url VARCHAR(500),
            insurance_claim_id VARCHAR(100),

            -- Communication log
            communications JSONB NOT NULL DEFAULT '[]',

            -- Timeline of events
            timeline JSONB NOT NULL DEFAULT '[]',

            -- Internal notes and audit trail
            internal_notes TEXT,
            status_history JSONB NOT NULL DEFAULT '[]',

            -- Metadata for additional context
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Reporter information
            reporter_ip_address VARCHAR(45),
            reporter_user_agent TEXT,

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            closed_at TIMESTAMPTZ
        );
        """
    )

    # =========================================================================
    # 2. Add check constraint for incident_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_incident_type
        CHECK (incident_type IN (
            'data_breach',          -- Unauthorized access to personal data
            'security_breach',      -- Security system compromise
            'unauthorized_access',  -- Unauthorized system/data access
            'malware',              -- Malware/ransomware infection
            'phishing',             -- Phishing attack
            'ddos',                 -- Denial of service attack
            'data_loss',            -- Accidental data loss
            'data_corruption',      -- Data integrity issue
            'system_failure',       -- Critical system failure
            'policy_violation',     -- Internal policy violation
            'compliance_failure',   -- Regulatory compliance failure
            'third_party',          -- Third-party/vendor incident
            'insider_threat',       -- Insider threat incident
            'physical_security',    -- Physical security incident
            'social_engineering',   -- Social engineering attack
            'misconfiguration',     -- Security misconfiguration
            'vulnerability',        -- Exploited vulnerability
            'other'                 -- Other incident type
        ));
        """
    )

    # =========================================================================
    # 3. Add check constraint for category
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_category
        CHECK (category IN (
            'security',             -- Security-related incident
            'privacy',              -- Privacy/data protection incident
            'compliance',           -- Compliance violation
            'operational',          -- Operational incident
            'legal',                -- Legal/regulatory incident
            'reputational',         -- Reputational impact incident
            'financial'             -- Financial impact incident
        ));
        """
    )

    # =========================================================================
    # 4. Add check constraint for severity
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_severity
        CHECK (severity IN (
            'critical',     -- Critical: immediate action required
            'high',         -- High: urgent attention needed
            'medium',       -- Medium: standard response
            'low',          -- Low: can be scheduled
            'informational' -- Informational: no immediate action
        ));
        """
    )

    # =========================================================================
    # 5. Add check constraint for impact
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_impact
        CHECK (impact IN (
            'critical',     -- Critical: major business impact
            'high',         -- High: significant impact
            'medium',       -- Medium: moderate impact
            'low',          -- Low: minimal impact
            'none'          -- None: no measurable impact
        ));
        """
    )

    # =========================================================================
    # 6. Add check constraint for urgency
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_urgency
        CHECK (urgency IN (
            'critical',     -- Immediate action required
            'high',         -- Action needed within hours
            'medium',       -- Action needed within days
            'low',          -- Action can be scheduled
            'planned'       -- Planned/scheduled response
        ));
        """
    )

    # =========================================================================
    # 7. Add check constraint for priority
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_priority
        CHECK (priority IN (
            'critical',     -- P1: Drop everything
            'high',         -- P2: High priority
            'medium',       -- P3: Normal priority
            'low',          -- P4: Low priority
            'deferred'      -- P5: Deferred/backlog
        ));
        """
    )

    # =========================================================================
    # 8. Add check constraint for status
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_status
        CHECK (status IN (
            'detected',             -- Initial detection
            'confirmed',            -- Incident confirmed
            'investigating',        -- Under investigation
            'containing',           -- Containment in progress
            'contained',            -- Containment complete
            'eradicating',          -- Eradication in progress
            'eradicated',           -- Threat removed
            'recovering',           -- Recovery in progress
            'recovered',            -- Systems restored
            'resolved',             -- Incident resolved
            'closed',               -- Incident closed
            'post_incident_review', -- PIR in progress
            'false_positive',       -- Determined to be false positive
            'duplicate',            -- Duplicate of another incident
            'escalated'             -- Escalated to higher authority
        ));
        """
    )

    # =========================================================================
    # 9. Add check constraint for detection_method
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_detection_method
        CHECK (detection_method IN (
            'manual',               -- Manually reported
            'automated',            -- Automated detection system
            'monitoring',           -- Monitoring/alerting system
            'audit',                -- Discovered during audit
            'user_report',          -- User reported
            'third_party',          -- Third party notification
            'law_enforcement',      -- Law enforcement notification
            'penetration_test',     -- Discovered during pen test
            'vulnerability_scan',   -- Discovered during vuln scan
            'log_analysis',         -- Log analysis
            'anomaly_detection',    -- Anomaly detection system
            'external_report'       -- External security researcher
        ));
        """
    )

    # =========================================================================
    # 10. Add check constraint for breach_type (GDPR classification)
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_breach_type
        CHECK (breach_type IS NULL OR breach_type IN (
            'confidentiality',      -- Unauthorized disclosure
            'integrity',            -- Unauthorized alteration
            'availability',         -- Loss of access/availability
            'combined'              -- Multiple breach types
        ));
        """
    )

    # =========================================================================
    # 11. Add check constraint for root_cause_category
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_root_cause_category
        CHECK (root_cause_category IS NULL OR root_cause_category IN (
            'human_error',          -- Human mistake
            'process_failure',      -- Process/procedure failure
            'technical_failure',    -- Technical/system failure
            'malicious_activity',   -- Intentional malicious action
            'external_factor',      -- External factor (vendor, etc.)
            'configuration_error',  -- Misconfiguration
            'design_flaw',          -- Design/architecture flaw
            'unknown'               -- Unknown/undetermined
        ));
        """
    )

    # =========================================================================
    # 12. Add check constraint for threat_actor_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_threat_actor_type
        CHECK (threat_actor_type IS NULL OR threat_actor_type IN (
            'external_hacker',      -- External malicious actor
            'organized_crime',      -- Organized crime group
            'nation_state',         -- Nation-state actor
            'insider_malicious',    -- Malicious insider
            'insider_negligent',    -- Negligent insider
            'competitor',           -- Business competitor
            'hacktivist',           -- Hacktivist group
            'script_kiddie',        -- Unskilled attacker
            'unknown',              -- Unknown threat actor
            'not_applicable'        -- No threat actor (e.g., accident)
        ));
        """
    )

    # =========================================================================
    # 13. Add check constraint for resolution_type
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT check_inc_resolution_type
        CHECK (resolution_type IS NULL OR resolution_type IN (
            'remediated',           -- Issue fully remediated
            'mitigated',            -- Risk mitigated but not eliminated
            'accepted',             -- Risk accepted
            'transferred',          -- Risk transferred (insurance, etc.)
            'false_positive',       -- Not a real incident
            'no_action_required',   -- No action required
            'escalated'             -- Escalated to external authority
        ));
        """
    )

    # =========================================================================
    # 14. Create unique constraint for incident_number within workspace
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incidents
        ADD CONSTRAINT uq_inc_workspace_incident_number
        UNIQUE (workspace_id, incident_number);
        """
    )

    # =========================================================================
    # 15. Create indexes for common query patterns
    # =========================================================================

    # Workspace + status for dashboard views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_status
        ON incidents(workspace_id, status);
        """
    )

    # Workspace + created_at for chronological listing
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_created
        ON incidents(workspace_id, created_at DESC);
        """
    )

    # Workspace + detected_at for timeline views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_detected
        ON incidents(workspace_id, detected_at DESC);
        """
    )

    # Active incidents for monitoring dashboard
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_active
        ON incidents(workspace_id, priority DESC, detected_at)
        WHERE status NOT IN ('resolved', 'closed', 'false_positive', 'duplicate');
        """
    )

    # Severity for priority handling
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_severity
        ON incidents(workspace_id, severity, detected_at DESC);
        """
    )

    # Incident type for categorized views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_type
        ON incidents(workspace_id, incident_type);
        """
    )

    # Category for filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_workspace_category
        ON incidents(workspace_id, category);
        """
    )

    # Assigned user for workload tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_assigned_user
        ON incidents(assigned_to_user_id)
        WHERE assigned_to_user_id IS NOT NULL;
        """
    )

    # Incident commander for leadership views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_commander
        ON incidents(incident_commander_id)
        WHERE incident_commander_id IS NOT NULL;
        """
    )

    # Data breaches requiring notification (GDPR 72-hour rule)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_notification_pending
        ON incidents(workspace_id, notification_deadline_at)
        WHERE is_data_breach = true
          AND requires_notification = true
          AND authority_notified_at IS NULL;
        """
    )

    # Data breaches for compliance reporting
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_data_breaches
        ON incidents(workspace_id, detected_at DESC)
        WHERE is_data_breach = true;
        """
    )

    # Legal hold reference
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_legal_hold
        ON incidents(legal_hold_id)
        WHERE legal_hold_id IS NOT NULL;
        """
    )

    # External ticket tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_external_ticket
        ON incidents(external_ticket_id)
        WHERE external_ticket_id IS NOT NULL;
        """
    )

    # Resolved incidents for metrics
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_resolved
        ON incidents(workspace_id, resolved_at DESC)
        WHERE resolved_at IS NOT NULL;
        """
    )

    # Detected by user for accountability
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_detected_by
        ON incidents(detected_by_user_id)
        WHERE detected_by_user_id IS NOT NULL;
        """
    )

    # Related incidents GIN index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_related_incidents
        ON incidents USING GIN (related_incident_ids);
        """
    )

    # Affected data categories GIN index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_affected_data_categories
        ON incidents USING GIN (affected_data_categories);
        """
    )

    # Affected systems GIN index
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_inc_affected_systems
        ON incidents USING GIN (affected_systems);
        """
    )

    # =========================================================================
    # 16. Create incident_updates table for detailed incident timeline
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS incident_updates (
            -- Primary key
            update_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- References
            incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Update details
            update_type VARCHAR(30) NOT NULL DEFAULT 'status_change',
            title VARCHAR(255),
            content TEXT NOT NULL,

            -- Status transition (if applicable)
            previous_status VARCHAR(30),
            new_status VARCHAR(30),

            -- Visibility
            visibility VARCHAR(20) NOT NULL DEFAULT 'internal',
            is_public BOOLEAN NOT NULL DEFAULT false,

            -- Author
            created_by_user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,

            -- Attachments and evidence
            attachments JSONB NOT NULL DEFAULT '[]',

            -- Metadata
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Timestamps
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        """
    )

    # =========================================================================
    # 17. Add check constraints for incident_updates
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incident_updates
        ADD CONSTRAINT check_iu_update_type
        CHECK (update_type IN (
            'status_change',        -- Status transition
            'investigation',        -- Investigation update
            'containment',          -- Containment action
            'eradication',          -- Eradication action
            'recovery',             -- Recovery action
            'communication',        -- External/internal communication
            'evidence',             -- Evidence collection
            'escalation',           -- Escalation notice
            'assignment',           -- Assignment change
            'severity_change',      -- Severity adjustment
            'notification',         -- Regulatory notification
            'general',              -- General update
            'resolution',           -- Resolution details
            'post_incident'         -- Post-incident review
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE incident_updates
        ADD CONSTRAINT check_iu_visibility
        CHECK (visibility IN (
            'internal',             -- Internal team only
            'management',           -- Management visibility
            'organization',         -- Organization-wide
            'external',             -- External stakeholders
            'public'                -- Public disclosure
        ));
        """
    )

    # =========================================================================
    # 18. Create indexes for incident_updates
    # =========================================================================

    # Incident + created for timeline
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iu_incident_created
        ON incident_updates(incident_id, created_at DESC);
        """
    )

    # Workspace + created for organization-wide timeline
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iu_workspace_created
        ON incident_updates(workspace_id, created_at DESC);
        """
    )

    # Update type for filtering
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iu_type
        ON incident_updates(update_type);
        """
    )

    # Created by for accountability
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iu_created_by
        ON incident_updates(created_by_user_id);
        """
    )

    # Public updates for disclosure tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iu_public
        ON incident_updates(incident_id)
        WHERE is_public = true;
        """
    )

    # =========================================================================
    # 19. Create incident_affected_resources junction table
    # =========================================================================
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS incident_affected_resources (
            -- Primary key
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

            -- References
            incident_id UUID NOT NULL REFERENCES incidents(incident_id) ON DELETE CASCADE,
            workspace_id UUID NOT NULL REFERENCES workspaces(workspace_id) ON DELETE CASCADE,

            -- Resource identification
            resource_type VARCHAR(50) NOT NULL,
            resource_id UUID NOT NULL,
            resource_name VARCHAR(255),

            -- User associated with the resource (if applicable)
            user_id UUID REFERENCES users(user_id) ON DELETE SET NULL,

            -- Impact details
            impact_type VARCHAR(30) NOT NULL DEFAULT 'affected',
            impact_description TEXT,

            -- Data classification (for breach assessment)
            data_classification VARCHAR(30),
            contains_pii BOOLEAN NOT NULL DEFAULT false,
            contains_sensitive_data BOOLEAN NOT NULL DEFAULT false,

            -- Timeline
            identified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            remediated_at TIMESTAMPTZ,

            -- Remediation status
            remediation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
            remediation_notes TEXT,

            -- Metadata
            metadata JSONB NOT NULL DEFAULT '{}',

            -- Unique constraint: each resource can only be affected once per incident
            CONSTRAINT uq_iar_incident_resource UNIQUE (incident_id, resource_type, resource_id)
        );
        """
    )

    # =========================================================================
    # 20. Add check constraints for incident_affected_resources
    # =========================================================================
    op.execute(
        """
        ALTER TABLE incident_affected_resources
        ADD CONSTRAINT check_iar_impact_type
        CHECK (impact_type IN (
            'compromised',          -- Fully compromised
            'affected',             -- Affected but not compromised
            'at_risk',              -- At risk but not confirmed affected
            'investigated',         -- Under investigation
            'cleared'               -- Investigated and cleared
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE incident_affected_resources
        ADD CONSTRAINT check_iar_data_classification
        CHECK (data_classification IS NULL OR data_classification IN (
            'public',               -- Public data
            'internal',             -- Internal use only
            'confidential',         -- Confidential
            'restricted',           -- Restricted/sensitive
            'pii',                  -- Personal identifiable information
            'phi',                  -- Protected health information
            'pci',                  -- Payment card data
            'secret'                -- Top secret/highly restricted
        ));
        """
    )

    op.execute(
        """
        ALTER TABLE incident_affected_resources
        ADD CONSTRAINT check_iar_remediation_status
        CHECK (remediation_status IN (
            'pending',              -- Awaiting remediation
            'in_progress',          -- Remediation in progress
            'completed',            -- Remediation complete
            'not_required',         -- No remediation required
            'blocked'               -- Remediation blocked
        ));
        """
    )

    # =========================================================================
    # 21. Create indexes for incident_affected_resources
    # =========================================================================

    # Incident + resource lookup
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_incident
        ON incident_affected_resources(incident_id);
        """
    )

    # Resource lookup (for checking if resource is involved in incidents)
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_resource
        ON incident_affected_resources(resource_type, resource_id);
        """
    )

    # Workspace + resource for tenant-scoped queries
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_workspace_resource
        ON incident_affected_resources(workspace_id, resource_type, resource_id);
        """
    )

    # User lookup for user-centric incident views
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_user
        ON incident_affected_resources(user_id)
        WHERE user_id IS NOT NULL;
        """
    )

    # PII resources for breach assessment
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_pii
        ON incident_affected_resources(incident_id)
        WHERE contains_pii = true;
        """
    )

    # Pending remediation for action tracking
    op.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_iar_pending_remediation
        ON incident_affected_resources(incident_id, remediation_status)
        WHERE remediation_status IN ('pending', 'in_progress');
        """
    )

    # =========================================================================
    # 22. Add table and column comments for documentation
    # =========================================================================
    op.execute(
        """
        COMMENT ON TABLE incidents IS
        'Tracks security and compliance incidents including data breaches, policy violations, and system failures. Supports full incident lifecycle management with GDPR/regulatory notification tracking.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.incident_number IS
        'Human-readable incident identifier (e.g., INC-2026-00001). Unique within workspace.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.severity IS
        'Incident severity based on potential impact: critical (immediate action), high (urgent), medium (standard), low (scheduled), informational (no action).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.priority IS
        'Calculated priority based on impact and urgency matrix. Used for response prioritization.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.notification_deadline_at IS
        'Regulatory deadline for notification (e.g., 72 hours for GDPR data breach notification to supervisory authority).';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.breach_type IS
        'GDPR breach classification: confidentiality (disclosure), integrity (alteration), availability (loss of access), or combined.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.containment_actions IS
        'JSON array of containment actions: [{"action": "...", "performed_at": "...", "performed_by": "...", "result": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.timeline IS
        'JSON array of incident events: [{"event": "...", "occurred_at": "...", "description": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.team_members IS
        'JSON array of team member assignments: [{"user_id": "...", "role": "...", "assigned_at": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.recommendations IS
        'JSON array of post-incident recommendations: [{"recommendation": "...", "priority": "...", "assigned_to": "...", "due_date": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.communications IS
        'JSON array of communications sent: [{"type": "...", "sent_at": "...", "recipients": [...], "content_summary": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incidents.status_history IS
        'JSON array of status changes: [{"status": "...", "changed_at": "...", "changed_by": "...", "reason": "..."}]';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE incident_updates IS
        'Detailed timeline entries for incident investigation, containment, and resolution. Supports both internal and external communications.';
        """
    )

    op.execute(
        """
        COMMENT ON TABLE incident_affected_resources IS
        'Junction table tracking resources affected by incidents. Used for impact assessment, breach scope, and remediation tracking.';
        """
    )

    op.execute(
        """
        COMMENT ON COLUMN incident_affected_resources.data_classification IS
        'Data sensitivity classification of the affected resource. Used for breach severity assessment and notification requirements.';
        """
    )

    # =========================================================================
    # 23. Create trigger for updated_at timestamp on incidents
    # =========================================================================
    op.execute(
        """
        CREATE OR REPLACE FUNCTION update_inc_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        """
    )

    op.execute(
        """
        DROP TRIGGER IF EXISTS trigger_inc_updated_at ON incidents;
        CREATE TRIGGER trigger_inc_updated_at
            BEFORE UPDATE ON incidents
            FOR EACH ROW
            EXECUTE FUNCTION update_inc_updated_at();
        """
    )


def downgrade() -> None:
    """Drop incidents table and related objects."""

    # Drop trigger first
    op.execute("DROP TRIGGER IF EXISTS trigger_inc_updated_at ON incidents;")
    op.execute("DROP FUNCTION IF EXISTS update_inc_updated_at();")

    # Drop incident_affected_resources indexes
    op.execute("DROP INDEX IF EXISTS idx_iar_pending_remediation;")
    op.execute("DROP INDEX IF EXISTS idx_iar_pii;")
    op.execute("DROP INDEX IF EXISTS idx_iar_user;")
    op.execute("DROP INDEX IF EXISTS idx_iar_workspace_resource;")
    op.execute("DROP INDEX IF EXISTS idx_iar_resource;")
    op.execute("DROP INDEX IF EXISTS idx_iar_incident;")

    # Drop incident_affected_resources table
    op.execute("DROP TABLE IF EXISTS incident_affected_resources CASCADE;")

    # Drop incident_updates indexes
    op.execute("DROP INDEX IF EXISTS idx_iu_public;")
    op.execute("DROP INDEX IF EXISTS idx_iu_created_by;")
    op.execute("DROP INDEX IF EXISTS idx_iu_type;")
    op.execute("DROP INDEX IF EXISTS idx_iu_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_iu_incident_created;")

    # Drop incident_updates table
    op.execute("DROP TABLE IF EXISTS incident_updates CASCADE;")

    # Drop incidents indexes
    op.execute("DROP INDEX IF EXISTS idx_inc_affected_systems;")
    op.execute("DROP INDEX IF EXISTS idx_inc_affected_data_categories;")
    op.execute("DROP INDEX IF EXISTS idx_inc_related_incidents;")
    op.execute("DROP INDEX IF EXISTS idx_inc_detected_by;")
    op.execute("DROP INDEX IF EXISTS idx_inc_resolved;")
    op.execute("DROP INDEX IF EXISTS idx_inc_external_ticket;")
    op.execute("DROP INDEX IF EXISTS idx_inc_legal_hold;")
    op.execute("DROP INDEX IF EXISTS idx_inc_data_breaches;")
    op.execute("DROP INDEX IF EXISTS idx_inc_notification_pending;")
    op.execute("DROP INDEX IF EXISTS idx_inc_commander;")
    op.execute("DROP INDEX IF EXISTS idx_inc_assigned_user;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_category;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_type;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_severity;")
    op.execute("DROP INDEX IF EXISTS idx_inc_active;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_detected;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_created;")
    op.execute("DROP INDEX IF EXISTS idx_inc_workspace_status;")

    # Drop incidents table (cascades constraints)
    op.execute("DROP TABLE IF EXISTS incidents CASCADE;")
