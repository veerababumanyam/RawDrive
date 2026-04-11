--
-- PostgreSQL database dump
--

\restrict os8sfZsJoEBTGduT0NBHv3f2VBVKfglYKV3L543Bu8ZG84UIP9YU1i3BSK9zMut

-- Dumped from database version 16.13 (Debian 16.13-1.pgdg12+1)
-- Dumped by pg_dump version 16.13 (Debian 16.13-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

-- *not* creating schema, since initdb creates it


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS '';


--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


--
-- Name: enforce_audit_log_append_only(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_audit_log_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
            RAISE EXCEPTION 'gallery_access_logs is append-only (GAL-FR-172 immutable audit)';
        END;
        $$;


--
-- Name: prevent_access_log_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_access_log_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'gallery_access_logs is append-only: UPDATE and DELETE are not allowed';
END;
$$;


--
-- Name: prevent_album_approval_mutation(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_album_approval_mutation() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'album_approvals is append-only: UPDATE and DELETE are not allowed';
END;
$$;


--
-- Name: prevent_audit_log_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.prevent_audit_log_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is immutable: % operations are not allowed', TG_OP;
    RETURN NULL;
END;
$$;


--
-- Name: redact_audit_log_for_subject(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redact_audit_log_for_subject(p_user_id uuid, p_email text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_rows_affected INTEGER := 0;
BEGIN
    -- Nothing to do if we have no user_id. audit_log is keyed on UUID,
    -- not email, so visitor-only erasures are a no-op here.
    IF p_user_id IS NULL THEN
        RETURN 0;
    END IF;

    -- Disable the blocking triggers for the current transaction only.
    -- ALTER TABLE ... DISABLE TRIGGER is transactional in Postgres when
    -- wrapped in a function with SET LOCAL semantics — the triggers
    -- re-enable automatically at COMMIT/ROLLBACK.
    EXECUTE 'ALTER TABLE audit_log DISABLE TRIGGER audit_log_prevent_update';
    EXECUTE 'ALTER TABLE audit_log DISABLE TRIGGER audit_log_prevent_delete';

    UPDATE audit_log
    SET actor_id = NULL,
        metadata = jsonb_build_object('redacted', true, 'redacted_at', now())
    WHERE actor_id = p_user_id;

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Re-enable immediately so the immutability guard is only relaxed
    -- for the smallest possible window.
    EXECUTE 'ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_update';
    EXECUTE 'ALTER TABLE audit_log ENABLE TRIGGER audit_log_prevent_delete';

    RETURN v_rows_affected;
END;
$$;


--
-- Name: FUNCTION redact_audit_log_for_subject(p_user_id uuid, p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.redact_audit_log_for_subject(p_user_id uuid, p_email text) IS 'DSR erasure helper. Scrubs actor_id/metadata in legacy audit_log for the given user. Bypasses immutability triggers via SECURITY DEFINER. Called from dsr_eraser service only.';


--
-- Name: redact_audit_logs_for_subject(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.redact_audit_logs_for_subject(p_user_id uuid, p_email text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
    v_rows_affected INTEGER := 0;
    v_redacted_meta JSONB;
BEGIN
    v_redacted_meta := jsonb_build_object('redacted', true, 'redacted_at', now());

    -- Drop the rewrite rules for this transaction. DROP RULE is
    -- transactional so the rules are restored automatically on rollback;
    -- we reinstate them explicitly below for the commit path.
    DROP RULE IF EXISTS audit_logs_no_update ON audit_logs;
    DROP RULE IF EXISTS audit_logs_no_delete ON audit_logs;

    UPDATE audit_logs
    SET actor_id = NULL,
        metadata = v_redacted_meta,
        before_state = NULL,
        after_state = NULL,
        ip_address = NULL,
        user_agent = NULL
    WHERE (p_user_id IS NOT NULL AND actor_id = p_user_id)
       OR (p_email IS NOT NULL AND p_email <> ''
           AND (metadata->>'email' = p_email
                OR metadata->>'subject_email' = p_email));

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    -- Re-install the rules so no other caller can mutate the table.
    CREATE RULE audit_logs_no_update AS ON UPDATE TO audit_logs DO INSTEAD NOTHING;
    CREATE RULE audit_logs_no_delete AS ON DELETE TO audit_logs DO INSTEAD NOTHING;

    RETURN v_rows_affected;
END;
$$;


--
-- Name: FUNCTION redact_audit_logs_for_subject(p_user_id uuid, p_email text); Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON FUNCTION public.redact_audit_logs_for_subject(p_user_id uuid, p_email text) IS 'DSR erasure helper. Scrubs PII from M7 audit_logs for the given user or email. Bypasses immutability rules via SECURITY DEFINER. Called from dsr_eraser service only.';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    provider character varying(50) DEFAULT 'gemini'::character varying NOT NULL,
    encrypted_key text NOT NULL,
    model_preference character varying(100) DEFAULT 'gemini-2.0-flash'::character varying NOT NULL,
    monthly_cap_paisa bigint DEFAULT 0 NOT NULL,
    alert_80_sent boolean DEFAULT false NOT NULL,
    alert_100_sent boolean DEFAULT false NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    type character varying(50) NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    total_items integer DEFAULT 0 NOT NULL,
    processed_items integer DEFAULT 0 NOT NULL,
    result jsonb,
    error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_search_queries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_search_queries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid,
    workspace_id uuid,
    query text NOT NULL,
    query_type text DEFAULT 'text'::text NOT NULL,
    result_count integer DEFAULT 0 NOT NULL,
    visitor_email text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: ai_usage_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_usage_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    operation character varying(50) NOT NULL,
    model character varying(100) NOT NULL,
    input_tokens bigint DEFAULT 0 NOT NULL,
    output_tokens bigint DEFAULT 0 NOT NULL,
    cost_estimate_paisa bigint DEFAULT 0 NOT NULL,
    asset_id uuid,
    job_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: album_approvals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.album_approvals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    session_id uuid,
    approved_by_name text NOT NULL,
    approved_by_email text NOT NULL,
    approved_by_user_id uuid,
    version_hash text NOT NULL,
    config_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    ip_address text,
    user_agent text,
    notes text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: album_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.album_assets (
    album_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: albums; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.albums (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    parent_id uuid,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    cover_asset_id uuid,
    "position" integer DEFAULT 0 NOT NULL,
    smart_filter jsonb,
    asset_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: alert_thresholds; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.alert_thresholds (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    metric_type character varying(30) NOT NULL,
    service_name character varying(50),
    warning_threshold double precision NOT NULL,
    critical_threshold double precision NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: api_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    key_hash text NOT NULL,
    key_prefix text NOT NULL,
    scopes text[] DEFAULT '{}'::text[] NOT NULL,
    rate_limit integer DEFAULT 1000 NOT NULL,
    last_used_at timestamp with time zone,
    expires_at timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: asset_derivatives; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.asset_derivatives (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    variant character varying(50) NOT NULL,
    storage_key text NOT NULL,
    width integer,
    height integer,
    size_bytes bigint DEFAULT 0 NOT NULL,
    format character varying(20) DEFAULT 'jpeg'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    size_bytes bigint DEFAULT 0 NOT NULL,
    storage_key text NOT NULL,
    storage_driver text DEFAULT 'r2'::text NOT NULL,
    width integer,
    height integer,
    blurhash text,
    exif_data jsonb DEFAULT '{}'::jsonb,
    thumbnail_urls jsonb DEFAULT '{}'::jsonb,
    uploaded_by uuid,
    status text DEFAULT 'processing'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    ai_tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    ai_caption text,
    ai_quality_score numeric(5,3),
    embedding public.vector(768),
    ai_tag_status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    ai_tagged_at timestamp with time zone,
    processing_status character varying(20) DEFAULT 'uploaded'::character varying NOT NULL,
    processing_error text,
    lifecycle_state character varying(20) DEFAULT 'active'::character varying NOT NULL,
    lqip_base64 text,
    burst_group_id uuid,
    capture_date timestamp with time zone,
    phash text,
    sharpness_score numeric(5,2),
    is_ai_pick boolean DEFAULT false NOT NULL,
    encryption_key_id uuid,
    is_encrypted boolean DEFAULT false NOT NULL,
    rating integer DEFAULT 0 NOT NULL,
    color_label character varying(20) DEFAULT ''::character varying NOT NULL,
    lens_model character varying(255),
    focal_length character varying(50),
    iso_value integer,
    aperture character varying(20),
    shutter_speed character varying(20),
    is_video boolean DEFAULT false NOT NULL,
    video_duration_seconds integer,
    ai_score_breakdown jsonb,
    upload_scan_status text,
    upload_scan_engine text,
    upload_scan_policy_version text,
    upload_scan_risk_score numeric(3,2),
    upload_scan_findings jsonb,
    upload_scan_manifest_hash text
);


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id uuid,
    metadata jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid,
    actor_type character varying(20) DEFAULT 'user'::character varying NOT NULL,
    action character varying(100) NOT NULL,
    resource_type character varying(50),
    resource_id text,
    metadata jsonb DEFAULT '{}'::jsonb,
    before_state jsonb,
    after_state jsonb,
    ip_address text,
    user_agent text,
    workspace_id uuid,
    state_id integer,
    severity character varying(20) DEFAULT 'info'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_logs_actor_type_check CHECK (((actor_type)::text = ANY ((ARRAY['user'::character varying, 'admin'::character varying, 'system'::character varying])::text[]))),
    CONSTRAINT audit_logs_severity_check CHECK (((severity)::text = ANY ((ARRAY['info'::character varying, 'warning'::character varying, 'critical'::character varying])::text[])))
);


--
-- Name: burst_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.burst_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    name text,
    best_pick_id uuid,
    asset_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: channel_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channel_members (
    channel_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role character varying(20) DEFAULT 'member'::character varying NOT NULL,
    last_read_at timestamp with time zone,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channel_members_role_check CHECK (((role)::text = ANY ((ARRAY['admin'::character varying, 'member'::character varying])::text[])))
);


--
-- Name: channels; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.channels (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    channel_type character varying(20) DEFAULT 'general'::character varying NOT NULL,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT channels_channel_type_check CHECK (((channel_type)::text = ANY ((ARRAY['general'::character varying, 'event'::character varying, 'client'::character varying, 'dm'::character varying])::text[])))
);


--
-- Name: client_conversations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_conversations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    client_name character varying(255),
    client_email character varying(255),
    share_token character varying(255) NOT NULL,
    is_client_exempt_retention boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: consent_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.consent_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid,
    visitor_email text NOT NULL,
    visitor_ip text,
    consent_type text NOT NULL,
    granted boolean DEFAULT false NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    withdrawn_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    consent_version_hash text,
    user_agent text,
    legal_basis text DEFAULT 'consent'::text NOT NULL
);


--
-- Name: contacts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contacts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid,
    name text NOT NULL,
    phone text,
    email text,
    contact_type text DEFAULT 'client'::text NOT NULL,
    company text,
    address jsonb,
    tags text[] DEFAULT '{}'::text[],
    notes text,
    total_revenue_paisa bigint DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contacts_type_check CHECK ((contact_type = ANY (ARRAY['client'::text, 'vendor'::text, 'collaborator'::text])))
);


--
-- Name: content_flags; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_flags (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid,
    asset_id uuid,
    flagged_by_email text,
    flagged_by_user_id uuid,
    reason text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT content_flags_reason_check CHECK ((reason = ANY (ARRAY['inappropriate'::text, 'copyright'::text, 'spam'::text, 'harassment'::text, 'privacy'::text, 'other'::text]))),
    CONSTRAINT content_flags_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'reviewed'::text, 'action_taken'::text, 'dismissed'::text])))
);


--
-- Name: contract_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contract_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'custom'::text NOT NULL,
    content_html text DEFAULT ''::text NOT NULL,
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    is_preset boolean DEFAULT false NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contract_templates_category_check CHECK ((category = ANY (ARRAY['wedding'::text, 'event'::text, 'commercial'::text, 'portrait'::text, 'custom'::text])))
);


--
-- Name: contracts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.contracts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    template_id uuid,
    title text NOT NULL,
    content_html text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    total_value_paisa bigint,
    signed_at timestamp with time zone,
    signer_ip inet,
    signer_user_agent text,
    signature_data text,
    expires_at timestamp with time zone,
    event_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT contracts_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'viewed'::text, 'signed'::text, 'expired'::text, 'cancelled'::text])))
);


--
-- Name: coupon_redemptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupon_redemptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    coupon_id uuid NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer,
    invoice_id uuid,
    discount_applied numeric(10,2) NOT NULL,
    redeemed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: coupons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.coupons (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    code character varying(50) NOT NULL,
    created_by uuid NOT NULL,
    owner_type character varying(20) NOT NULL,
    dealer_id uuid,
    coupon_type character varying(30) NOT NULL,
    discount_value bigint NOT NULL,
    scope_state_id integer,
    scope_plan_id uuid,
    scope_product character varying(50),
    scope_campaign character varying(100),
    max_redemptions integer,
    per_user_limit integer DEFAULT 1 NOT NULL,
    redemption_count integer DEFAULT 0 NOT NULL,
    valid_from timestamp with time zone NOT NULL,
    valid_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    is_stackable boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT coupons_coupon_type_check CHECK (((coupon_type)::text = ANY ((ARRAY['percentage'::character varying, 'fixed_amount'::character varying, 'trial_extension'::character varying, 'onboarding_bonus'::character varying, 'feature_addon'::character varying, 'first_payment_waiver'::character varying])::text[]))),
    CONSTRAINT coupons_owner_type_check CHECK (((owner_type)::text = ANY ((ARRAY['admin'::character varying, 'dealer'::character varying, 'photographer'::character varying])::text[])))
);


--
-- Name: dealer_attributions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dealer_attributions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer NOT NULL,
    attribution_source character varying(30) NOT NULL,
    coupon_id uuid,
    referral_code character varying(50),
    effective_from timestamp with time zone DEFAULT now() NOT NULL,
    effective_until timestamp with time zone,
    is_current boolean DEFAULT true NOT NULL,
    attributed_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dealer_attributions_attribution_source_check CHECK (((attribution_source)::text = ANY ((ARRAY['admin_assignment'::character varying, 'coupon'::character varying, 'referral_link'::character varying, 'default_state_dealer'::character varying, 'unattributed'::character varying])::text[])))
);


--
-- Name: dealers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dealers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    state_id integer NOT NULL,
    business_name character varying(255) NOT NULL,
    territory_type character varying(20) DEFAULT 'primary'::character varying NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    commission_rate_pct numeric(5,2),
    bank_account jsonb,
    pan_number character varying(10) NOT NULL,
    gstin character varying(15),
    referral_code character varying(50),
    approved_at timestamp with time zone,
    approved_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT dealers_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'suspended'::character varying, 'terminated'::character varying])::text[]))),
    CONSTRAINT dealers_territory_type_check CHECK (((territory_type)::text = ANY ((ARRAY['primary'::character varying, 'secondary'::character varying, 'ambassador'::character varying])::text[])))
);


--
-- Name: deals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    contact_id uuid NOT NULL,
    title text NOT NULL,
    stage text DEFAULT 'proposal'::text NOT NULL,
    amount_paisa bigint DEFAULT 0 NOT NULL,
    advance_paisa bigint DEFAULT 0,
    event_type text,
    event_date date,
    venue text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT deals_stage_check CHECK ((stage = ANY (ARRAY['proposal'::text, 'negotiation'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);


--
-- Name: desktop_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.desktop_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    device_name text NOT NULL,
    os text NOT NULL,
    app_version text NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    upload_stats jsonb DEFAULT '{"total_bytes": 0, "total_uploaded": 0}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT desktop_sessions_os_check CHECK ((os = ANY (ARRAY['windows'::text, 'macos'::text, 'linux'::text])))
);


--
-- Name: download_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.download_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    asset_id uuid,
    download_job_id uuid,
    downloader_name text,
    downloader_email text,
    downloader_user_id uuid,
    downloader_ip text,
    variant text DEFAULT 'original'::text NOT NULL,
    file_size_bytes bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: download_jobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.download_jobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    requested_by_name text,
    requested_by_email text,
    requested_by_user_id uuid,
    asset_ids uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    variant text DEFAULT 'original'::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    progress integer DEFAULT 0 NOT NULL,
    total_assets integer DEFAULT 0 NOT NULL,
    download_url text,
    file_size_bytes bigint,
    error_message text,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone
);


--
-- Name: dsr_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.dsr_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    subject_email text NOT NULL,
    subject_user_id uuid,
    request_type text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    requested_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    export_payload jsonb,
    failure_reason text,
    CONSTRAINT dsr_requests_request_type_check CHECK ((request_type = ANY (ARRAY['access'::text, 'erasure'::text, 'rectify'::text]))),
    CONSTRAINT dsr_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'completed'::text, 'failed'::text])))
);


--
-- Name: TABLE dsr_requests; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.dsr_requests IS 'M10 E27-S3 — Data Subject Request workflow per DPDPA & GDPR. Subjects request access/erasure/rectify here. Background worker dsr_purge_worker handles erasure across R2 + audit logs.';


--
-- Name: duplicate_group_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duplicate_group_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    group_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    similarity_score numeric(5,4),
    is_representative boolean DEFAULT false NOT NULL
);


--
-- Name: duplicate_groups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.duplicate_groups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    gallery_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT duplicate_groups_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'resolved'::character varying, 'dismissed'::character varying])::text[])))
);


--
-- Name: edge_delivery_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.edge_delivery_cache (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    variant character varying(50) NOT NULL,
    watermark_config jsonb,
    cache_key text NOT NULL,
    cache_ttl_seconds integer DEFAULT 3600 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: encryption_keys; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.encryption_keys (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    encrypted_dek text NOT NULL,
    key_version integer DEFAULT 1 NOT NULL,
    algorithm character varying(20) DEFAULT 'AES-256-GCM'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    rotated_at timestamp with time zone
);


--
-- Name: events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    event_type text DEFAULT 'shoot'::text NOT NULL,
    start_at timestamp with time zone NOT NULL,
    end_at timestamp with time zone NOT NULL,
    all_day boolean DEFAULT false NOT NULL,
    location text,
    contact_id uuid,
    deal_id uuid,
    status text DEFAULT 'confirmed'::text NOT NULL,
    recurrence_rule text,
    buffer_before_min integer DEFAULT 0 NOT NULL,
    buffer_after_min integer DEFAULT 0 NOT NULL,
    color text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT events_end_after_start CHECK ((end_at > start_at)),
    CONSTRAINT events_status_check CHECK ((status = ANY (ARRAY['tentative'::text, 'confirmed'::text, 'cancelled'::text, 'completed'::text]))),
    CONSTRAINT events_type_check CHECK ((event_type = ANY (ARRAY['shoot'::text, 'meeting'::text, 'editing'::text, 'personal'::text, 'travel'::text, 'blocked'::text, 'other'::text])))
);


--
-- Name: face_clusters; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.face_clusters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    gallery_id uuid,
    face_index integer DEFAULT 0 NOT NULL,
    bounding_box jsonb DEFAULT '{}'::jsonb NOT NULL,
    embedding public.vector(128) NOT NULL,
    cluster_label uuid,
    cluster_name character varying(255) DEFAULT ''::character varying NOT NULL,
    confidence numeric(5,4) DEFAULT 0.0 NOT NULL,
    source character varying(20) DEFAULT 'gemini'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: follow_ups; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_ups (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    lead_id uuid,
    contact_id uuid,
    deal_id uuid,
    assigned_to uuid,
    type text DEFAULT 'call'::text NOT NULL,
    due_at timestamp with time zone NOT NULL,
    notes text,
    status text DEFAULT 'pending'::text NOT NULL,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follow_ups_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'completed'::text, 'overdue'::text, 'cancelled'::text]))),
    CONSTRAINT follow_ups_type_check CHECK ((type = ANY (ARRAY['call'::text, 'whatsapp'::text, 'email'::text, 'meeting'::text, 'task'::text])))
);


--
-- Name: freelancer_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.freelancer_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer NOT NULL,
    title character varying(255) NOT NULL,
    specializations text[] DEFAULT '{}'::text[] NOT NULL,
    city character varying(100),
    daily_rate_paisa bigint,
    description text,
    portfolio_gallery_id uuid,
    availability_calendar jsonb DEFAULT '{}'::jsonb,
    is_published boolean DEFAULT false NOT NULL,
    rating_avg numeric(3,2),
    review_count integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: freelancer_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.freelancer_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    reviewer_id uuid NOT NULL,
    booking_id uuid,
    rating smallint NOT NULL,
    review_text text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT freelancer_reviews_rating_check CHECK (((rating >= 1) AND (rating <= 5)))
);


--
-- Name: galleries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.galleries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    title character varying(255) NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    slug text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text,
    cover_asset_id uuid,
    gallery_type text DEFAULT 'proofing'::text NOT NULL,
    settings jsonb DEFAULT '{}'::jsonb,
    password_hash text,
    watermark_config jsonb DEFAULT '{}'::jsonb,
    is_published boolean DEFAULT false NOT NULL,
    max_selections integer DEFAULT 0,
    status text DEFAULT 'draft'::text NOT NULL,
    created_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    expires_at timestamp with time zone,
    gallery_state character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    cover_config jsonb DEFAULT '{}'::jsonb,
    access_mode text DEFAULT 'private'::text NOT NULL,
    proofing_deadline timestamp with time zone,
    faceid_enabled boolean DEFAULT false NOT NULL,
    allow_downloads boolean DEFAULT true NOT NULL,
    download_quality text DEFAULT 'original'::text NOT NULL,
    watermark_enabled boolean DEFAULT false NOT NULL,
    face_detection_enabled boolean DEFAULT true NOT NULL,
    CONSTRAINT chk_gallery_access_mode CHECK ((access_mode = ANY (ARRAY['invite-only'::text, 'private'::text, 'unlisted'::text, 'public'::text])))
);


--
-- Name: COLUMN galleries.face_detection_enabled; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.galleries.face_detection_enabled IS 'When false, the face detection worker skips all assets in this gallery. Privacy opt-out (M3 E8-S1 #6).';


--
-- Name: gallery_access_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_access_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    share_link_id uuid,
    visitor_ip text,
    visitor_user_agent text,
    access_type text DEFAULT 'view'::text NOT NULL,
    link_type text,
    visitor_name text,
    visitor_email text,
    visitor_user_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_analytics_daily; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_analytics_daily (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    date date NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    unique_visitors integer DEFAULT 0 NOT NULL,
    downloads integer DEFAULT 0 NOT NULL,
    favorites integer DEFAULT 0 NOT NULL,
    shares integer DEFAULT 0 NOT NULL,
    proofing_actions integer DEFAULT 0 NOT NULL,
    device_breakdown jsonb DEFAULT '{}'::jsonb,
    referrer_breakdown jsonb DEFAULT '{}'::jsonb
);


--
-- Name: gallery_analytics_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_analytics_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    event_type text NOT NULL,
    asset_id uuid,
    visitor_ip text,
    visitor_user_agent text,
    visitor_email text,
    referrer text,
    device_type text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    is_hero boolean DEFAULT false NOT NULL,
    added_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_banners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_banners (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    title text NOT NULL,
    body text,
    cta_label text,
    cta_url text,
    coupon_code text,
    background_color text,
    text_color text,
    active_from timestamp with time zone,
    active_until timestamp with time zone,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_carts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_carts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    client_email text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    coupon_code text,
    subtotal integer DEFAULT 0 NOT NULL,
    discount integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_design_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_design_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    preview_url text,
    is_default boolean DEFAULT false NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: TABLE gallery_design_templates; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.gallery_design_templates IS 'Workspace-scoped reusable gallery design templates';


--
-- Name: gallery_orders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_orders (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    cart_id uuid,
    client_name text NOT NULL,
    client_email text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    subtotal integer DEFAULT 0 NOT NULL,
    discount integer DEFAULT 0 NOT NULL,
    total integer DEFAULT 0 NOT NULL,
    payment_status text DEFAULT 'pending'::text NOT NULL,
    payment_id text,
    fulfillment_status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gallery_products; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gallery_products (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    product_type text DEFAULT 'digital'::text NOT NULL,
    price_amount integer DEFAULT 0 NOT NULL,
    price_currency text DEFAULT 'INR'::text NOT NULL,
    asset_id uuid,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: gear_bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gear_bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gear_listing_id uuid NOT NULL,
    renter_id uuid NOT NULL,
    owner_id uuid NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    total_paisa bigint NOT NULL,
    deposit_paisa bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    owner_message text,
    renter_message text,
    return_photos jsonb DEFAULT '[]'::jsonb,
    dispute_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gear_bookings_check CHECK ((end_date >= start_date)),
    CONSTRAINT gear_bookings_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'declined'::character varying, 'active'::character varying, 'returned'::character varying, 'disputed'::character varying, 'completed'::character varying])::text[])))
);


--
-- Name: gear_listings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gear_listings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer NOT NULL,
    listing_type character varying(10) NOT NULL,
    title character varying(255) NOT NULL,
    category character varying(50) NOT NULL,
    brand character varying(100),
    model character varying(100),
    condition character varying(20),
    price_paisa bigint NOT NULL,
    description text,
    images jsonb DEFAULT '[]'::jsonb NOT NULL,
    city character varying(100),
    is_published boolean DEFAULT false NOT NULL,
    is_available boolean DEFAULT true NOT NULL,
    availability_calendar jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT gear_listings_category_check CHECK (((category)::text = ANY ((ARRAY['camera_body'::character varying, 'lens'::character varying, 'lighting'::character varying, 'audio'::character varying, 'accessory'::character varying])::text[]))),
    CONSTRAINT gear_listings_condition_check CHECK (((condition)::text = ANY ((ARRAY['new'::character varying, 'like_new'::character varying, 'good'::character varying, 'fair'::character varying, 'poor'::character varying])::text[]))),
    CONSTRAINT gear_listings_listing_type_check CHECK (((listing_type)::text = ANY ((ARRAY['rental'::character varying, 'sale'::character varying])::text[])))
);


--
-- Name: hire_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hire_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    listing_id uuid NOT NULL,
    requester_id uuid NOT NULL,
    freelancer_id uuid NOT NULL,
    event_details text,
    event_date date,
    compensation_paisa bigint,
    requirements text,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hire_requests_status_check CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'accepted'::character varying, 'declined'::character varying, 'confirmed'::character varying, 'completed'::character varying, 'cancelled'::character varying])::text[])))
);


--
-- Name: invitations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitations (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email text NOT NULL,
    workspace_id uuid NOT NULL,
    role text DEFAULT 'Viewer'::text NOT NULL,
    token text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer NOT NULL,
    contact_id uuid,
    invoice_number text NOT NULL,
    invoice_type text DEFAULT 'service'::text NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    currency text DEFAULT 'INR'::text NOT NULL,
    subtotal_paisa bigint DEFAULT 0 NOT NULL,
    cgst_paisa bigint DEFAULT 0 NOT NULL,
    sgst_paisa bigint DEFAULT 0 NOT NULL,
    igst_paisa bigint DEFAULT 0 NOT NULL,
    total_paisa bigint DEFAULT 0 NOT NULL,
    amount_paid_paisa bigint DEFAULT 0 NOT NULL,
    discount_paisa bigint DEFAULT 0 NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    due_date date,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'paid'::text, 'partially_paid'::text, 'overdue'::text, 'cancelled'::text, 'refunded'::text]))),
    CONSTRAINT invoices_type_check CHECK ((invoice_type = ANY (ARRAY['subscription'::text, 'addon'::text, 'service'::text, 'credit_note'::text])))
);


--
-- Name: kyc_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.kyc_documents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    document_type text NOT NULL,
    storage_key text NOT NULL,
    filename text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    rejection_reason text,
    uploaded_at timestamp with time zone DEFAULT now() NOT NULL,
    reviewed_at timestamp with time zone,
    reviewed_by uuid,
    CONSTRAINT kyc_documents_document_type_check CHECK ((document_type = ANY (ARRAY['pan'::text, 'gst'::text, 'bank_statement'::text, 'address_proof'::text, 'photo_id'::text]))),
    CONSTRAINT kyc_documents_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: leads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.leads (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    name text NOT NULL,
    phone text,
    email text,
    source text DEFAULT 'website'::text,
    stage text DEFAULT 'new'::text NOT NULL,
    event_type text,
    event_date date,
    budget_paisa bigint,
    assigned_to uuid,
    notes text,
    converted_contact_id uuid,
    lost_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT leads_source_check CHECK ((source = ANY (ARRAY['website'::text, 'referral'::text, 'whatsapp'::text, 'walk_in'::text, 'social_media'::text, 'marketplace'::text]))),
    CONSTRAINT leads_stage_check CHECK ((stage = ANY (ARRAY['new'::text, 'contacted'::text, 'qualified'::text, 'proposal'::text, 'negotiation'::text, 'won'::text, 'lost'::text])))
);


--
-- Name: magic_link_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.magic_link_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: margin_ratios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.margin_ratios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    state_id integer,
    plan_id uuid,
    product_type character varying(50),
    channel character varying(30),
    dealer_pct numeric(5,2) NOT NULL,
    platform_pct numeric(5,2) NOT NULL,
    calculation_basis character varying(30) DEFAULT 'net_of_gst'::character varying NOT NULL,
    fixed_incentive_inr numeric(10,2) DEFAULT 0 NOT NULL,
    effective_from date NOT NULL,
    effective_until date,
    created_by uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT margin_ratios_calculation_basis_check CHECK (((calculation_basis)::text = ANY ((ARRAY['net_of_gst'::character varying, 'gross'::character varying])::text[]))),
    CONSTRAINT margin_ratios_pct_sum CHECK (((dealer_pct + platform_pct) = (100)::numeric))
);


--
-- Name: marketplace_inquiries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketplace_inquiries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    inquiry_type character varying(20) NOT NULL,
    listing_id uuid NOT NULL,
    from_user_id uuid NOT NULL,
    to_user_id uuid NOT NULL,
    message text NOT NULL,
    event_date date,
    duration_days integer,
    status character varying(20) DEFAULT 'sent'::character varying NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT marketplace_inquiries_inquiry_type_check CHECK (((inquiry_type)::text = ANY ((ARRAY['freelancer'::character varying, 'gear'::character varying])::text[]))),
    CONSTRAINT marketplace_inquiries_status_check CHECK (((status)::text = ANY ((ARRAY['sent'::character varying, 'read'::character varying, 'replied'::character varying, 'declined'::character varying])::text[])))
);


--
-- Name: messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    channel_id uuid NOT NULL,
    sender_id uuid NOT NULL,
    message_type character varying(20) DEFAULT 'text'::character varying NOT NULL,
    body text NOT NULL,
    attachment_url text,
    parent_message_id uuid,
    is_read boolean DEFAULT false NOT NULL,
    edited_at timestamp with time zone,
    deleted_at timestamp with time zone,
    inserted_at timestamp with time zone DEFAULT now() NOT NULL,
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english'::regconfig, COALESCE(body, ''::text))) STORED,
    CONSTRAINT messages_message_type_check CHECK (((message_type)::text = ANY ((ARRAY['text'::character varying, 'image'::character varying, 'file'::character varying, 'system'::character varying])::text[])))
);


--
-- Name: moderation_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type character varying(30) NOT NULL,
    resource_id uuid NOT NULL,
    resource_url text,
    reason character varying(30) NOT NULL,
    source character varying(20) NOT NULL,
    reporter_id uuid,
    confidence numeric(4,2),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    actioned_by uuid,
    actioned_at timestamp with time zone,
    action_reason text,
    sla_deadline timestamp with time zone DEFAULT (now() + '24:00:00'::interval) NOT NULL,
    workspace_id uuid NOT NULL,
    state_id integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_items_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['gallery'::character varying, 'asset'::character varying, 'profile'::character varying, 'freelancer'::character varying, 'gear'::character varying, 'message'::character varying])::text[]))),
    CONSTRAINT moderation_items_reason_check CHECK (((reason)::text = ANY ((ARRAY['nsfw'::character varying, 'copyright'::character varying, 'spam'::character varying, 'reported'::character varying, 'automated'::character varying, 'other'::character varying])::text[]))),
    CONSTRAINT moderation_items_source_check CHECK (((source)::text = ANY ((ARRAY['automated'::character varying, 'user_report'::character varying])::text[]))),
    CONSTRAINT moderation_items_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'escalated'::character varying])::text[])))
);


--
-- Name: moderation_queue; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_queue (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type character varying(30) NOT NULL,
    content_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    reason character varying(30) DEFAULT 'reported'::character varying NOT NULL,
    reporter_id uuid,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_queue_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['message'::character varying, 'freelancer_listing'::character varying, 'gear_listing'::character varying, 'review'::character varying])::text[]))),
    CONSTRAINT moderation_queue_reason_check CHECK (((reason)::text = ANY ((ARRAY['reported'::character varying, 'auto_flagged'::character varying])::text[]))),
    CONSTRAINT moderation_queue_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'rejected'::character varying, 'warned'::character varying])::text[])))
);


--
-- Name: moderation_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.moderation_rules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content_type character varying(30) NOT NULL,
    rule_type character varying(30) NOT NULL,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT moderation_rules_content_type_check CHECK (((content_type)::text = ANY ((ARRAY['message'::character varying, 'freelancer_listing'::character varying, 'gear_listing'::character varying, 'review'::character varying])::text[]))),
    CONSTRAINT moderation_rules_rule_type_check CHECK (((rule_type)::text = ANY ((ARRAY['keyword'::character varying, 'pattern'::character varying, 'threshold'::character varying])::text[])))
);


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    email character varying(255),
    phone character varying(20),
    display_name character varying(255),
    avatar_url text,
    state_id integer,
    onboarding_step integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    password_hash character varying(255),
    email_verified boolean DEFAULT false NOT NULL,
    platform_role character varying(20) DEFAULT 'photographer'::character varying NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    last_login_at timestamp with time zone,
    mfa_grace_until timestamp with time zone,
    CONSTRAINT users_platform_role_check CHECK (((platform_role)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'dealer'::character varying, 'photographer'::character varying, 'team_member'::character varying, 'client'::character varying])::text[]))),
    CONSTRAINT users_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'suspended'::character varying, 'deleted'::character varying])::text[])))
);


--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    state_id integer,
    owner_id uuid,
    storage_bucket_id character varying(255),
    gstin character varying(15),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    plan_tier character varying(20) DEFAULT 'standard'::character varying NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    suspended_at timestamp with time zone,
    suspended_reason text,
    suspended_by uuid,
    deleted_at timestamp with time zone,
    deleted_by uuid,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    ai_pick_weights jsonb DEFAULT '{"blink": 0.25, "sharpness": 0.20, "expression": 0.35, "composition": 0.20}'::jsonb NOT NULL,
    exif_strip_policy text DEFAULT 'print_safe'::text NOT NULL,
    exif_custom_allowlist jsonb DEFAULT '[]'::jsonb,
    near_dupe_threshold integer DEFAULT 8 NOT NULL,
    upload_policy_mode text DEFAULT 'standard'::text NOT NULL,
    CONSTRAINT workspaces_exif_strip_policy_check CHECK ((exif_strip_policy = ANY (ARRAY['privacy'::text, 'print_safe'::text, 'aggressive'::text, 'custom'::text]))),
    CONSTRAINT workspaces_near_dupe_threshold_check CHECK (((near_dupe_threshold >= 5) AND (near_dupe_threshold <= 12))),
    CONSTRAINT workspaces_status_check CHECK ((status = ANY (ARRAY['active'::text, 'suspended'::text, 'deleted'::text])))
);


--
-- Name: COLUMN workspaces.status; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.workspaces.status IS 'active → suspended (admin action) → deleted (soft-delete, 30-day retention). Hard delete is via background purge worker.';


--
-- Name: mv_admin_platform_stats; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_admin_platform_stats AS
 SELECT ( SELECT count(*) AS count
           FROM public.users) AS total_users,
    ( SELECT count(*) AS count
           FROM public.users
          WHERE (users.updated_at > (now() - '30 days'::interval))) AS active_users_30d,
    ( SELECT count(*) AS count
           FROM public.workspaces) AS total_workspaces,
    ( SELECT count(*) AS count
           FROM public.galleries
          WHERE (galleries.deleted_at IS NULL)) AS total_galleries,
    ( SELECT COALESCE(sum(assets.size_bytes), (0)::numeric) AS "coalesce"
           FROM public.assets
          WHERE (assets.deleted_at IS NULL)) AS total_storage_bytes,
    now() AS refreshed_at
  WITH NO DATA;


--
-- Name: mv_bi_daily_active; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_bi_daily_active AS
 SELECT date_trunc('day'::text, updated_at) AS activity_date,
    state_id,
    'user'::text AS platform_role,
    count(DISTINCT id) AS active_users
   FROM public.users u
  WHERE (updated_at IS NOT NULL)
  GROUP BY (date_trunc('day'::text, updated_at)), state_id, 'user'::text
  WITH NO DATA;


--
-- Name: mv_bi_uploads; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_bi_uploads AS
 SELECT date_trunc('day'::text, a.created_at) AS upload_date,
    w.state_id,
    count(*) AS upload_count,
    sum(a.size_bytes) AS total_bytes,
    avg(a.size_bytes) AS avg_file_size
   FROM (public.assets a
     JOIN public.workspaces w ON ((w.id = a.workspace_id)))
  WHERE (a.deleted_at IS NULL)
  GROUP BY (date_trunc('day'::text, a.created_at)), w.state_id
  WITH NO DATA;


--
-- Name: mv_revenue_churn; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_revenue_churn AS
 SELECT date_trunc('month'::text, updated_at) AS month,
    state_id,
    count(*) AS churned_count,
    sum(total_paisa) AS churned_mrr_paisa
   FROM public.invoices i
  WHERE (status = ANY (ARRAY['cancelled'::text, 'refunded'::text]))
  GROUP BY (date_trunc('month'::text, updated_at)), state_id
  WITH NO DATA;


--
-- Name: mv_revenue_mrr; Type: MATERIALIZED VIEW; Schema: public; Owner: -
--

CREATE MATERIALIZED VIEW public.mv_revenue_mrr AS
 SELECT date_trunc('month'::text, COALESCE(paid_at, created_at)) AS month,
    state_id,
    sum(total_paisa) AS total_mrr_paisa,
    count(DISTINCT workspace_id) AS subscriber_count
   FROM public.invoices i
  WHERE (status = ANY (ARRAY['paid'::text, 'partially_paid'::text]))
  GROUP BY (date_trunc('month'::text, COALESCE(paid_at, created_at))), state_id
  WITH NO DATA;


--
-- Name: near_duplicate_reviews; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.near_duplicate_reviews (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    burst_group_id uuid,
    primary_asset_id uuid NOT NULL,
    duplicate_asset_id uuid NOT NULL,
    hamming_distance integer NOT NULL,
    decision text,
    reviewed_by uuid,
    reviewed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT near_duplicate_reviews_decision_check CHECK ((decision = ANY (ARRAY['keeper'::text, 'hidden'::text, 'deleted'::text]))),
    CONSTRAINT near_duplicate_reviews_hamming_distance_check CHECK ((hamming_distance >= 0))
);


--
-- Name: notification_preferences; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_preferences (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    category text NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    push_enabled boolean DEFAULT true NOT NULL,
    in_app_enabled boolean DEFAULT true NOT NULL,
    whatsapp_enabled boolean DEFAULT false NOT NULL,
    digest_mode text DEFAULT 'none'::text NOT NULL,
    quiet_hours_start time without time zone,
    quiet_hours_end time without time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notification_prefs_category_check CHECK ((category = ANY (ARRAY['bookings'::text, 'payments'::text, 'gallery_updates'::text, 'team_activity'::text, 'marketing'::text, 'security'::text]))),
    CONSTRAINT notification_prefs_digest_check CHECK ((digest_mode = ANY (ARRAY['none'::text, 'daily'::text, 'weekly'::text])))
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    workspace_id uuid,
    notification_type text NOT NULL,
    title text NOT NULL,
    body text,
    action_url text,
    metadata jsonb DEFAULT '{}'::jsonb,
    channel text DEFAULT 'in_app'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    read_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notifications_channel_check CHECK ((channel = ANY (ARRAY['in_app'::text, 'email'::text, 'whatsapp'::text, 'push'::text])))
);


--
-- Name: otp_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otp_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code character varying(6) NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    attempts integer DEFAULT 0 NOT NULL
);


--
-- Name: payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    invoice_id uuid NOT NULL,
    amount_paisa bigint NOT NULL,
    method text DEFAULT 'cash'::text NOT NULL,
    reference_number text,
    payment_date timestamp with time zone DEFAULT now() NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payments_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'upi'::text, 'bank_transfer'::text, 'card'::text, 'cheque'::text, 'razorpay'::text])))
);


--
-- Name: payouts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payouts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    dealer_id uuid NOT NULL,
    state_id integer,
    period_start date NOT NULL,
    period_end date NOT NULL,
    gross_attributed_revenue bigint DEFAULT 0 NOT NULL,
    commission_earned bigint DEFAULT 0 NOT NULL,
    tds_withheld bigint DEFAULT 0 NOT NULL,
    adjustments bigint DEFAULT 0 NOT NULL,
    net_payable bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    approved_by uuid,
    paid_at timestamp with time zone,
    payment_reference character varying(255),
    margin_ratio_snapshot jsonb DEFAULT '{}'::jsonb NOT NULL,
    line_items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT payouts_status_check CHECK (((status)::text = ANY ((ARRAY['draft'::character varying, 'pending'::character varying, 'approved'::character varying, 'processing'::character varying, 'paid'::character varying, 'failed'::character varying, 'reversed'::character varying])::text[])))
);


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category text NOT NULL,
    key text NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    is_secret boolean DEFAULT false NOT NULL,
    description text,
    updated_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    encrypted_value bytea,
    dek_wrapped bytea
);


--
-- Name: COLUMN platform_settings.encrypted_value; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.encrypted_value IS 'AES-256-GCM ciphertext of the setting value produced by crypto.Envelope. Nullable for non-secret rows and for legacy secret rows that predate F-005 and have not yet been rewritten through the repo.';


--
-- Name: COLUMN platform_settings.dek_wrapped; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON COLUMN public.platform_settings.dek_wrapped IS 'Data Encryption Key wrapped under PLATFORM_SETTINGS_KEK via crypto.Envelope. Always populated when encrypted_value is populated.';


--
-- Name: proofing_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proofing_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    parent_id uuid,
    author_name text NOT NULL,
    author_email text,
    author_user_id uuid,
    body text NOT NULL,
    pin_x numeric(5,2),
    pin_y numeric(5,2),
    is_resolved boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: proofing_selections; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proofing_selections (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    asset_id uuid NOT NULL,
    client_name text NOT NULL,
    client_email text NOT NULL,
    status text DEFAULT 'selected'::text NOT NULL,
    note text DEFAULT ''::text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    session_id uuid,
    star_rating integer,
    color_label text,
    CONSTRAINT chk_star_rating CHECK (((star_rating IS NULL) OR ((star_rating >= 1) AND (star_rating <= 5))))
);


--
-- Name: proofing_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proofing_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text,
    session_type text DEFAULT 'custom'::text NOT NULL,
    created_by_name text,
    created_by_email text,
    is_system boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: pwa_install_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pwa_install_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    visitor_hash text NOT NULL,
    platform text,
    user_agent text,
    installed_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: quality_scores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.quality_scores (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    sharpness numeric(5,3),
    exposure numeric(5,3),
    composition numeric(5,3),
    overall numeric(5,3),
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: refresh_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_sessions (
    token_hash text NOT NULL,
    sub text NOT NULL,
    family_id text NOT NULL,
    workspace_id text DEFAULT ''::text NOT NULL,
    role text DEFAULT ''::text NOT NULL,
    platform_role text DEFAULT ''::text NOT NULL,
    state_id text DEFAULT ''::text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked boolean DEFAULT false NOT NULL,
    used boolean DEFAULT false NOT NULL,
    family_revoked boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    mfa_verified boolean DEFAULT false NOT NULL
);


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    session_id uuid NOT NULL,
    token_hash character varying(255) NOT NULL,
    family uuid NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone,
    replaced_by uuid
);


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying(255) NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    refresh_token_hash character varying(255),
    token_family uuid,
    device_info text,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: share_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.share_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    gallery_id uuid NOT NULL,
    token text NOT NULL,
    pin_hash text,
    expires_at timestamp with time zone,
    permissions jsonb DEFAULT '{}'::jsonb,
    download_allowed boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    revoked_at timestamp with time zone,
    max_access_count integer,
    access_count integer DEFAULT 0 NOT NULL,
    password_hash text
);


--
-- Name: states; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.states (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    code character varying(10) NOT NULL,
    type character varying(20) DEFAULT 'state'::character varying NOT NULL,
    is_union_territory boolean DEFAULT false NOT NULL
);


--
-- Name: states_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.states_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: states_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.states_id_seq OWNED BY public.states.id;


--
-- Name: stream_chats; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stream_chats (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stream_id uuid NOT NULL,
    user_name text NOT NULL,
    user_id uuid,
    message text NOT NULL,
    message_type text DEFAULT 'chat'::text NOT NULL,
    is_muted boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stream_chats_message_type_check CHECK ((message_type = ANY (ARRAY['chat'::text, 'reaction'::text, 'system'::text, 'moderation'::text])))
);


--
-- Name: streams; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.streams (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    gallery_id uuid,
    created_by uuid NOT NULL,
    title text NOT NULL,
    description text,
    status text DEFAULT 'created'::text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    cf_stream_uid text,
    cf_rtmps_url text,
    cf_rtmps_key text,
    cf_playback_url text,
    cf_vod_uid text,
    pin_code text,
    max_quality text DEFAULT '1080p'::text NOT NULL,
    chat_enabled boolean DEFAULT true NOT NULL,
    chat_slow_mode_seconds integer DEFAULT 0 NOT NULL,
    peak_viewers integer DEFAULT 0 NOT NULL,
    total_views integer DEFAULT 0 NOT NULL,
    duration_seconds integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT streams_status_check CHECK ((status = ANY (ARRAY['created'::text, 'scheduled'::text, 'live'::text, 'ended'::text, 'processing_vod'::text, 'vod_ready'::text, 'failed'::text])))
);


--
-- Name: subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid,
    workspace_id uuid,
    state_id integer,
    tier_slug character varying(50),
    amount_paisa bigint DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'active'::character varying NOT NULL,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    cancelled_at timestamp with time zone,
    expires_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT subscriptions_status_check CHECK (((status)::text = ANY ((ARRAY['active'::character varying, 'trialing'::character varying, 'churned'::character varying, 'cancelled'::character varying, 'past_due'::character varying])::text[])))
);


--
-- Name: TABLE subscriptions; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.subscriptions IS 'Subscription records — populated once the billing subsystem lands. Until then the admin revenue dashboard reads from this as an empty set (returns zeros).';


--
-- Name: system_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_name character varying(50) NOT NULL,
    metric_type character varying(30) NOT NULL,
    value double precision NOT NULL,
    unit character varying(20) DEFAULT 'ms'::character varying NOT NULL,
    endpoint character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_metrics_metric_type_check CHECK (((metric_type)::text = ANY ((ARRAY['latency'::character varying, 'latency_p50'::character varying, 'latency_p95'::character varying, 'latency_p99'::character varying, 'error_rate'::character varying, 'queue_depth'::character varying, 'cpu'::character varying, 'memory'::character varying, 'disk'::character varying, 'connections'::character varying])::text[])))
)
PARTITION BY RANGE (recorded_at);


--
-- Name: system_metrics_current; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metrics_current (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_name character varying(50) NOT NULL,
    metric_type character varying(30) NOT NULL,
    value double precision NOT NULL,
    unit character varying(20) DEFAULT 'ms'::character varying NOT NULL,
    endpoint character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_metrics_metric_type_check CHECK (((metric_type)::text = ANY ((ARRAY['latency'::character varying, 'latency_p50'::character varying, 'latency_p95'::character varying, 'latency_p99'::character varying, 'error_rate'::character varying, 'queue_depth'::character varying, 'cpu'::character varying, 'memory'::character varying, 'disk'::character varying, 'connections'::character varying])::text[])))
);


--
-- Name: system_metrics_next; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.system_metrics_next (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_name character varying(50) NOT NULL,
    metric_type character varying(30) NOT NULL,
    value double precision NOT NULL,
    unit character varying(20) DEFAULT 'ms'::character varying NOT NULL,
    endpoint character varying(255),
    metadata jsonb DEFAULT '{}'::jsonb,
    recorded_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT system_metrics_metric_type_check CHECK (((metric_type)::text = ANY ((ARRAY['latency'::character varying, 'latency_p50'::character varying, 'latency_p95'::character varying, 'latency_p99'::character varying, 'error_rate'::character varying, 'queue_depth'::character varying, 'cpu'::character varying, 'memory'::character varying, 'disk'::character varying, 'connections'::character varying])::text[])))
);


--
-- Name: upload_allowlist_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_allowlist_tokens (
    token bytea NOT NULL,
    manifest_hash text NOT NULL,
    workspace_id uuid NOT NULL,
    issued_by uuid NOT NULL,
    justification text NOT NULL,
    issued_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    used_at timestamp with time zone
);


--
-- Name: upload_policy_versions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_policy_versions (
    policy_version text NOT NULL,
    policy_json jsonb NOT NULL,
    published_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    max_age_days integer DEFAULT 90 NOT NULL,
    notes text
);


--
-- Name: upload_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.upload_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    tus_upload_id text NOT NULL,
    filename text NOT NULL,
    content_type text NOT NULL,
    total_size bigint NOT NULL,
    upload_offset bigint DEFAULT 0 NOT NULL,
    chunk_size bigint NOT NULL,
    r2_multipart_upload_id text,
    r2_part_etags jsonb DEFAULT '[]'::jsonb NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    completed_at timestamp with time zone,
    scan_manifest jsonb,
    scan_manifest_verified_at timestamp with time zone,
    CONSTRAINT upload_sessions_total_size_check CHECK ((total_size > 0)),
    CONSTRAINT upload_sessions_upload_offset_check CHECK ((upload_offset >= 0))
);


--
-- Name: user_auth_methods; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_auth_methods (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    provider character varying(50) NOT NULL,
    provider_subject character varying(255) NOT NULL
);


--
-- Name: user_mfa_enrollments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_mfa_enrollments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    totp_secret_ct bytea NOT NULL,
    totp_issuer text NOT NULL,
    enrolled_at timestamp with time zone DEFAULT now() NOT NULL,
    last_verified_at timestamp with time zone,
    disabled_at timestamp with time zone,
    totp_secret_dek_wrapped bytea NOT NULL
);


--
-- Name: user_mfa_recovery_codes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_mfa_recovery_codes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    code_hash text NOT NULL,
    consumed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    business_name character varying(255),
    photographer_type character varying(50),
    city character varying(100),
    pin_code character varying(10),
    gstin character varying(15),
    logo_url text,
    onboarding_step integer DEFAULT 0 NOT NULL
);


--
-- Name: video_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.video_assets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    asset_id uuid NOT NULL,
    workspace_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    duration_seconds integer,
    codec text,
    resolution text,
    file_size_bytes bigint,
    qualities jsonb DEFAULT '[]'::jsonb NOT NULL,
    thumbnail_urls jsonb DEFAULT '[]'::jsonb NOT NULL,
    cf_video_uid text,
    cf_playback_url text,
    error_message text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT video_assets_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'ready'::text, 'failed'::text])))
);


--
-- Name: webhook_deliveries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhook_deliveries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    webhook_id uuid NOT NULL,
    event_type text NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    response_status integer,
    response_body text,
    attempt integer DEFAULT 1 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    error_message text,
    delivered_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: webhooks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.webhooks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    url text NOT NULL,
    secret text NOT NULL,
    events text[] DEFAULT '{}'::text[] NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_members (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_id integer NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_storage; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_storage (
    workspace_id uuid NOT NULL,
    used_bytes bigint DEFAULT 0 NOT NULL,
    derivative_bytes bigint DEFAULT 0 NOT NULL,
    grace_bytes bigint DEFAULT 0 NOT NULL,
    quota_bytes bigint DEFAULT 0 NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: workspace_storage_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.workspace_storage_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    workspace_id uuid NOT NULL,
    driver character varying(20) DEFAULT 's3'::character varying NOT NULL,
    bucket character varying(255) NOT NULL,
    region character varying(50),
    endpoint text,
    encrypted_access_key text NOT NULL,
    encrypted_secret_key text NOT NULL,
    is_active boolean DEFAULT false NOT NULL,
    test_passed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: system_metrics_current; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics ATTACH PARTITION public.system_metrics_current FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');


--
-- Name: system_metrics_next; Type: TABLE ATTACH; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics ATTACH PARTITION public.system_metrics_next FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: states id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.states ALTER COLUMN id SET DEFAULT nextval('public.states_id_seq'::regclass);


--
-- Name: ai_configs ai_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_pkey PRIMARY KEY (id);


--
-- Name: ai_configs ai_configs_workspace_id_provider_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_workspace_id_provider_key UNIQUE (workspace_id, provider);


--
-- Name: ai_jobs ai_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_pkey PRIMARY KEY (id);


--
-- Name: ai_search_queries ai_search_queries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_search_queries
    ADD CONSTRAINT ai_search_queries_pkey PRIMARY KEY (id);


--
-- Name: ai_usage_logs ai_usage_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_pkey PRIMARY KEY (id);


--
-- Name: album_approvals album_approvals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_approvals
    ADD CONSTRAINT album_approvals_pkey PRIMARY KEY (id);


--
-- Name: album_assets album_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_assets
    ADD CONSTRAINT album_assets_pkey PRIMARY KEY (album_id, asset_id);


--
-- Name: albums albums_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.albums
    ADD CONSTRAINT albums_pkey PRIMARY KEY (id);


--
-- Name: alert_thresholds alert_thresholds_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.alert_thresholds
    ADD CONSTRAINT alert_thresholds_pkey PRIMARY KEY (id);


--
-- Name: gallery_analytics_daily analytics_daily_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_analytics_daily
    ADD CONSTRAINT analytics_daily_unique UNIQUE (gallery_id, date);


--
-- Name: api_keys api_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_pkey PRIMARY KEY (id);


--
-- Name: asset_derivatives asset_derivatives_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_derivatives
    ADD CONSTRAINT asset_derivatives_pkey PRIMARY KEY (id);


--
-- Name: assets assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_pkey PRIMARY KEY (id);


--
-- Name: assets assets_storage_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_storage_key_unique UNIQUE (storage_key);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_pkey PRIMARY KEY (id);


--
-- Name: burst_groups burst_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burst_groups
    ADD CONSTRAINT burst_groups_pkey PRIMARY KEY (id);


--
-- Name: channel_members channel_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_pkey PRIMARY KEY (channel_id, user_id);


--
-- Name: channels channels_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_pkey PRIMARY KEY (id);


--
-- Name: client_conversations client_conversations_gallery_id_share_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_conversations
    ADD CONSTRAINT client_conversations_gallery_id_share_token_key UNIQUE (gallery_id, share_token);


--
-- Name: client_conversations client_conversations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_conversations
    ADD CONSTRAINT client_conversations_pkey PRIMARY KEY (id);


--
-- Name: consent_records consent_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_records
    ADD CONSTRAINT consent_records_pkey PRIMARY KEY (id);


--
-- Name: contacts contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_pkey PRIMARY KEY (id);


--
-- Name: content_flags content_flags_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_pkey PRIMARY KEY (id);


--
-- Name: contract_templates contract_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_templates
    ADD CONSTRAINT contract_templates_pkey PRIMARY KEY (id);


--
-- Name: contracts contracts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_pkey PRIMARY KEY (id);


--
-- Name: coupon_redemptions coupon_redemptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_pkey PRIMARY KEY (id);


--
-- Name: coupons coupons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_pkey PRIMARY KEY (id);


--
-- Name: dealer_attributions dealer_attributions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_attributions
    ADD CONSTRAINT dealer_attributions_pkey PRIMARY KEY (id);


--
-- Name: dealers dealers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealers
    ADD CONSTRAINT dealers_pkey PRIMARY KEY (id);


--
-- Name: dealers dealers_referral_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealers
    ADD CONSTRAINT dealers_referral_code_key UNIQUE (referral_code);


--
-- Name: deals deals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_pkey PRIMARY KEY (id);


--
-- Name: desktop_sessions desktop_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sessions
    ADD CONSTRAINT desktop_sessions_pkey PRIMARY KEY (id);


--
-- Name: download_events download_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_events
    ADD CONSTRAINT download_events_pkey PRIMARY KEY (id);


--
-- Name: download_jobs download_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_jobs
    ADD CONSTRAINT download_jobs_pkey PRIMARY KEY (id);


--
-- Name: dsr_requests dsr_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_requests
    ADD CONSTRAINT dsr_requests_pkey PRIMARY KEY (id);


--
-- Name: duplicate_group_members duplicate_group_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_group_members
    ADD CONSTRAINT duplicate_group_members_pkey PRIMARY KEY (id);


--
-- Name: duplicate_groups duplicate_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_groups
    ADD CONSTRAINT duplicate_groups_pkey PRIMARY KEY (id);


--
-- Name: edge_delivery_cache edge_delivery_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edge_delivery_cache
    ADD CONSTRAINT edge_delivery_cache_pkey PRIMARY KEY (id);


--
-- Name: encryption_keys encryption_keys_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encryption_keys
    ADD CONSTRAINT encryption_keys_pkey PRIMARY KEY (id);


--
-- Name: events events_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_no_overlap EXCLUDE USING gist (workspace_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE ((status = 'confirmed'::text));


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_pkey PRIMARY KEY (id);


--
-- Name: face_clusters face_clusters_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_clusters
    ADD CONSTRAINT face_clusters_pkey PRIMARY KEY (id);


--
-- Name: follow_ups follow_ups_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_pkey PRIMARY KEY (id);


--
-- Name: freelancer_listings freelancer_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_listings
    ADD CONSTRAINT freelancer_listings_pkey PRIMARY KEY (id);


--
-- Name: freelancer_reviews freelancer_reviews_booking_id_reviewer_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_reviews
    ADD CONSTRAINT freelancer_reviews_booking_id_reviewer_id_key UNIQUE (booking_id, reviewer_id);


--
-- Name: freelancer_reviews freelancer_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_reviews
    ADD CONSTRAINT freelancer_reviews_pkey PRIMARY KEY (id);


--
-- Name: galleries galleries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.galleries
    ADD CONSTRAINT galleries_pkey PRIMARY KEY (id);


--
-- Name: gallery_access_logs gallery_access_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_access_logs
    ADD CONSTRAINT gallery_access_logs_pkey PRIMARY KEY (id);


--
-- Name: gallery_analytics_daily gallery_analytics_daily_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_analytics_daily
    ADD CONSTRAINT gallery_analytics_daily_pkey PRIMARY KEY (id);


--
-- Name: gallery_analytics_events gallery_analytics_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_analytics_events
    ADD CONSTRAINT gallery_analytics_events_pkey PRIMARY KEY (id);


--
-- Name: gallery_assets gallery_assets_gallery_asset_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_assets
    ADD CONSTRAINT gallery_assets_gallery_asset_unique UNIQUE (gallery_id, asset_id);


--
-- Name: gallery_assets gallery_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_assets
    ADD CONSTRAINT gallery_assets_pkey PRIMARY KEY (id);


--
-- Name: gallery_banners gallery_banners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_banners
    ADD CONSTRAINT gallery_banners_pkey PRIMARY KEY (id);


--
-- Name: gallery_carts gallery_carts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_carts
    ADD CONSTRAINT gallery_carts_pkey PRIMARY KEY (id);


--
-- Name: gallery_carts gallery_carts_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_carts
    ADD CONSTRAINT gallery_carts_unique UNIQUE (gallery_id, client_email);


--
-- Name: gallery_design_templates gallery_design_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_design_templates
    ADD CONSTRAINT gallery_design_templates_pkey PRIMARY KEY (id);


--
-- Name: gallery_orders gallery_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_orders
    ADD CONSTRAINT gallery_orders_pkey PRIMARY KEY (id);


--
-- Name: gallery_products gallery_products_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_products
    ADD CONSTRAINT gallery_products_pkey PRIMARY KEY (id);


--
-- Name: gear_bookings gear_bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_bookings
    ADD CONSTRAINT gear_bookings_pkey PRIMARY KEY (id);


--
-- Name: gear_listings gear_listings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_listings
    ADD CONSTRAINT gear_listings_pkey PRIMARY KEY (id);


--
-- Name: hire_requests hire_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hire_requests
    ADD CONSTRAINT hire_requests_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (id);


--
-- Name: invitations invitations_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_token_unique UNIQUE (token);


--
-- Name: invoices invoices_number_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_number_unique UNIQUE (invoice_number);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: kyc_documents kyc_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_pkey PRIMARY KEY (id);


--
-- Name: leads leads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_pkey PRIMARY KEY (id);


--
-- Name: magic_link_tokens magic_link_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_pkey PRIMARY KEY (id);


--
-- Name: margin_ratios margin_ratios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.margin_ratios
    ADD CONSTRAINT margin_ratios_pkey PRIMARY KEY (id);


--
-- Name: marketplace_inquiries marketplace_inquiries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_inquiries
    ADD CONSTRAINT marketplace_inquiries_pkey PRIMARY KEY (id);


--
-- Name: messages messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);


--
-- Name: moderation_items moderation_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_items
    ADD CONSTRAINT moderation_items_pkey PRIMARY KEY (id);


--
-- Name: moderation_queue moderation_queue_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_queue
    ADD CONSTRAINT moderation_queue_pkey PRIMARY KEY (id);


--
-- Name: moderation_rules moderation_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_rules
    ADD CONSTRAINT moderation_rules_pkey PRIMARY KEY (id);


--
-- Name: near_duplicate_reviews near_duplicate_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_pkey PRIMARY KEY (id);


--
-- Name: near_duplicate_reviews near_duplicate_reviews_primary_asset_id_duplicate_asset_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_primary_asset_id_duplicate_asset_id_key UNIQUE (primary_asset_id, duplicate_asset_id);


--
-- Name: notification_preferences notification_preferences_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_pkey PRIMARY KEY (id);


--
-- Name: notification_preferences notification_prefs_user_category_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_prefs_user_category_unique UNIQUE (user_id, category);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: otp_tokens otp_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_tokens
    ADD CONSTRAINT otp_tokens_pkey PRIMARY KEY (id);


--
-- Name: payments payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_pkey PRIMARY KEY (id);


--
-- Name: payouts payouts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_pkey PRIMARY KEY (id);


--
-- Name: platform_settings platform_settings_category_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_category_key_key UNIQUE (category, key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: proofing_comments proofing_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_comments
    ADD CONSTRAINT proofing_comments_pkey PRIMARY KEY (id);


--
-- Name: proofing_selections proofing_selections_gallery_asset_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_selections
    ADD CONSTRAINT proofing_selections_gallery_asset_email_unique UNIQUE (gallery_id, asset_id, client_email);


--
-- Name: proofing_selections proofing_selections_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_selections
    ADD CONSTRAINT proofing_selections_pkey PRIMARY KEY (id);


--
-- Name: proofing_sessions proofing_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_sessions
    ADD CONSTRAINT proofing_sessions_pkey PRIMARY KEY (id);


--
-- Name: pwa_install_events pwa_install_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pwa_install_events
    ADD CONSTRAINT pwa_install_events_pkey PRIMARY KEY (id);


--
-- Name: quality_scores quality_scores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_scores
    ADD CONSTRAINT quality_scores_pkey PRIMARY KEY (id);


--
-- Name: refresh_sessions refresh_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_sessions
    ADD CONSTRAINT refresh_sessions_pkey PRIMARY KEY (token_hash);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (id);


--
-- Name: roles roles_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_key UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: sessions sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_pkey PRIMARY KEY (id);


--
-- Name: share_links share_links_token_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_token_unique UNIQUE (token);


--
-- Name: states states_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_code_key UNIQUE (code);


--
-- Name: states states_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.states
    ADD CONSTRAINT states_pkey PRIMARY KEY (id);


--
-- Name: stream_chats stream_chats_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chats
    ADD CONSTRAINT stream_chats_pkey PRIMARY KEY (id);


--
-- Name: streams streams_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_pkey PRIMARY KEY (id);


--
-- Name: subscriptions subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_pkey PRIMARY KEY (id);


--
-- Name: system_metrics system_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics
    ADD CONSTRAINT system_metrics_pkey PRIMARY KEY (id, recorded_at);


--
-- Name: system_metrics_current system_metrics_current_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics_current
    ADD CONSTRAINT system_metrics_current_pkey PRIMARY KEY (id, recorded_at);


--
-- Name: system_metrics_next system_metrics_next_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.system_metrics_next
    ADD CONSTRAINT system_metrics_next_pkey PRIMARY KEY (id, recorded_at);


--
-- Name: upload_allowlist_tokens upload_allowlist_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_allowlist_tokens
    ADD CONSTRAINT upload_allowlist_tokens_pkey PRIMARY KEY (token);


--
-- Name: upload_policy_versions upload_policy_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_policy_versions
    ADD CONSTRAINT upload_policy_versions_pkey PRIMARY KEY (policy_version);


--
-- Name: upload_sessions upload_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_pkey PRIMARY KEY (id);


--
-- Name: upload_sessions upload_sessions_tus_upload_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_tus_upload_id_key UNIQUE (tus_upload_id);


--
-- Name: user_auth_methods user_auth_methods_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_auth_methods
    ADD CONSTRAINT user_auth_methods_pkey PRIMARY KEY (id);


--
-- Name: user_mfa_enrollments user_mfa_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_enrollments
    ADD CONSTRAINT user_mfa_enrollments_pkey PRIMARY KEY (id);


--
-- Name: user_mfa_enrollments user_mfa_enrollments_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_enrollments
    ADD CONSTRAINT user_mfa_enrollments_user_id_key UNIQUE (user_id);


--
-- Name: user_mfa_recovery_codes user_mfa_recovery_codes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_recovery_codes
    ADD CONSTRAINT user_mfa_recovery_codes_pkey PRIMARY KEY (id);


--
-- Name: user_profiles user_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_pkey PRIMARY KEY (id);


--
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- Name: users users_phone_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_phone_key UNIQUE (phone);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: video_assets video_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_pkey PRIMARY KEY (id);


--
-- Name: webhook_deliveries webhook_deliveries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_pkey PRIMARY KEY (id);


--
-- Name: webhooks webhooks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_pkey PRIMARY KEY (id);


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_pkey PRIMARY KEY (id);


--
-- Name: workspace_storage_configs workspace_storage_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_storage_configs
    ADD CONSTRAINT workspace_storage_configs_pkey PRIMARY KEY (id);


--
-- Name: workspace_storage workspace_storage_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_storage
    ADD CONSTRAINT workspace_storage_pkey PRIMARY KEY (workspace_id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);


--
-- Name: idx_ai_jobs_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_jobs_pending ON public.ai_jobs USING btree (type, status) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_ai_jobs_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_jobs_workspace ON public.ai_jobs USING btree (workspace_id, created_at DESC);


--
-- Name: idx_ai_search_queries_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_search_queries_gallery ON public.ai_search_queries USING btree (gallery_id, created_at DESC);


--
-- Name: idx_ai_usage_workspace_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_workspace_created ON public.ai_usage_logs USING btree (workspace_id, created_at DESC);


--
-- Name: idx_ai_usage_workspace_operation; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_usage_workspace_operation ON public.ai_usage_logs USING btree (workspace_id, operation);


--
-- Name: idx_album_approvals_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_album_approvals_gallery ON public.album_approvals USING btree (gallery_id);


--
-- Name: idx_albums_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_albums_gallery ON public.albums USING btree (gallery_id);


--
-- Name: idx_albums_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_albums_parent ON public.albums USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_analytics_daily_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_daily_gallery ON public.gallery_analytics_daily USING btree (gallery_id, date DESC);


--
-- Name: idx_analytics_events_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_gallery ON public.gallery_analytics_events USING btree (gallery_id, created_at DESC);


--
-- Name: idx_analytics_events_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_analytics_events_type ON public.gallery_analytics_events USING btree (gallery_id, event_type);


--
-- Name: idx_api_keys_prefix; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_api_keys_prefix ON public.api_keys USING btree (key_prefix) WHERE (is_active = true);


--
-- Name: idx_api_keys_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_api_keys_workspace ON public.api_keys USING btree (workspace_id) WHERE (is_active = true);


--
-- Name: idx_assets_ai_tag_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_ai_tag_status ON public.assets USING btree (ai_tag_status, created_at) WHERE ((deleted_at IS NULL) AND ((ai_tag_status)::text = ANY ((ARRAY['pending'::character varying, 'queued'::character varying])::text[])));


--
-- Name: idx_assets_ai_tags; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_ai_tags ON public.assets USING gin (ai_tags) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_burst_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_burst_group ON public.assets USING btree (burst_group_id) WHERE (burst_group_id IS NOT NULL);


--
-- Name: idx_assets_capture_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_capture_date ON public.assets USING btree (capture_date DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_color_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_color_label ON public.assets USING btree (color_label) WHERE (((color_label)::text <> ''::text) AND (deleted_at IS NULL));


--
-- Name: idx_assets_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_content_type ON public.assets USING btree (workspace_id, content_type) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_embedding_hnsw ON public.assets USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_assets_encrypted; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_encrypted ON public.assets USING btree (is_encrypted) WHERE (is_encrypted = true);


--
-- Name: idx_assets_filename_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_filename_trgm ON public.assets USING gin (filename public.gin_trgm_ops);


--
-- Name: idx_assets_lens; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_lens ON public.assets USING btree (lens_model) WHERE ((lens_model IS NOT NULL) AND (deleted_at IS NULL));


--
-- Name: idx_assets_lifecycle_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_lifecycle_state ON public.assets USING btree (lifecycle_state) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_processing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_processing_status ON public.assets USING btree (processing_status) WHERE (deleted_at IS NULL);


--
-- Name: idx_assets_rating; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_rating ON public.assets USING btree (rating) WHERE ((rating > 0) AND (deleted_at IS NULL));


--
-- Name: idx_assets_scan_status_blocked; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_scan_status_blocked ON public.assets USING btree (workspace_id, upload_scan_status, created_at DESC) WHERE (upload_scan_status = ANY (ARRAY['blocked'::text, 'needs_desktop'::text]));


--
-- Name: idx_assets_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_workspace_id ON public.assets USING btree (workspace_id);


--
-- Name: idx_assets_workspace_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assets_workspace_status ON public.assets USING btree (workspace_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_audit_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_action ON public.audit_logs USING btree (action, created_at DESC);


--
-- Name: idx_audit_logs_actor; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_actor ON public.audit_logs USING btree (actor_id, created_at DESC);


--
-- Name: idx_audit_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_created ON public.audit_logs USING btree (created_at DESC);


--
-- Name: idx_audit_logs_resource; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_resource ON public.audit_logs USING btree (resource_type, resource_id, created_at DESC);


--
-- Name: idx_audit_logs_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_severity ON public.audit_logs USING btree (severity, created_at DESC) WHERE ((severity)::text <> 'info'::text);


--
-- Name: idx_audit_logs_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_audit_logs_workspace ON public.audit_logs USING btree (workspace_id, created_at DESC);


--
-- Name: idx_burst_groups_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_burst_groups_gallery ON public.burst_groups USING btree (gallery_id);


--
-- Name: idx_channel_members_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channel_members_user ON public.channel_members USING btree (user_id);


--
-- Name: idx_channels_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channels_type ON public.channels USING btree (workspace_id, channel_type);


--
-- Name: idx_channels_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_channels_workspace ON public.channels USING btree (workspace_id);


--
-- Name: idx_client_conversations_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_conversations_gallery ON public.client_conversations USING btree (gallery_id);


--
-- Name: idx_client_conversations_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_client_conversations_workspace ON public.client_conversations USING btree (workspace_id);


--
-- Name: idx_consent_records_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_records_email ON public.consent_records USING btree (visitor_email);


--
-- Name: idx_consent_records_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_records_gallery ON public.consent_records USING btree (gallery_id);


--
-- Name: idx_consent_records_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_consent_records_lookup ON public.consent_records USING btree (gallery_id, visitor_email, consent_type, created_at DESC);


--
-- Name: idx_contacts_tags_gin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_tags_gin ON public.contacts USING gin (tags);


--
-- Name: idx_contacts_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_user_id ON public.contacts USING btree (user_id);


--
-- Name: idx_contacts_workspace_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_workspace_email ON public.contacts USING btree (workspace_id, email);


--
-- Name: idx_contacts_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contacts_workspace_id ON public.contacts USING btree (workspace_id);


--
-- Name: idx_content_flags_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_flags_gallery ON public.content_flags USING btree (gallery_id);


--
-- Name: idx_content_flags_pending_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_flags_pending_created ON public.content_flags USING btree (created_at DESC) WHERE (status = 'pending'::text);


--
-- Name: idx_content_flags_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_content_flags_status ON public.content_flags USING btree (status) WHERE (status = 'pending'::text);


--
-- Name: idx_contract_templates_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contract_templates_workspace_id ON public.contract_templates USING btree (workspace_id);


--
-- Name: idx_contracts_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_contact_id ON public.contracts USING btree (contact_id);


--
-- Name: idx_contracts_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_workspace_id ON public.contracts USING btree (workspace_id);


--
-- Name: idx_contracts_workspace_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_contracts_workspace_status ON public.contracts USING btree (workspace_id, status);


--
-- Name: idx_coupon_redemptions_coupon_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_coupon_user ON public.coupon_redemptions USING btree (coupon_id, user_id);


--
-- Name: idx_coupon_redemptions_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_state ON public.coupon_redemptions USING btree (state_id);


--
-- Name: idx_coupon_redemptions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupon_redemptions_workspace ON public.coupon_redemptions USING btree (workspace_id);


--
-- Name: idx_coupons_code_upper; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_coupons_code_upper ON public.coupons USING btree (upper((code)::text));


--
-- Name: idx_coupons_dealer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_dealer_id ON public.coupons USING btree (dealer_id) WHERE (dealer_id IS NOT NULL);


--
-- Name: idx_coupons_scope_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_scope_state ON public.coupons USING btree (scope_state_id);


--
-- Name: idx_coupons_valid_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_coupons_valid_active ON public.coupons USING btree (valid_from, valid_until) WHERE (is_active = true);


--
-- Name: idx_dealer_attributions_dealer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealer_attributions_dealer_id ON public.dealer_attributions USING btree (dealer_id);


--
-- Name: idx_dealer_attributions_state_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealer_attributions_state_id ON public.dealer_attributions USING btree (state_id);


--
-- Name: idx_dealer_attributions_workspace_current; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealer_attributions_workspace_current ON public.dealer_attributions USING btree (workspace_id) WHERE (is_current = true);


--
-- Name: idx_dealers_referral_code; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealers_referral_code ON public.dealers USING btree (referral_code) WHERE (referral_code IS NOT NULL);


--
-- Name: idx_dealers_state_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealers_state_id ON public.dealers USING btree (state_id);


--
-- Name: idx_dealers_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dealers_status ON public.dealers USING btree (status);


--
-- Name: idx_dealers_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_dealers_user_id ON public.dealers USING btree (user_id);


--
-- Name: idx_deals_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_contact_id ON public.deals USING btree (contact_id);


--
-- Name: idx_deals_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_workspace_id ON public.deals USING btree (workspace_id);


--
-- Name: idx_deals_workspace_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_deals_workspace_stage ON public.deals USING btree (workspace_id, stage);


--
-- Name: idx_derivatives_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_derivatives_asset ON public.asset_derivatives USING btree (asset_id);


--
-- Name: idx_derivatives_asset_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_derivatives_asset_variant ON public.asset_derivatives USING btree (asset_id, variant);


--
-- Name: idx_design_templates_default; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_templates_default ON public.gallery_design_templates USING btree (workspace_id, is_default) WHERE ((deleted_at IS NULL) AND (is_default = true));


--
-- Name: idx_design_templates_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_design_templates_workspace ON public.gallery_design_templates USING btree (workspace_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_desktop_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desktop_sessions_active ON public.desktop_sessions USING btree (user_id, is_active) WHERE (is_active = true);


--
-- Name: idx_desktop_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desktop_sessions_user ON public.desktop_sessions USING btree (user_id);


--
-- Name: idx_desktop_sessions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_desktop_sessions_workspace ON public.desktop_sessions USING btree (workspace_id);


--
-- Name: idx_download_events_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_download_events_asset ON public.download_events USING btree (asset_id);


--
-- Name: idx_download_events_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_download_events_gallery ON public.download_events USING btree (gallery_id);


--
-- Name: idx_download_jobs_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_download_jobs_gallery ON public.download_jobs USING btree (gallery_id);


--
-- Name: idx_download_jobs_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_download_jobs_status ON public.download_jobs USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_dsr_requests_status_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_status_requested ON public.dsr_requests USING btree (status, requested_at) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_dsr_requests_subject_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dsr_requests_subject_email ON public.dsr_requests USING btree (subject_email, requested_at DESC);


--
-- Name: idx_dup_members_group; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_dup_members_group ON public.duplicate_group_members USING btree (group_id);


--
-- Name: idx_duplicate_groups_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_duplicate_groups_workspace ON public.duplicate_groups USING btree (workspace_id, status);


--
-- Name: idx_edge_cache_asset_variant; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_edge_cache_asset_variant ON public.edge_delivery_cache USING btree (asset_id, variant);


--
-- Name: idx_encryption_keys_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_encryption_keys_workspace ON public.encryption_keys USING btree (workspace_id, key_version DESC);


--
-- Name: idx_events_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_contact_id ON public.events USING btree (contact_id);


--
-- Name: idx_events_deal_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_deal_id ON public.events USING btree (deal_id);


--
-- Name: idx_events_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_workspace_id ON public.events USING btree (workspace_id);


--
-- Name: idx_events_workspace_range; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_events_workspace_range ON public.events USING btree (workspace_id, start_at, end_at);


--
-- Name: idx_face_clusters_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_clusters_asset ON public.face_clusters USING btree (asset_id);


--
-- Name: idx_face_clusters_cluster_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_clusters_cluster_label ON public.face_clusters USING btree (workspace_id, cluster_label) WHERE (cluster_label IS NOT NULL);


--
-- Name: idx_face_clusters_embedding_hnsw; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_clusters_embedding_hnsw ON public.face_clusters USING hnsw (embedding public.vector_cosine_ops) WITH (m='16', ef_construction='64');


--
-- Name: idx_face_clusters_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_clusters_gallery ON public.face_clusters USING btree (gallery_id) WHERE (gallery_id IS NOT NULL);


--
-- Name: idx_face_clusters_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_face_clusters_workspace ON public.face_clusters USING btree (workspace_id);


--
-- Name: idx_follow_ups_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_assigned_to ON public.follow_ups USING btree (assigned_to) WHERE (status = 'pending'::text);


--
-- Name: idx_follow_ups_due_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_due_at ON public.follow_ups USING btree (workspace_id, due_at) WHERE (status = 'pending'::text);


--
-- Name: idx_follow_ups_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_follow_ups_workspace_id ON public.follow_ups USING btree (workspace_id);


--
-- Name: idx_freelancer_listings_specializations; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_listings_specializations ON public.freelancer_listings USING gin (specializations);


--
-- Name: idx_freelancer_listings_state_city; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_listings_state_city ON public.freelancer_listings USING btree (state_id, city) WHERE (is_published = true);


--
-- Name: idx_freelancer_listings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_listings_user ON public.freelancer_listings USING btree (user_id);


--
-- Name: idx_freelancer_listings_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_listings_workspace ON public.freelancer_listings USING btree (workspace_id);


--
-- Name: idx_freelancer_reviews_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_reviews_listing ON public.freelancer_reviews USING btree (listing_id);


--
-- Name: idx_freelancer_reviews_reviewer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_freelancer_reviews_reviewer ON public.freelancer_reviews USING btree (reviewer_id);


--
-- Name: idx_galleries_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_galleries_expires ON public.galleries USING btree (expires_at) WHERE ((expires_at IS NOT NULL) AND ((gallery_state)::text = 'shared'::text));


--
-- Name: idx_galleries_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_galleries_state ON public.galleries USING btree (gallery_state) WHERE (deleted_at IS NULL);


--
-- Name: idx_galleries_workspace_id_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_galleries_workspace_id_active ON public.galleries USING btree (workspace_id) WHERE (deleted_at IS NULL);


--
-- Name: idx_galleries_workspace_slug; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_galleries_workspace_slug ON public.galleries USING btree (workspace_id, slug);


--
-- Name: idx_galleries_workspace_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_galleries_workspace_status ON public.galleries USING btree (workspace_id, status) WHERE (deleted_at IS NULL);


--
-- Name: idx_gallery_access_logs_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_access_logs_created ON public.gallery_access_logs USING btree (gallery_id, created_at DESC);


--
-- Name: idx_gallery_access_logs_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_access_logs_gallery ON public.gallery_access_logs USING btree (gallery_id);


--
-- Name: idx_gallery_assets_asset_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_assets_asset_id ON public.gallery_assets USING btree (asset_id);


--
-- Name: idx_gallery_assets_gallery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_assets_gallery_id ON public.gallery_assets USING btree (gallery_id);


--
-- Name: idx_gallery_banners_gallery_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_banners_gallery_active ON public.gallery_banners USING btree (gallery_id) WHERE (is_active = true);


--
-- Name: idx_gallery_banners_schedule; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_banners_schedule ON public.gallery_banners USING btree (active_from, active_until) WHERE (is_active = true);


--
-- Name: idx_gallery_orders_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_orders_gallery ON public.gallery_orders USING btree (gallery_id);


--
-- Name: idx_gallery_orders_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_orders_workspace ON public.gallery_orders USING btree (workspace_id);


--
-- Name: idx_gallery_products_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gallery_products_gallery ON public.gallery_products USING btree (gallery_id) WHERE (is_active = true);


--
-- Name: idx_gear_bookings_dates; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_bookings_dates ON public.gear_bookings USING btree (gear_listing_id, start_date, end_date) WHERE ((status)::text = ANY ((ARRAY['pending'::character varying, 'approved'::character varying, 'active'::character varying])::text[]));


--
-- Name: idx_gear_bookings_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_bookings_listing ON public.gear_bookings USING btree (gear_listing_id);


--
-- Name: idx_gear_bookings_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_bookings_owner ON public.gear_bookings USING btree (owner_id, created_at DESC);


--
-- Name: idx_gear_bookings_renter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_bookings_renter ON public.gear_bookings USING btree (renter_id, created_at DESC);


--
-- Name: idx_gear_listings_category_brand; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_listings_category_brand ON public.gear_listings USING btree (category, brand);


--
-- Name: idx_gear_listings_state_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_listings_state_type ON public.gear_listings USING btree (state_id, listing_type) WHERE (is_published = true);


--
-- Name: idx_gear_listings_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_listings_user ON public.gear_listings USING btree (user_id);


--
-- Name: idx_gear_listings_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_gear_listings_workspace ON public.gear_listings USING btree (workspace_id);


--
-- Name: idx_hire_requests_freelancer; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hire_requests_freelancer ON public.hire_requests USING btree (freelancer_id, created_at DESC);


--
-- Name: idx_hire_requests_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hire_requests_listing ON public.hire_requests USING btree (listing_id);


--
-- Name: idx_hire_requests_requester; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_hire_requests_requester ON public.hire_requests USING btree (requester_id, created_at DESC);


--
-- Name: idx_invitations_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_token ON public.invitations USING btree (token) WHERE (revoked = false);


--
-- Name: idx_invitations_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invitations_workspace_id ON public.invitations USING btree (workspace_id);


--
-- Name: idx_invoices_contact_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_contact_id ON public.invoices USING btree (contact_id);


--
-- Name: idx_invoices_paid_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_paid_at ON public.invoices USING btree (paid_at) WHERE (paid_at IS NOT NULL);


--
-- Name: idx_invoices_state_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_state_id ON public.invoices USING btree (state_id);


--
-- Name: idx_invoices_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_workspace_id ON public.invoices USING btree (workspace_id);


--
-- Name: idx_invoices_workspace_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_invoices_workspace_status ON public.invoices USING btree (workspace_id, status);


--
-- Name: idx_kyc_documents_dealer_uploaded; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_documents_dealer_uploaded ON public.kyc_documents USING btree (dealer_id, uploaded_at DESC);


--
-- Name: idx_kyc_documents_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_kyc_documents_status ON public.kyc_documents USING btree (status);


--
-- Name: idx_leads_assigned_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_assigned_to ON public.leads USING btree (assigned_to);


--
-- Name: idx_leads_event_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_event_date ON public.leads USING btree (workspace_id, event_date);


--
-- Name: idx_leads_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_workspace_id ON public.leads USING btree (workspace_id);


--
-- Name: idx_leads_workspace_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_leads_workspace_stage ON public.leads USING btree (workspace_id, stage);


--
-- Name: idx_margin_ratios_effective; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_margin_ratios_effective ON public.margin_ratios USING btree (effective_from, effective_until);


--
-- Name: idx_margin_ratios_state_plan; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_margin_ratios_state_plan ON public.margin_ratios USING btree (state_id, plan_id, product_type, effective_from);


--
-- Name: idx_marketplace_inquiries_from; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_inquiries_from ON public.marketplace_inquiries USING btree (from_user_id, created_at DESC);


--
-- Name: idx_marketplace_inquiries_listing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_inquiries_listing ON public.marketplace_inquiries USING btree (listing_id);


--
-- Name: idx_marketplace_inquiries_to; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_marketplace_inquiries_to ON public.marketplace_inquiries USING btree (to_user_id, created_at DESC);


--
-- Name: idx_messages_channel; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_channel ON public.messages USING btree (channel_id, inserted_at DESC);


--
-- Name: idx_messages_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_parent ON public.messages USING btree (parent_message_id) WHERE (parent_message_id IS NOT NULL);


--
-- Name: idx_messages_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_search ON public.messages USING gin (search_vector);


--
-- Name: idx_messages_sender; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_sender ON public.messages USING btree (sender_id);


--
-- Name: idx_messages_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_messages_workspace ON public.messages USING btree (workspace_id);


--
-- Name: idx_moderation_items_queue; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_items_queue ON public.moderation_items USING btree (status, sla_deadline) WHERE ((status)::text = 'pending'::text);


--
-- Name: idx_moderation_items_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_items_type ON public.moderation_items USING btree (content_type, status);


--
-- Name: idx_moderation_items_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_items_workspace ON public.moderation_items USING btree (workspace_id, created_at DESC);


--
-- Name: idx_moderation_queue_content; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_queue_content ON public.moderation_queue USING btree (content_type, content_id);


--
-- Name: idx_moderation_queue_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_queue_status ON public.moderation_queue USING btree (status, created_at DESC);


--
-- Name: idx_moderation_queue_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_queue_workspace ON public.moderation_queue USING btree (workspace_id);


--
-- Name: idx_moderation_rules_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_moderation_rules_type ON public.moderation_rules USING btree (content_type) WHERE (is_active = true);


--
-- Name: idx_mv_admin_platform_stats; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_admin_platform_stats ON public.mv_admin_platform_stats USING btree (refreshed_at);


--
-- Name: idx_mv_bi_daily_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_bi_daily_active ON public.mv_bi_daily_active USING btree (activity_date, state_id, platform_role);


--
-- Name: idx_mv_bi_uploads; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_bi_uploads ON public.mv_bi_uploads USING btree (upload_date, state_id);


--
-- Name: idx_mv_revenue_churn; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_revenue_churn ON public.mv_revenue_churn USING btree (month, state_id);


--
-- Name: idx_mv_revenue_mrr; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_mv_revenue_mrr ON public.mv_revenue_mrr USING btree (month, state_id);


--
-- Name: idx_near_dupes_gallery_pending; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_near_dupes_gallery_pending ON public.near_duplicate_reviews USING btree (gallery_id) WHERE (decision IS NULL);


--
-- Name: idx_notification_prefs_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notification_prefs_user_id ON public.notification_preferences USING btree (user_id);


--
-- Name: idx_notifications_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_id ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.notifications USING btree (user_id, created_at DESC) WHERE (is_read = false);


--
-- Name: idx_notifications_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_workspace_id ON public.notifications USING btree (workspace_id);


--
-- Name: idx_payments_invoice_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_invoice_id ON public.payments USING btree (invoice_id);


--
-- Name: idx_payments_workspace_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payments_workspace_id ON public.payments USING btree (workspace_id);


--
-- Name: idx_payouts_dealer_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_dealer_id ON public.payouts USING btree (dealer_id);


--
-- Name: idx_payouts_dealer_period; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_payouts_dealer_period ON public.payouts USING btree (dealer_id, period_start, period_end);


--
-- Name: idx_payouts_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_state ON public.payouts USING btree (state_id);


--
-- Name: idx_payouts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_payouts_status ON public.payouts USING btree (status);


--
-- Name: idx_platform_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_settings_category ON public.platform_settings USING btree (category);


--
-- Name: idx_proofing_comments_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proofing_comments_asset ON public.proofing_comments USING btree (gallery_id, asset_id);


--
-- Name: idx_proofing_comments_parent; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proofing_comments_parent ON public.proofing_comments USING btree (parent_id) WHERE (parent_id IS NOT NULL);


--
-- Name: idx_proofing_selections_client_email; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proofing_selections_client_email ON public.proofing_selections USING btree (gallery_id, client_email);


--
-- Name: idx_proofing_selections_gallery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proofing_selections_gallery_id ON public.proofing_selections USING btree (gallery_id);


--
-- Name: idx_proofing_sessions_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_proofing_sessions_gallery ON public.proofing_sessions USING btree (gallery_id);


--
-- Name: idx_pwa_installs_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_pwa_installs_gallery ON public.pwa_install_events USING btree (gallery_id, installed_at DESC);


--
-- Name: idx_quality_scores_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_quality_scores_asset ON public.quality_scores USING btree (asset_id);


--
-- Name: idx_refresh_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_sessions_expires ON public.refresh_sessions USING btree (expires_at) WHERE ((revoked = false) AND (family_revoked = false));


--
-- Name: idx_refresh_sessions_family; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_sessions_family ON public.refresh_sessions USING btree (family_id);


--
-- Name: idx_refresh_sessions_sub; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_sessions_sub ON public.refresh_sessions USING btree (sub) WHERE ((revoked = false) AND (family_revoked = false));


--
-- Name: idx_share_links_gallery_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_gallery_id ON public.share_links USING btree (gallery_id);


--
-- Name: idx_share_links_token; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_share_links_token ON public.share_links USING btree (token) WHERE (revoked_at IS NULL);


--
-- Name: idx_stream_chats_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stream_chats_created ON public.stream_chats USING btree (stream_id, created_at);


--
-- Name: idx_stream_chats_stream; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stream_chats_stream ON public.stream_chats USING btree (stream_id);


--
-- Name: idx_streams_created_by; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streams_created_by ON public.streams USING btree (created_by);


--
-- Name: idx_streams_gallery; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streams_gallery ON public.streams USING btree (gallery_id);


--
-- Name: idx_streams_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streams_status ON public.streams USING btree (status) WHERE (status = ANY (ARRAY['live'::text, 'scheduled'::text]));


--
-- Name: idx_streams_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_streams_workspace ON public.streams USING btree (workspace_id);


--
-- Name: idx_subscriptions_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_status_created ON public.subscriptions USING btree (status, created_at DESC);


--
-- Name: idx_subscriptions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_user ON public.subscriptions USING btree (user_id, status);


--
-- Name: idx_subscriptions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_subscriptions_workspace ON public.subscriptions USING btree (workspace_id, status);


--
-- Name: idx_system_metrics_service; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_metrics_service ON ONLY public.system_metrics USING btree (service_name, recorded_at DESC);


--
-- Name: idx_system_metrics_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_system_metrics_type ON ONLY public.system_metrics USING btree (metric_type, recorded_at DESC);


--
-- Name: idx_upload_allowlist_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_allowlist_tokens_expires_at ON public.upload_allowlist_tokens USING btree (expires_at) WHERE (used_at IS NULL);


--
-- Name: idx_upload_allowlist_tokens_hash_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_allowlist_tokens_hash_active ON public.upload_allowlist_tokens USING btree (manifest_hash) WHERE (used_at IS NULL);


--
-- Name: idx_upload_policy_versions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_policy_versions_active ON public.upload_policy_versions USING btree (policy_version) WHERE (revoked_at IS NULL);


--
-- Name: idx_upload_sessions_expires; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_expires ON public.upload_sessions USING btree (expires_at) WHERE (completed_at IS NULL);


--
-- Name: idx_upload_sessions_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_user ON public.upload_sessions USING btree (user_id);


--
-- Name: idx_upload_sessions_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_upload_sessions_workspace ON public.upload_sessions USING btree (workspace_id);


--
-- Name: idx_user_mfa_recovery_codes_user; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_mfa_recovery_codes_user ON public.user_mfa_recovery_codes USING btree (user_id) WHERE (consumed_at IS NULL);


--
-- Name: idx_users_admin_filter; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_admin_filter ON public.users USING btree (state_id, onboarding_step, created_at DESC);


--
-- Name: idx_users_admin_search; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_admin_search ON public.users USING gin (to_tsvector('english'::regconfig, (((((COALESCE(display_name, ''::character varying))::text || ' '::text) || (COALESCE(email, ''::character varying))::text) || ' '::text) || (COALESCE(phone, ''::character varying))::text)));


--
-- Name: idx_users_last_login; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_last_login ON public.users USING btree (last_login_at DESC NULLS LAST);


--
-- Name: idx_users_platform_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_platform_role ON public.users USING btree (platform_role);


--
-- Name: idx_users_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_users_status_created ON public.users USING btree (status, created_at DESC) WHERE ((status)::text <> 'deleted'::text);


--
-- Name: idx_video_assets_asset; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_assets_asset ON public.video_assets USING btree (asset_id);


--
-- Name: idx_video_assets_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_assets_status ON public.video_assets USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'processing'::text]));


--
-- Name: idx_video_assets_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_video_assets_workspace ON public.video_assets USING btree (workspace_id);


--
-- Name: idx_webhook_deliveries_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_status ON public.webhook_deliveries USING btree (status) WHERE (status = ANY (ARRAY['pending'::text, 'failed'::text]));


--
-- Name: idx_webhook_deliveries_webhook; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhook_deliveries_webhook ON public.webhook_deliveries USING btree (webhook_id, created_at DESC);


--
-- Name: idx_webhooks_workspace; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_webhooks_workspace ON public.webhooks USING btree (workspace_id) WHERE (is_active = true);


--
-- Name: idx_workspace_storage_configs_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_workspace_storage_configs_active ON public.workspace_storage_configs USING btree (workspace_id) WHERE (is_active = true);


--
-- Name: idx_workspace_storage_used; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspace_storage_used ON public.workspace_storage USING btree (used_bytes);


--
-- Name: idx_workspaces_plan_tier; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspaces_plan_tier ON public.workspaces USING btree (plan_tier);


--
-- Name: idx_workspaces_status_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspaces_status_active ON public.workspaces USING btree (status, created_at DESC) WHERE (deleted_at IS NULL);


--
-- Name: idx_workspaces_upload_policy_mode; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_workspaces_upload_policy_mode ON public.workspaces USING btree (upload_policy_mode) WHERE (upload_policy_mode <> 'standard'::text);


--
-- Name: system_metrics_current_metric_type_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_metrics_current_metric_type_recorded_at_idx ON public.system_metrics_current USING btree (metric_type, recorded_at DESC);


--
-- Name: system_metrics_current_service_name_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_metrics_current_service_name_recorded_at_idx ON public.system_metrics_current USING btree (service_name, recorded_at DESC);


--
-- Name: system_metrics_next_metric_type_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_metrics_next_metric_type_recorded_at_idx ON public.system_metrics_next USING btree (metric_type, recorded_at DESC);


--
-- Name: system_metrics_next_service_name_recorded_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX system_metrics_next_service_name_recorded_at_idx ON public.system_metrics_next USING btree (service_name, recorded_at DESC);


--
-- Name: system_metrics_current_metric_type_recorded_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_system_metrics_type ATTACH PARTITION public.system_metrics_current_metric_type_recorded_at_idx;


--
-- Name: system_metrics_current_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_metrics_pkey ATTACH PARTITION public.system_metrics_current_pkey;


--
-- Name: system_metrics_current_service_name_recorded_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_system_metrics_service ATTACH PARTITION public.system_metrics_current_service_name_recorded_at_idx;


--
-- Name: system_metrics_next_metric_type_recorded_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_system_metrics_type ATTACH PARTITION public.system_metrics_next_metric_type_recorded_at_idx;


--
-- Name: system_metrics_next_pkey; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.system_metrics_pkey ATTACH PARTITION public.system_metrics_next_pkey;


--
-- Name: system_metrics_next_service_name_recorded_at_idx; Type: INDEX ATTACH; Schema: public; Owner: -
--

ALTER INDEX public.idx_system_metrics_service ATTACH PARTITION public.system_metrics_next_service_name_recorded_at_idx;


--
-- Name: audit_logs audit_logs_no_delete; Type: RULE; Schema: public; Owner: -
--

CREATE RULE audit_logs_no_delete AS
    ON DELETE TO public.audit_logs DO INSTEAD NOTHING;


--
-- Name: audit_logs audit_logs_no_update; Type: RULE; Schema: public; Owner: -
--

CREATE RULE audit_logs_no_update AS
    ON UPDATE TO public.audit_logs DO INSTEAD NOTHING;


--
-- Name: audit_log audit_log_prevent_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_prevent_delete BEFORE DELETE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();


--
-- Name: audit_log audit_log_prevent_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_log_prevent_update BEFORE UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_log_modification();


--
-- Name: gallery_access_logs trg_access_logs_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_access_logs_no_update BEFORE DELETE OR UPDATE ON public.gallery_access_logs FOR EACH ROW EXECUTE FUNCTION public.prevent_access_log_mutation();


--
-- Name: album_approvals trg_album_approvals_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_album_approvals_no_update BEFORE DELETE OR UPDATE ON public.album_approvals FOR EACH ROW EXECUTE FUNCTION public.prevent_album_approval_mutation();


--
-- Name: gallery_access_logs trg_gallery_access_logs_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_gallery_access_logs_no_update BEFORE DELETE OR UPDATE ON public.gallery_access_logs FOR EACH ROW EXECUTE FUNCTION public.enforce_audit_log_append_only();


--
-- Name: ai_configs ai_configs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_configs
    ADD CONSTRAINT ai_configs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_jobs ai_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_jobs
    ADD CONSTRAINT ai_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_search_queries ai_search_queries_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_search_queries
    ADD CONSTRAINT ai_search_queries_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: ai_search_queries ai_search_queries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_search_queries
    ADD CONSTRAINT ai_search_queries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: ai_usage_logs ai_usage_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_usage_logs
    ADD CONSTRAINT ai_usage_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: album_approvals album_approvals_approved_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_approvals
    ADD CONSTRAINT album_approvals_approved_by_user_id_fkey FOREIGN KEY (approved_by_user_id) REFERENCES public.users(id);


--
-- Name: album_approvals album_approvals_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_approvals
    ADD CONSTRAINT album_approvals_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: album_approvals album_approvals_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_approvals
    ADD CONSTRAINT album_approvals_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.proofing_sessions(id);


--
-- Name: album_assets album_assets_album_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_assets
    ADD CONSTRAINT album_assets_album_id_fkey FOREIGN KEY (album_id) REFERENCES public.albums(id) ON DELETE CASCADE;


--
-- Name: album_assets album_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.album_assets
    ADD CONSTRAINT album_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: albums albums_cover_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.albums
    ADD CONSTRAINT albums_cover_asset_id_fkey FOREIGN KEY (cover_asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: albums albums_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.albums
    ADD CONSTRAINT albums_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: albums albums_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.albums
    ADD CONSTRAINT albums_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.albums(id) ON DELETE CASCADE;


--
-- Name: api_keys api_keys_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: api_keys api_keys_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_keys
    ADD CONSTRAINT api_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: asset_derivatives asset_derivatives_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.asset_derivatives
    ADD CONSTRAINT asset_derivatives_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: assets assets_encryption_key_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_encryption_key_id_fkey FOREIGN KEY (encryption_key_id) REFERENCES public.encryption_keys(id);


--
-- Name: assets assets_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id);


--
-- Name: assets assets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assets
    ADD CONSTRAINT assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: audit_logs audit_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_logs
    ADD CONSTRAINT audit_logs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE SET NULL;


--
-- Name: burst_groups burst_groups_best_pick_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burst_groups
    ADD CONSTRAINT burst_groups_best_pick_id_fkey FOREIGN KEY (best_pick_id) REFERENCES public.assets(id);


--
-- Name: burst_groups burst_groups_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.burst_groups
    ADD CONSTRAINT burst_groups_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: channel_members channel_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channel_members
    ADD CONSTRAINT channel_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channels channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: channels channels_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.channels
    ADD CONSTRAINT channels_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: client_conversations client_conversations_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_conversations
    ADD CONSTRAINT client_conversations_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: client_conversations client_conversations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_conversations
    ADD CONSTRAINT client_conversations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: consent_records consent_records_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.consent_records
    ADD CONSTRAINT consent_records_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: contacts contacts_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: contacts contacts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contacts
    ADD CONSTRAINT contacts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: content_flags content_flags_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: content_flags content_flags_flagged_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_flagged_by_user_id_fkey FOREIGN KEY (flagged_by_user_id) REFERENCES public.users(id);


--
-- Name: content_flags content_flags_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: content_flags content_flags_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_flags
    ADD CONSTRAINT content_flags_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: contract_templates contract_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contract_templates
    ADD CONSTRAINT contract_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: contracts contracts_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: contracts contracts_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.contract_templates(id);


--
-- Name: contracts contracts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.contracts
    ADD CONSTRAINT contracts_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: coupon_redemptions coupon_redemptions_coupon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_coupon_id_fkey FOREIGN KEY (coupon_id) REFERENCES public.coupons(id);


--
-- Name: coupon_redemptions coupon_redemptions_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: coupon_redemptions coupon_redemptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: coupon_redemptions coupon_redemptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupon_redemptions
    ADD CONSTRAINT coupon_redemptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: coupons coupons_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: coupons coupons_dealer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id);


--
-- Name: coupons coupons_scope_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.coupons
    ADD CONSTRAINT coupons_scope_state_id_fkey FOREIGN KEY (scope_state_id) REFERENCES public.states(id);


--
-- Name: dealer_attributions dealer_attributions_attributed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_attributions
    ADD CONSTRAINT dealer_attributions_attributed_by_fkey FOREIGN KEY (attributed_by) REFERENCES public.users(id);


--
-- Name: dealer_attributions dealer_attributions_dealer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_attributions
    ADD CONSTRAINT dealer_attributions_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;


--
-- Name: dealer_attributions dealer_attributions_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_attributions
    ADD CONSTRAINT dealer_attributions_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: dealer_attributions dealer_attributions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealer_attributions
    ADD CONSTRAINT dealer_attributions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: dealers dealers_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealers
    ADD CONSTRAINT dealers_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: dealers dealers_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealers
    ADD CONSTRAINT dealers_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: dealers dealers_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dealers
    ADD CONSTRAINT dealers_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: deals deals_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: deals deals_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deals
    ADD CONSTRAINT deals_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: desktop_sessions desktop_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sessions
    ADD CONSTRAINT desktop_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: desktop_sessions desktop_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.desktop_sessions
    ADD CONSTRAINT desktop_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: download_events download_events_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_events
    ADD CONSTRAINT download_events_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE SET NULL;


--
-- Name: download_events download_events_download_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_events
    ADD CONSTRAINT download_events_download_job_id_fkey FOREIGN KEY (download_job_id) REFERENCES public.download_jobs(id);


--
-- Name: download_events download_events_downloader_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_events
    ADD CONSTRAINT download_events_downloader_user_id_fkey FOREIGN KEY (downloader_user_id) REFERENCES public.users(id);


--
-- Name: download_events download_events_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_events
    ADD CONSTRAINT download_events_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: download_jobs download_jobs_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_jobs
    ADD CONSTRAINT download_jobs_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: download_jobs download_jobs_requested_by_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_jobs
    ADD CONSTRAINT download_jobs_requested_by_user_id_fkey FOREIGN KEY (requested_by_user_id) REFERENCES public.users(id);


--
-- Name: download_jobs download_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_jobs
    ADD CONSTRAINT download_jobs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: dsr_requests dsr_requests_subject_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.dsr_requests
    ADD CONSTRAINT dsr_requests_subject_user_id_fkey FOREIGN KEY (subject_user_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: duplicate_group_members duplicate_group_members_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_group_members
    ADD CONSTRAINT duplicate_group_members_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: duplicate_group_members duplicate_group_members_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_group_members
    ADD CONSTRAINT duplicate_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.duplicate_groups(id) ON DELETE CASCADE;


--
-- Name: duplicate_groups duplicate_groups_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_groups
    ADD CONSTRAINT duplicate_groups_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE SET NULL;


--
-- Name: duplicate_groups duplicate_groups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.duplicate_groups
    ADD CONSTRAINT duplicate_groups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: edge_delivery_cache edge_delivery_cache_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.edge_delivery_cache
    ADD CONSTRAINT edge_delivery_cache_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: encryption_keys encryption_keys_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.encryption_keys
    ADD CONSTRAINT encryption_keys_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: events events_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: events events_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: events events_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.events
    ADD CONSTRAINT events_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: face_clusters face_clusters_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_clusters
    ADD CONSTRAINT face_clusters_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: face_clusters face_clusters_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_clusters
    ADD CONSTRAINT face_clusters_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE SET NULL;


--
-- Name: face_clusters face_clusters_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.face_clusters
    ADD CONSTRAINT face_clusters_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: upload_allowlist_tokens fk_upload_allowlist_tokens_issued_by; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_allowlist_tokens
    ADD CONSTRAINT fk_upload_allowlist_tokens_issued_by FOREIGN KEY (issued_by) REFERENCES public.users(id) ON DELETE RESTRICT;


--
-- Name: follow_ups follow_ups_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: follow_ups follow_ups_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: follow_ups follow_ups_deal_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_deal_id_fkey FOREIGN KEY (deal_id) REFERENCES public.deals(id);


--
-- Name: follow_ups follow_ups_lead_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_lead_id_fkey FOREIGN KEY (lead_id) REFERENCES public.leads(id);


--
-- Name: follow_ups follow_ups_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_ups
    ADD CONSTRAINT follow_ups_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: freelancer_listings freelancer_listings_portfolio_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_listings
    ADD CONSTRAINT freelancer_listings_portfolio_gallery_id_fkey FOREIGN KEY (portfolio_gallery_id) REFERENCES public.galleries(id) ON DELETE SET NULL;


--
-- Name: freelancer_listings freelancer_listings_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_listings
    ADD CONSTRAINT freelancer_listings_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: freelancer_listings freelancer_listings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_listings
    ADD CONSTRAINT freelancer_listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: freelancer_listings freelancer_listings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_listings
    ADD CONSTRAINT freelancer_listings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: freelancer_reviews freelancer_reviews_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_reviews
    ADD CONSTRAINT freelancer_reviews_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.freelancer_listings(id) ON DELETE CASCADE;


--
-- Name: freelancer_reviews freelancer_reviews_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.freelancer_reviews
    ADD CONSTRAINT freelancer_reviews_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: galleries galleries_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.galleries
    ADD CONSTRAINT galleries_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: galleries galleries_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.galleries
    ADD CONSTRAINT galleries_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: gallery_access_logs gallery_access_logs_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_access_logs
    ADD CONSTRAINT gallery_access_logs_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_access_logs gallery_access_logs_share_link_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_access_logs
    ADD CONSTRAINT gallery_access_logs_share_link_id_fkey FOREIGN KEY (share_link_id) REFERENCES public.share_links(id);


--
-- Name: gallery_access_logs gallery_access_logs_visitor_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_access_logs
    ADD CONSTRAINT gallery_access_logs_visitor_user_id_fkey FOREIGN KEY (visitor_user_id) REFERENCES public.users(id);


--
-- Name: gallery_analytics_daily gallery_analytics_daily_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_analytics_daily
    ADD CONSTRAINT gallery_analytics_daily_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_analytics_events gallery_analytics_events_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_analytics_events
    ADD CONSTRAINT gallery_analytics_events_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_assets gallery_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_assets
    ADD CONSTRAINT gallery_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: gallery_assets gallery_assets_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_assets
    ADD CONSTRAINT gallery_assets_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_banners gallery_banners_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_banners
    ADD CONSTRAINT gallery_banners_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_banners gallery_banners_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_banners
    ADD CONSTRAINT gallery_banners_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: gallery_carts gallery_carts_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_carts
    ADD CONSTRAINT gallery_carts_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_design_templates gallery_design_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_design_templates
    ADD CONSTRAINT gallery_design_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: gallery_design_templates gallery_design_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_design_templates
    ADD CONSTRAINT gallery_design_templates_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: gallery_orders gallery_orders_cart_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_orders
    ADD CONSTRAINT gallery_orders_cart_id_fkey FOREIGN KEY (cart_id) REFERENCES public.gallery_carts(id);


--
-- Name: gallery_orders gallery_orders_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_orders
    ADD CONSTRAINT gallery_orders_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_orders gallery_orders_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_orders
    ADD CONSTRAINT gallery_orders_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: gallery_products gallery_products_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_products
    ADD CONSTRAINT gallery_products_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id);


--
-- Name: gallery_products gallery_products_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_products
    ADD CONSTRAINT gallery_products_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: gallery_products gallery_products_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gallery_products
    ADD CONSTRAINT gallery_products_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: gear_bookings gear_bookings_gear_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_bookings
    ADD CONSTRAINT gear_bookings_gear_listing_id_fkey FOREIGN KEY (gear_listing_id) REFERENCES public.gear_listings(id) ON DELETE CASCADE;


--
-- Name: gear_bookings gear_bookings_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_bookings
    ADD CONSTRAINT gear_bookings_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gear_bookings gear_bookings_renter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_bookings
    ADD CONSTRAINT gear_bookings_renter_id_fkey FOREIGN KEY (renter_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gear_listings gear_listings_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_listings
    ADD CONSTRAINT gear_listings_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: gear_listings gear_listings_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_listings
    ADD CONSTRAINT gear_listings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: gear_listings gear_listings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gear_listings
    ADD CONSTRAINT gear_listings_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: hire_requests hire_requests_freelancer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hire_requests
    ADD CONSTRAINT hire_requests_freelancer_id_fkey FOREIGN KEY (freelancer_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: hire_requests hire_requests_listing_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hire_requests
    ADD CONSTRAINT hire_requests_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES public.freelancer_listings(id) ON DELETE CASCADE;


--
-- Name: hire_requests hire_requests_requester_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hire_requests
    ADD CONSTRAINT hire_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: invitations invitations_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitations
    ADD CONSTRAINT invitations_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES public.contacts(id);


--
-- Name: invoices invoices_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: invoices invoices_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: kyc_documents kyc_documents_dealer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE CASCADE;


--
-- Name: kyc_documents kyc_documents_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.kyc_documents
    ADD CONSTRAINT kyc_documents_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: leads leads_assigned_to_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id);


--
-- Name: leads leads_converted_contact_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_converted_contact_fk FOREIGN KEY (converted_contact_id) REFERENCES public.contacts(id);


--
-- Name: leads leads_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.leads
    ADD CONSTRAINT leads_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: magic_link_tokens magic_link_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.magic_link_tokens
    ADD CONSTRAINT magic_link_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: margin_ratios margin_ratios_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.margin_ratios
    ADD CONSTRAINT margin_ratios_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: margin_ratios margin_ratios_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.margin_ratios
    ADD CONSTRAINT margin_ratios_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: marketplace_inquiries marketplace_inquiries_from_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_inquiries
    ADD CONSTRAINT marketplace_inquiries_from_user_id_fkey FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: marketplace_inquiries marketplace_inquiries_to_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketplace_inquiries
    ADD CONSTRAINT marketplace_inquiries_to_user_id_fkey FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.channels(id) ON DELETE CASCADE;


--
-- Name: messages messages_parent_message_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_parent_message_id_fkey FOREIGN KEY (parent_message_id) REFERENCES public.messages(id) ON DELETE SET NULL;


--
-- Name: messages messages_sender_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: messages messages_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT messages_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: moderation_items moderation_items_actioned_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_items
    ADD CONSTRAINT moderation_items_actioned_by_fkey FOREIGN KEY (actioned_by) REFERENCES public.users(id);


--
-- Name: moderation_items moderation_items_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_items
    ADD CONSTRAINT moderation_items_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id);


--
-- Name: moderation_items moderation_items_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_items
    ADD CONSTRAINT moderation_items_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: moderation_items moderation_items_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_items
    ADD CONSTRAINT moderation_items_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: moderation_queue moderation_queue_reporter_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_queue
    ADD CONSTRAINT moderation_queue_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_queue moderation_queue_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_queue
    ADD CONSTRAINT moderation_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: moderation_queue moderation_queue_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.moderation_queue
    ADD CONSTRAINT moderation_queue_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: near_duplicate_reviews near_duplicate_reviews_burst_group_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_burst_group_id_fkey FOREIGN KEY (burst_group_id) REFERENCES public.burst_groups(id) ON DELETE SET NULL;


--
-- Name: near_duplicate_reviews near_duplicate_reviews_duplicate_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_duplicate_asset_id_fkey FOREIGN KEY (duplicate_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: near_duplicate_reviews near_duplicate_reviews_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: near_duplicate_reviews near_duplicate_reviews_primary_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_primary_asset_id_fkey FOREIGN KEY (primary_asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: near_duplicate_reviews near_duplicate_reviews_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.near_duplicate_reviews
    ADD CONSTRAINT near_duplicate_reviews_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);


--
-- Name: notification_preferences notification_preferences_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_preferences
    ADD CONSTRAINT notification_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: otp_tokens otp_tokens_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otp_tokens
    ADD CONSTRAINT otp_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: payments payments_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoices(id);


--
-- Name: payments payments_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payments
    ADD CONSTRAINT payments_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: payouts payouts_approved_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id);


--
-- Name: payouts payouts_dealer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_dealer_id_fkey FOREIGN KEY (dealer_id) REFERENCES public.dealers(id) ON DELETE RESTRICT;


--
-- Name: payouts payouts_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payouts
    ADD CONSTRAINT payouts_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(id);


--
-- Name: proofing_comments proofing_comments_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_comments
    ADD CONSTRAINT proofing_comments_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: proofing_comments proofing_comments_author_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_comments
    ADD CONSTRAINT proofing_comments_author_user_id_fkey FOREIGN KEY (author_user_id) REFERENCES public.users(id);


--
-- Name: proofing_comments proofing_comments_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_comments
    ADD CONSTRAINT proofing_comments_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: proofing_comments proofing_comments_parent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_comments
    ADD CONSTRAINT proofing_comments_parent_id_fkey FOREIGN KEY (parent_id) REFERENCES public.proofing_comments(id) ON DELETE CASCADE;


--
-- Name: proofing_selections proofing_selections_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_selections
    ADD CONSTRAINT proofing_selections_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: proofing_selections proofing_selections_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_selections
    ADD CONSTRAINT proofing_selections_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: proofing_selections proofing_selections_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_selections
    ADD CONSTRAINT proofing_selections_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.proofing_sessions(id);


--
-- Name: proofing_sessions proofing_sessions_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proofing_sessions
    ADD CONSTRAINT proofing_sessions_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: pwa_install_events pwa_install_events_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pwa_install_events
    ADD CONSTRAINT pwa_install_events_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: quality_scores quality_scores_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_scores
    ADD CONSTRAINT quality_scores_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: quality_scores quality_scores_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.quality_scores
    ADD CONSTRAINT quality_scores_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: refresh_tokens refresh_tokens_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.sessions(id);


--
-- Name: sessions sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: share_links share_links_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.share_links
    ADD CONSTRAINT share_links_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE CASCADE;


--
-- Name: stream_chats stream_chats_stream_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chats
    ADD CONSTRAINT stream_chats_stream_id_fkey FOREIGN KEY (stream_id) REFERENCES public.streams(id) ON DELETE CASCADE;


--
-- Name: stream_chats stream_chats_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stream_chats
    ADD CONSTRAINT stream_chats_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: streams streams_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: streams streams_gallery_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_gallery_id_fkey FOREIGN KEY (gallery_id) REFERENCES public.galleries(id) ON DELETE SET NULL;


--
-- Name: streams streams_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.streams
    ADD CONSTRAINT streams_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: subscriptions subscriptions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: subscriptions subscriptions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscriptions
    ADD CONSTRAINT subscriptions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: upload_sessions upload_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: upload_sessions upload_sessions_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.upload_sessions
    ADD CONSTRAINT upload_sessions_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: user_auth_methods user_auth_methods_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_auth_methods
    ADD CONSTRAINT user_auth_methods_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: user_mfa_enrollments user_mfa_enrollments_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_enrollments
    ADD CONSTRAINT user_mfa_enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_mfa_recovery_codes user_mfa_recovery_codes_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_mfa_recovery_codes
    ADD CONSTRAINT user_mfa_recovery_codes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- Name: user_profiles user_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profiles
    ADD CONSTRAINT user_profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: users users_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: video_assets video_assets_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.assets(id) ON DELETE CASCADE;


--
-- Name: video_assets video_assets_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.video_assets
    ADD CONSTRAINT video_assets_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: webhook_deliveries webhook_deliveries_webhook_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhook_deliveries
    ADD CONSTRAINT webhook_deliveries_webhook_id_fkey FOREIGN KEY (webhook_id) REFERENCES public.webhooks(id) ON DELETE CASCADE;


--
-- Name: webhooks webhooks_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(id);


--
-- Name: webhooks webhooks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.webhooks
    ADD CONSTRAINT webhooks_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_role_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_role_id_fkey FOREIGN KEY (role_id) REFERENCES public.roles(id);


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_members
    ADD CONSTRAINT workspace_members_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id);


--
-- Name: workspace_storage_configs workspace_storage_configs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_storage_configs
    ADD CONSTRAINT workspace_storage_configs_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspace_storage workspace_storage_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspace_storage
    ADD CONSTRAINT workspace_storage_workspace_id_fkey FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;


--
-- Name: workspaces workspaces_deleted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_deleted_by_fkey FOREIGN KEY (deleted_by) REFERENCES public.users(id);


--
-- Name: workspaces workspaces_owner_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id);


--
-- Name: workspaces workspaces_state_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_state_id_fkey FOREIGN KEY (state_id) REFERENCES public.states(id);


--
-- Name: workspaces workspaces_suspended_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_suspended_by_fkey FOREIGN KEY (suspended_by) REFERENCES public.users(id);


--
-- Name: ai_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_configs ai_configs_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_configs_workspace_isolation ON public.ai_configs USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: ai_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_jobs ai_jobs_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_jobs_workspace_isolation ON public.ai_jobs USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: ai_search_queries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_search_queries ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_search_queries ai_search_queries_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_search_queries_isolation ON public.ai_search_queries USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: ai_usage_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: ai_usage_logs ai_usage_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY ai_usage_workspace_isolation ON public.ai_usage_logs USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: api_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: api_keys api_keys_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY api_keys_isolation ON public.api_keys USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;

--
-- Name: assets assets_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY assets_isolation ON public.assets USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs audit_logs_admin_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY audit_logs_admin_read ON public.audit_logs FOR SELECT USING ((current_setting('app.current_user_role'::text, true) = ANY (ARRAY['super_admin'::text, 'admin'::text])));


--
-- Name: channel_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

--
-- Name: channel_members channel_members_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channel_members_workspace_isolation ON public.channel_members USING ((channel_id IN ( SELECT channels.id
   FROM public.channels
  WHERE (channels.workspace_id = (current_setting('app.current_workspace_id'::text, true))::uuid))));


--
-- Name: channels; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

--
-- Name: channels channels_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY channels_workspace_isolation ON public.channels USING ((workspace_id = (current_setting('app.current_workspace_id'::text, true))::uuid));


--
-- Name: client_conversations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_conversations ENABLE ROW LEVEL SECURITY;

--
-- Name: client_conversations client_conversations_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_conversations_workspace_isolation ON public.client_conversations USING ((workspace_id = (current_setting('app.current_workspace_id'::text, true))::uuid));


--
-- Name: contacts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

--
-- Name: contacts contacts_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contacts_workspace_isolation ON public.contacts USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: contract_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: contract_templates contract_templates_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contract_templates_workspace_isolation ON public.contract_templates USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: contracts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;

--
-- Name: contracts contracts_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY contracts_workspace_isolation ON public.contracts USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: coupon_redemptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

--
-- Name: coupon_redemptions coupon_redemptions_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupon_redemptions_access ON public.coupon_redemptions USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((user_id)::text = current_setting('app.user_id'::text, true))));


--
-- Name: coupons; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;

--
-- Name: coupons coupons_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY coupons_access ON public.coupons USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((owner_type)::text = 'admin'::text) OR ((dealer_id IS NOT NULL) AND (dealer_id IN ( SELECT dealers.id
   FROM public.dealers
  WHERE ((dealers.user_id)::text = current_setting('app.user_id'::text, true)))))));


--
-- Name: dealer_attributions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dealer_attributions ENABLE ROW LEVEL SECURITY;

--
-- Name: dealer_attributions dealer_attributions_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dealer_attributions_access ON public.dealer_attributions USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR (dealer_id IN ( SELECT dealers.id
   FROM public.dealers
  WHERE ((dealers.user_id)::text = current_setting('app.user_id'::text, true))))));


--
-- Name: dealers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;

--
-- Name: dealers dealers_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY dealers_owner ON public.dealers USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((user_id)::text = current_setting('app.user_id'::text, true))));


--
-- Name: deals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

--
-- Name: deals deals_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY deals_workspace_isolation ON public.deals USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: desktop_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.desktop_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: desktop_sessions desktop_sessions_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY desktop_sessions_isolation ON public.desktop_sessions USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: download_jobs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.download_jobs ENABLE ROW LEVEL SECURITY;

--
-- Name: download_jobs download_jobs_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY download_jobs_isolation ON public.download_jobs USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: duplicate_groups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.duplicate_groups ENABLE ROW LEVEL SECURITY;

--
-- Name: duplicate_groups duplicate_groups_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY duplicate_groups_workspace_isolation ON public.duplicate_groups USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: encryption_keys; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.encryption_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: encryption_keys encryption_keys_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY encryption_keys_isolation ON public.encryption_keys USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: events; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

--
-- Name: events events_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY events_workspace_isolation ON public.events USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: face_clusters; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.face_clusters ENABLE ROW LEVEL SECURITY;

--
-- Name: face_clusters face_clusters_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY face_clusters_workspace_isolation ON public.face_clusters USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: follow_ups; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.follow_ups ENABLE ROW LEVEL SECURITY;

--
-- Name: follow_ups follow_ups_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY follow_ups_workspace_isolation ON public.follow_ups USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: freelancer_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.freelancer_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: freelancer_listings freelancer_listings_owner_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY freelancer_listings_owner_manage ON public.freelancer_listings USING ((user_id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: freelancer_listings freelancer_listings_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY freelancer_listings_public_read ON public.freelancer_listings FOR SELECT USING (((is_published = true) OR (user_id = (current_setting('app.current_user_id'::text, true))::uuid)));


--
-- Name: freelancer_reviews; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.freelancer_reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: freelancer_reviews freelancer_reviews_author_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY freelancer_reviews_author_manage ON public.freelancer_reviews USING ((reviewer_id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: freelancer_reviews freelancer_reviews_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY freelancer_reviews_public_read ON public.freelancer_reviews FOR SELECT USING (true);


--
-- Name: galleries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.galleries ENABLE ROW LEVEL SECURITY;

--
-- Name: galleries galleries_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY galleries_isolation ON public.galleries USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: gallery_banners; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_banners ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_banners gallery_banners_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gallery_banners_isolation ON public.gallery_banners USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: gallery_design_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_design_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_design_templates gallery_design_templates_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gallery_design_templates_isolation ON public.gallery_design_templates USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: gallery_orders; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_orders ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_orders gallery_orders_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gallery_orders_isolation ON public.gallery_orders USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: gallery_products; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gallery_products ENABLE ROW LEVEL SECURITY;

--
-- Name: gallery_products gallery_products_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gallery_products_isolation ON public.gallery_products USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: gear_bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gear_bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_bookings gear_bookings_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gear_bookings_participant ON public.gear_bookings USING (((renter_id = (current_setting('app.current_user_id'::text, true))::uuid) OR (owner_id = (current_setting('app.current_user_id'::text, true))::uuid)));


--
-- Name: gear_listings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gear_listings ENABLE ROW LEVEL SECURITY;

--
-- Name: gear_listings gear_listings_owner_manage; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gear_listings_owner_manage ON public.gear_listings USING ((user_id = (current_setting('app.current_user_id'::text, true))::uuid));


--
-- Name: gear_listings gear_listings_public_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY gear_listings_public_read ON public.gear_listings FOR SELECT USING (((is_published = true) OR (user_id = (current_setting('app.current_user_id'::text, true))::uuid)));


--
-- Name: hire_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.hire_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: hire_requests hire_requests_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY hire_requests_participant ON public.hire_requests USING (((requester_id = (current_setting('app.current_user_id'::text, true))::uuid) OR (freelancer_id = (current_setting('app.current_user_id'::text, true))::uuid)));


--
-- Name: invitations; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations invitations_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invitations_isolation ON public.invitations USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_workspace_isolation ON public.invoices USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: kyc_documents; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.kyc_documents ENABLE ROW LEVEL SECURITY;

--
-- Name: kyc_documents kyc_documents_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY kyc_documents_access ON public.kyc_documents USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR (dealer_id IN ( SELECT dealers.id
   FROM public.dealers
  WHERE ((dealers.user_id)::text = current_setting('app.user_id'::text, true))))));


--
-- Name: leads; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

--
-- Name: leads leads_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY leads_workspace_isolation ON public.leads USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: margin_ratios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.margin_ratios ENABLE ROW LEVEL SECURITY;

--
-- Name: margin_ratios margin_ratios_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY margin_ratios_read ON public.margin_ratios FOR SELECT USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR true));


--
-- Name: marketplace_inquiries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketplace_inquiries ENABLE ROW LEVEL SECURITY;

--
-- Name: marketplace_inquiries marketplace_inquiries_participant; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketplace_inquiries_participant ON public.marketplace_inquiries USING (((from_user_id = (current_setting('app.current_user_id'::text, true))::uuid) OR (to_user_id = (current_setting('app.current_user_id'::text, true))::uuid)));


--
-- Name: messages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

--
-- Name: messages messages_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY messages_workspace_isolation ON public.messages USING ((workspace_id = (current_setting('app.current_workspace_id'::text, true))::uuid));


--
-- Name: moderation_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_items ENABLE ROW LEVEL SECURITY;

--
-- Name: moderation_items moderation_items_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moderation_items_isolation ON public.moderation_items USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: moderation_queue; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_queue ENABLE ROW LEVEL SECURITY;

--
-- Name: moderation_queue moderation_queue_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moderation_queue_admin ON public.moderation_queue USING (true);


--
-- Name: moderation_rules; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.moderation_rules ENABLE ROW LEVEL SECURITY;

--
-- Name: moderation_rules moderation_rules_admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY moderation_rules_admin ON public.moderation_rules USING (true);


--
-- Name: notification_preferences; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

--
-- Name: notification_preferences notification_prefs_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notification_prefs_owner ON public.notification_preferences USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((user_id)::text = current_setting('app.user_id'::text, true))));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications_owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_owner ON public.notifications USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((user_id)::text = current_setting('app.user_id'::text, true))));


--
-- Name: payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

--
-- Name: payments payments_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payments_workspace_isolation ON public.payments USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: payouts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.payouts ENABLE ROW LEVEL SECURITY;

--
-- Name: payouts payouts_access; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY payouts_access ON public.payouts USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR (dealer_id IN ( SELECT dealers.id
   FROM public.dealers
  WHERE ((dealers.user_id)::text = current_setting('app.user_id'::text, true))))));


--
-- Name: quality_scores; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.quality_scores ENABLE ROW LEVEL SECURITY;

--
-- Name: quality_scores quality_scores_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY quality_scores_workspace_isolation ON public.quality_scores USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.current_workspace_id'::text, true))));


--
-- Name: streams; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.streams ENABLE ROW LEVEL SECURITY;

--
-- Name: streams streams_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY streams_isolation ON public.streams USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: subscriptions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

--
-- Name: subscriptions subscriptions_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY subscriptions_isolation ON public.subscriptions USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: upload_allowlist_tokens; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_allowlist_tokens ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_allowlist_tokens upload_allowlist_tokens_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY upload_allowlist_tokens_isolation ON public.upload_allowlist_tokens USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: upload_sessions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.upload_sessions ENABLE ROW LEVEL SECURITY;

--
-- Name: upload_sessions upload_sessions_workspace_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY upload_sessions_workspace_isolation ON public.upload_sessions USING ((workspace_id = (current_setting('app.workspace_id'::text, true))::uuid));


--
-- Name: video_assets; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;

--
-- Name: video_assets video_assets_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY video_assets_isolation ON public.video_assets USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: webhooks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.webhooks ENABLE ROW LEVEL SECURITY;

--
-- Name: webhooks webhooks_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY webhooks_isolation ON public.webhooks USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_members workspace_members_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_members_isolation ON public.workspace_members USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: workspace_storage; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_storage ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_storage_configs; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspace_storage_configs ENABLE ROW LEVEL SECURITY;

--
-- Name: workspace_storage_configs workspace_storage_configs_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_storage_configs_isolation ON public.workspace_storage_configs USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: workspace_storage workspace_storage_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspace_storage_isolation ON public.workspace_storage USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((workspace_id)::text = current_setting('app.workspace_id'::text, true))));


--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces workspaces_isolation; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY workspaces_isolation ON public.workspaces USING (((current_setting('app.bypass_rls'::text, true) = 'on'::text) OR ((id)::text = current_setting('app.workspace_id'::text, true))));


--
-- PostgreSQL database dump complete
--

\unrestrict os8sfZsJoEBTGduT0NBHv3f2VBVKfglYKV3L543Bu8ZG84UIP9YU1i3BSK9zMut

