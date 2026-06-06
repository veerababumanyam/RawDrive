package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	backendcrypto "github.com/rawdrive/backend/internal/crypto"
	"github.com/rawdrive/backend/internal/handler"
	"github.com/rawdrive/backend/internal/repository"
)

type cliOptions struct {
	Provider            string
	OrderID             string
	OrderTable          string
	Limit               int
	DatabaseURL         string
	ConfigOnly          bool
	CheckProviderStatus bool
	Strict              bool
	JSON                bool
	Timeout             time.Duration
}

type dryRunReport struct {
	GeneratedAt time.Time              `json:"generated_at"`
	MutatesDB   bool                   `json:"mutates_db"`
	Provider    string                 `json:"provider"`
	Config      []providerConfigReport `json:"config"`
	Database    *databasePreflight     `json:"database,omitempty"`
	Orders      []orderDryRun          `json:"orders"`
	Issues      []dryRunIssue          `json:"issues"`
}

type providerConfigReport struct {
	Provider             string   `json:"provider"`
	Configured           bool     `json:"configured"`
	Missing              []string `json:"missing,omitempty"`
	BaseURL              string   `json:"base_url,omitempty"`
	AuthBaseURL          string   `json:"auth_base_url,omitempty"`
	StatusCheckAvailable bool     `json:"status_check_available"`
	WebhookConfigured    bool     `json:"webhook_configured"`
	Notes                []string `json:"notes,omitempty"`
}

type databasePreflight struct {
	ApprovedPlanVersions              int64 `json:"approved_plan_versions"`
	ApprovedProductVersions           int64 `json:"approved_product_versions"`
	SubscriptionsMissingSnapshot      int64 `json:"subscriptions_missing_snapshot"`
	SubscriptionOrdersMissingSnapshot int64 `json:"subscription_orders_missing_snapshot"`
	PendingBillingOrders              int64 `json:"pending_billing_orders"`
	PendingSubscriptionOrders         int64 `json:"pending_subscription_orders"`
}

type dryRunIssue struct {
	Severity string `json:"severity"`
	Code     string `json:"code"`
	Message  string `json:"message"`
}

type orderDryRun struct {
	ID                       uuid.UUID       `json:"id"`
	SourceTable              string          `json:"source_table"`
	Provider                 string          `json:"provider"`
	ProviderOrderID          string          `json:"provider_order_id"`
	OrderType                string          `json:"order_type"`
	Status                   string          `json:"status"`
	AmountPaise              int64           `json:"amount_paise"`
	Currency                 string          `json:"currency"`
	WorkspaceID              uuid.UUID       `json:"workspace_id"`
	TargetType               string          `json:"target_type"`
	TargetID                 *uuid.UUID      `json:"target_id,omitempty"`
	CreatedAt                time.Time       `json:"created_at"`
	ProviderStatus           *providerStatus `json:"provider_status,omitempty"`
	SnapshotSchema           string          `json:"snapshot_schema,omitempty"`
	SnapshotValid            bool            `json:"snapshot_valid"`
	SettlementWouldRun       bool            `json:"settlement_would_run"`
	SettlementAlreadyApplied bool            `json:"settlement_already_applied"`
	ExpectedActions          []string        `json:"expected_actions"`
	Issues                   []dryRunIssue   `json:"issues,omitempty"`
}

type providerStatus struct {
	Checked     bool   `json:"checked"`
	State       string `json:"state,omitempty"`
	PaymentID   string `json:"payment_id,omitempty"`
	AmountPaise int64  `json:"amount_paise,omitempty"`
	ErrorCode   string `json:"error_code,omitempty"`
	RawSummary  string `json:"raw_summary,omitempty"`
	CheckError  string `json:"check_error,omitempty"`
}

type settlementOrder struct {
	ID                uuid.UUID
	SourceTable       string
	WorkspaceID       uuid.UUID
	Provider          string
	ProviderOrderID   string
	ProviderPaymentID string
	OrderType         string
	TargetType        string
	TargetID          *uuid.UUID
	Status            string
	AmountPaise       int64
	Currency          string
	FromTier          string
	ToTier            string
	BillingInterval   string
	CatalogSnapshot   []byte
	CreatedAt         time.Time
}

type paymentConfig struct {
	Razorpay razorpayConfig
	PhonePe  phonePeConfig
}

type razorpayConfig struct {
	KeyID         string
	KeySecret     string
	WebhookSecret string
	BaseURL       string
}

type phonePeConfig struct {
	ClientID        string
	ClientSecret    string
	ClientVersion   string
	BaseURL         string
	AuthBaseURL     string
	PublicBaseURL   string
	WebhookUsername string
	WebhookPassword string
}

type settingsResolver struct {
	repo   *repository.PlatformSettingsRepo
	issues *[]dryRunIssue
}

func main() {
	opts := parseFlags(os.Args[1:])
	ctx, cancel := context.WithTimeout(context.Background(), opts.Timeout)
	defer cancel()

	report, err := run(ctx, opts)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	if opts.JSON {
		enc := json.NewEncoder(os.Stdout)
		enc.SetIndent("", "  ")
		if err := enc.Encode(report); err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}
	} else {
		printHumanReport(os.Stdout, report)
	}

	if opts.Strict && hasBlockingIssues(report.Issues) {
		os.Exit(1)
	}
}

func parseFlags(args []string) cliOptions {
	fs := flag.NewFlagSet("dry-run-gateway-settlement", flag.ExitOnError)
	opts := cliOptions{}
	fs.StringVar(&opts.Provider, "provider", "all", "provider to inspect: all, razorpay, or phonepe")
	fs.StringVar(&opts.OrderID, "order-id", "", "optional RawDrive order id or provider order id")
	fs.StringVar(&opts.OrderTable, "order-table", "auto", "order source: auto, billing_orders, or subscription_upgrade_orders")
	fs.IntVar(&opts.Limit, "limit", 20, "max recent pending/failed orders to inspect when --order-id is omitted")
	fs.StringVar(&opts.DatabaseURL, "database-url", os.Getenv("DATABASE_URL"), "Postgres DSN; defaults to DATABASE_URL")
	fs.BoolVar(&opts.ConfigOnly, "config-only", false, "only validate gateway configuration; no database order lookup")
	fs.BoolVar(&opts.CheckProviderStatus, "check-provider-status", false, "call gateway status APIs for selected orders")
	fs.BoolVar(&opts.Strict, "strict", false, "exit non-zero on missing config, unresolved catalog backfill, or invalid snapshots")
	fs.BoolVar(&opts.JSON, "json", false, "emit JSON report")
	fs.DurationVar(&opts.Timeout, "timeout", 30*time.Second, "overall command timeout")
	_ = fs.Parse(args)
	opts.Provider = strings.ToLower(strings.TrimSpace(opts.Provider))
	opts.OrderTable = strings.ToLower(strings.TrimSpace(opts.OrderTable))
	if opts.Limit <= 0 {
		opts.Limit = 20
	}
	if opts.Limit > 200 {
		opts.Limit = 200
	}
	return opts
}

func run(ctx context.Context, opts cliOptions) (dryRunReport, error) {
	providers, err := normalizeProviders(opts.Provider)
	if err != nil {
		return dryRunReport{}, err
	}
	report := dryRunReport{
		GeneratedAt: time.Now().UTC(),
		MutatesDB:   false,
		Provider:    opts.Provider,
		Orders:      []orderDryRun{},
		Issues:      []dryRunIssue{},
	}

	var pool *pgxpool.Pool
	if !opts.ConfigOnly {
		if strings.TrimSpace(opts.DatabaseURL) == "" {
			return report, errors.New("DATABASE_URL is required unless --config-only is set")
		}
		cfg, err := pgxpool.ParseConfig(opts.DatabaseURL)
		if err != nil {
			return report, fmt.Errorf("parse database url: %w", err)
		}
		pool, err = pgxpool.NewWithConfig(ctx, cfg)
		if err != nil {
			return report, fmt.Errorf("connect database: %w", err)
		}
		defer pool.Close()
		if err := pool.Ping(ctx); err != nil {
			return report, fmt.Errorf("ping database: %w", err)
		}
	}

	resolver := settingsResolver{issues: &report.Issues}
	if pool != nil {
		repo := repository.NewPlatformSettingsRepo(pool)
		if kekHex := strings.TrimSpace(os.Getenv("PLATFORM_SETTINGS_KEK")); kekHex != "" {
			envelope, err := backendcrypto.NewEnvelopeFromHex(kekHex)
			if err != nil {
				report.Issues = append(report.Issues, dryRunIssue{
					Severity: "error",
					Code:     "invalid_platform_settings_kek",
					Message:  "PLATFORM_SETTINGS_KEK is set but invalid; encrypted payment settings cannot be read",
				})
			} else {
				repo = repo.WithEnvelope(envelope)
			}
		}
		resolver.repo = repo
	}

	cfg := loadPaymentConfig(ctx, resolver)
	report.Config = buildProviderConfigReport(providers, cfg)
	report.Issues = append(report.Issues, providerConfigIssues(report.Config)...)

	if opts.ConfigOnly {
		return report, nil
	}

	preflight, err := fetchDatabasePreflight(ctx, pool)
	if err != nil {
		report.Issues = append(report.Issues, dryRunIssue{
			Severity: "error",
			Code:     "database_preflight_failed",
			Message:  err.Error(),
		})
		return report, nil
	}
	report.Database = &preflight
	if preflight.SubscriptionsMissingSnapshot > 0 {
		report.Issues = append(report.Issues, dryRunIssue{
			Severity: "error",
			Code:     "subscription_backfill_incomplete",
			Message:  fmt.Sprintf("%d subscriptions are still missing plan_version_id or catalog_snapshot", preflight.SubscriptionsMissingSnapshot),
		})
	}
	if preflight.ApprovedPlanVersions == 0 {
		report.Issues = append(report.Issues, dryRunIssue{
			Severity: "error",
			Code:     "missing_approved_plan_versions",
			Message:  "no approved subscription plan versions found",
		})
	}
	if preflight.ApprovedProductVersions == 0 {
		report.Issues = append(report.Issues, dryRunIssue{
			Severity: "warning",
			Code:     "missing_approved_product_versions",
			Message:  "no approved billing product versions found",
		})
	}

	orders, err := loadOrders(ctx, pool, opts, providers)
	if err != nil {
		report.Issues = append(report.Issues, dryRunIssue{
			Severity: "error",
			Code:     "order_lookup_failed",
			Message:  err.Error(),
		})
		return report, nil
	}
	for _, order := range orders {
		od := buildOrderDryRun(ctx, order, opts.CheckProviderStatus, cfg)
		report.Orders = append(report.Orders, od)
		report.Issues = append(report.Issues, od.Issues...)
	}
	return report, nil
}

func normalizeProviders(provider string) ([]string, error) {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "", "all":
		return []string{"razorpay", "phonepe"}, nil
	case "razorpay":
		return []string{"razorpay"}, nil
	case "phonepe":
		return []string{"phonepe"}, nil
	default:
		return nil, fmt.Errorf("unsupported provider %q", provider)
	}
}

func (r settingsResolver) get(ctx context.Context, key string, envNames ...string) string {
	if r.repo != nil {
		setting, err := r.repo.GetByKey(ctx, "payments", key)
		if err != nil {
			*r.issues = append(*r.issues, dryRunIssue{
				Severity: "warning",
				Code:     "payment_setting_read_failed",
				Message:  fmt.Sprintf("could not read platform_settings payments.%s; falling back to env", key),
			})
		} else if setting != nil && strings.TrimSpace(setting.Value) != "" {
			return strings.TrimSpace(setting.Value)
		}
	}
	for _, name := range envNames {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func loadPaymentConfig(ctx context.Context, resolver settingsResolver) paymentConfig {
	rzp := razorpayConfig{
		KeyID:         resolver.get(ctx, "razorpay_key_id", "RAZORPAY_KEY_ID"),
		KeySecret:     resolver.get(ctx, "razorpay_key_secret", "RAZORPAY_KEY_SECRET"),
		WebhookSecret: resolver.get(ctx, "razorpay_webhook_secret", "RAZORPAY_WEBHOOK_SECRET"),
		BaseURL:       resolver.get(ctx, "razorpay_base_url", "RAZORPAY_BASE_URL"),
	}
	if rzp.BaseURL == "" {
		rzp.BaseURL = "https://api.razorpay.com"
	}

	ppBase := resolver.get(ctx, "phonepe_v2_base_url", "PHONEPE_V2_BASE_URL", "PHONEPE_BASE_URL")
	if ppBase == "" {
		ppBase = "https://api.phonepe.com/apis/pg"
	}
	ppAuth := firstNonEmptyString(
		resolver.get(ctx, "phonepe_v2_auth_base_url", "PHONEPE_V2_AUTH_BASE_URL"),
		resolver.get(ctx, "phonepe_auth_base_url", "PHONEPE_AUTH_BASE_URL"),
	)
	if ppAuth == "" && strings.Contains(strings.TrimRight(ppBase, "/"), "api.phonepe.com/apis/pg") {
		ppAuth = "https://api.phonepe.com/apis/identity-manager"
	}
	pp := phonePeConfig{
		ClientID: firstNonEmptyString(
			resolver.get(ctx, "phonepe_client_id", "PHONEPE_CLIENT_ID"),
			resolver.get(ctx, "phonepe_clientid", "PHONEPE_CLIENTID"),
		),
		ClientSecret: firstNonEmptyString(
			resolver.get(ctx, "phonepe_client_secret", "PHONEPE_CLIENT_SECRET"),
			resolver.get(ctx, "phonepe_secret", "PHONEPE_SECRET"),
		),
		ClientVersion: firstNonEmptyString(
			resolver.get(ctx, "phonepe_client_version", "PHONEPE_CLIENT_VERSION"),
			resolver.get(ctx, "phonepe_version", "PHONEPE_VERSION"),
			"1",
		),
		BaseURL:         ppBase,
		AuthBaseURL:     ppAuth,
		PublicBaseURL:   firstNonEmptyString(resolver.get(ctx, "public_base_url", "PUBLIC_BASE_URL"), resolver.get(ctx, "frontend_url", "FRONTEND_URL"), resolver.get(ctx, "callback_base_url", "PAYMENT_CALLBACK_BASE_URL")),
		WebhookUsername: resolver.get(ctx, "phonepe_webhook_username", "PHONEPE_WEBHOOK_USERNAME"),
		WebhookPassword: resolver.get(ctx, "phonepe_webhook_password", "PHONEPE_WEBHOOK_PASSWORD"),
	}
	return paymentConfig{Razorpay: rzp, PhonePe: pp}
}

func firstNonEmptyString(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}

func buildProviderConfigReport(providers []string, cfg paymentConfig) []providerConfigReport {
	reports := make([]providerConfigReport, 0, len(providers))
	for _, provider := range providers {
		switch provider {
		case "razorpay":
			missing := missingKeys(map[string]string{
				"payments.razorpay_key_id":         cfg.Razorpay.KeyID,
				"payments.razorpay_key_secret":     cfg.Razorpay.KeySecret,
				"payments.razorpay_webhook_secret": cfg.Razorpay.WebhookSecret,
			})
			reports = append(reports, providerConfigReport{
				Provider:             "razorpay",
				Configured:           len(missing) == 0,
				Missing:              missing,
				BaseURL:              cfg.Razorpay.BaseURL,
				StatusCheckAvailable: cfg.Razorpay.KeyID != "" && cfg.Razorpay.KeySecret != "",
				WebhookConfigured:    cfg.Razorpay.WebhookSecret != "",
			})
		case "phonepe":
			missing := missingKeys(map[string]string{
				"payments.phonepe_client_id":        cfg.PhonePe.ClientID,
				"payments.phonepe_client_secret":    cfg.PhonePe.ClientSecret,
				"payments.public_base_url":          cfg.PhonePe.PublicBaseURL,
				"payments.phonepe_webhook_username": cfg.PhonePe.WebhookUsername,
				"payments.phonepe_webhook_password": cfg.PhonePe.WebhookPassword,
			})
			reports = append(reports, providerConfigReport{
				Provider:             "phonepe",
				Configured:           len(missing) == 0,
				Missing:              missing,
				BaseURL:              cfg.PhonePe.BaseURL,
				AuthBaseURL:          cfg.PhonePe.AuthBaseURL,
				StatusCheckAvailable: cfg.PhonePe.ClientID != "" && cfg.PhonePe.ClientSecret != "" && cfg.PhonePe.BaseURL != "",
				WebhookConfigured:    cfg.PhonePe.WebhookUsername != "" && cfg.PhonePe.WebhookPassword != "",
			})
		}
	}
	return reports
}

func missingKeys(values map[string]string) []string {
	out := []string{}
	for key, value := range values {
		if strings.TrimSpace(value) == "" {
			out = append(out, key)
		}
	}
	return out
}

func providerConfigIssues(configs []providerConfigReport) []dryRunIssue {
	issues := []dryRunIssue{}
	for _, cfg := range configs {
		if cfg.Configured {
			continue
		}
		issues = append(issues, dryRunIssue{
			Severity: "error",
			Code:     "provider_not_configured",
			Message:  fmt.Sprintf("%s is missing required settings: %s", cfg.Provider, strings.Join(cfg.Missing, ", ")),
		})
	}
	return issues
}

func fetchDatabasePreflight(ctx context.Context, pool *pgxpool.Pool) (databasePreflight, error) {
	var out databasePreflight
	if err := pool.QueryRow(ctx, `
		SELECT
		    (SELECT COUNT(*) FROM subscription_plan_versions WHERE status IN ('approved', 'published'))::bigint,
		    (SELECT COUNT(*) FROM billing_product_versions WHERE status IN ('approved', 'published') AND active = TRUE AND archived_at IS NULL)::bigint,
		    (SELECT COUNT(*) FROM subscriptions WHERE status IN ('active', 'trialing', 'past_due') AND (plan_version_id IS NULL OR catalog_snapshot IS NULL))::bigint,
		    (SELECT COUNT(*) FROM subscription_upgrade_orders WHERE status IN ('pending', 'paid') AND catalog_snapshot IS NULL)::bigint,
		    (SELECT COUNT(*) FROM billing_orders WHERE status IN ('pending', 'failed'))::bigint,
		    (SELECT COUNT(*) FROM subscription_upgrade_orders WHERE status IN ('pending', 'failed'))::bigint`,
	).Scan(
		&out.ApprovedPlanVersions,
		&out.ApprovedProductVersions,
		&out.SubscriptionsMissingSnapshot,
		&out.SubscriptionOrdersMissingSnapshot,
		&out.PendingBillingOrders,
		&out.PendingSubscriptionOrders,
	); err != nil {
		return out, err
	}
	return out, nil
}

func loadOrders(ctx context.Context, pool *pgxpool.Pool, opts cliOptions, providers []string) ([]settlementOrder, error) {
	if strings.TrimSpace(opts.OrderID) != "" {
		order, found, err := loadOrderByID(ctx, pool, opts.OrderID, opts.OrderTable)
		if err != nil {
			return nil, err
		}
		if !found {
			return nil, fmt.Errorf("order %q not found", opts.OrderID)
		}
		if !providerAllowed(order.Provider, providers) {
			return nil, fmt.Errorf("order provider %q does not match --provider=%s", order.Provider, opts.Provider)
		}
		return []settlementOrder{order}, nil
	}

	providerList := strings.Join(providers, ",")
	rows, err := pool.Query(ctx, `
		SELECT id, source_table, workspace_id, provider, provider_order_id,
		       COALESCE(provider_payment_id, ''), order_type, target_type, target_id,
		       status, amount_paise, currency, from_tier, to_tier, billing_interval,
		       COALESCE(catalog_snapshot, '{}'::jsonb), created_at
		FROM (
		    SELECT id, 'billing_orders'::text AS source_table, workspace_id, provider,
		           provider_order_id, provider_payment_id, order_type, target_type, target_id,
		           status, amount_paise, currency, ''::text AS from_tier, ''::text AS to_tier,
		           ''::text AS billing_interval, catalog_snapshot, created_at
		    FROM billing_orders
		    WHERE status IN ('pending', 'failed')
		      AND ($1 = 'all' OR provider = ANY(string_to_array($1, ',')))
		    UNION ALL
		    SELECT id, 'subscription_upgrade_orders'::text AS source_table, workspace_id, provider,
		           provider_order_id, COALESCE(provider_payment_id, razorpay_payment_id, ''),
		           COALESCE(order_type, 'subscription_upgrade') AS order_type,
		           'workspace'::text AS target_type, workspace_id AS target_id,
		           status, amount_paise, 'INR'::text AS currency, from_tier, to_tier,
		           COALESCE(billing_interval, 'monthly'), COALESCE(catalog_snapshot, '{}'::jsonb),
		           created_at
		    FROM subscription_upgrade_orders
		    WHERE status IN ('pending', 'failed')
		      AND ($1 = 'all' OR provider = ANY(string_to_array($1, ',')))
		) orders
		ORDER BY created_at DESC
		LIMIT $2`,
		providerListForQuery(providerList), opts.Limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanSettlementOrders(rows)
}

func providerListForQuery(value string) string {
	if value == "razorpay,phonepe" || value == "" {
		return "all"
	}
	return value
}

func loadOrderByID(ctx context.Context, pool *pgxpool.Pool, orderID, table string) (settlementOrder, bool, error) {
	if table == "" || table == "auto" || table == "billing_orders" {
		order, found, err := loadBillingOrderByID(ctx, pool, orderID)
		if err != nil || found || table == "billing_orders" {
			return order, found, err
		}
	}
	if table == "" || table == "auto" || table == "subscription_upgrade_orders" {
		return loadSubscriptionOrderByID(ctx, pool, orderID)
	}
	return settlementOrder{}, false, fmt.Errorf("unsupported --order-table %q", table)
}

func loadBillingOrderByID(ctx context.Context, pool *pgxpool.Pool, orderID string) (settlementOrder, bool, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, 'billing_orders'::text AS source_table, workspace_id, provider, provider_order_id,
		       COALESCE(provider_payment_id, ''), order_type, target_type, target_id,
		       status, amount_paise, currency, ''::text AS from_tier, ''::text AS to_tier,
		       ''::text AS billing_interval, catalog_snapshot, created_at
		FROM billing_orders
		WHERE id::text = $1 OR provider_order_id = $1
		LIMIT 1`,
		strings.TrimSpace(orderID),
	)
	if err != nil {
		return settlementOrder{}, false, err
	}
	defer rows.Close()
	orders, err := scanSettlementOrders(rows)
	if err != nil {
		return settlementOrder{}, false, err
	}
	if len(orders) == 0 {
		return settlementOrder{}, false, nil
	}
	return orders[0], true, nil
}

func loadSubscriptionOrderByID(ctx context.Context, pool *pgxpool.Pool, orderID string) (settlementOrder, bool, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, 'subscription_upgrade_orders'::text AS source_table, workspace_id, provider,
		       provider_order_id, COALESCE(provider_payment_id, razorpay_payment_id, ''),
		       COALESCE(order_type, 'subscription_upgrade') AS order_type,
		       'workspace'::text AS target_type, workspace_id AS target_id,
		       status, amount_paise, 'INR'::text AS currency, from_tier, to_tier,
		       COALESCE(billing_interval, 'monthly'), COALESCE(catalog_snapshot, '{}'::jsonb),
		       created_at
		FROM subscription_upgrade_orders
		WHERE id::text = $1 OR provider_order_id = $1 OR razorpay_order_id = $1
		LIMIT 1`,
		strings.TrimSpace(orderID),
	)
	if err != nil {
		return settlementOrder{}, false, err
	}
	defer rows.Close()
	orders, err := scanSettlementOrders(rows)
	if err != nil {
		return settlementOrder{}, false, err
	}
	if len(orders) == 0 {
		return settlementOrder{}, false, nil
	}
	return orders[0], true, nil
}

func scanSettlementOrders(rows pgx.Rows) ([]settlementOrder, error) {
	orders := []settlementOrder{}
	for rows.Next() {
		var order settlementOrder
		var targetID *uuid.UUID
		if err := rows.Scan(
			&order.ID,
			&order.SourceTable,
			&order.WorkspaceID,
			&order.Provider,
			&order.ProviderOrderID,
			&order.ProviderPaymentID,
			&order.OrderType,
			&order.TargetType,
			&targetID,
			&order.Status,
			&order.AmountPaise,
			&order.Currency,
			&order.FromTier,
			&order.ToTier,
			&order.BillingInterval,
			&order.CatalogSnapshot,
			&order.CreatedAt,
		); err != nil {
			return nil, err
		}
		order.TargetID = targetID
		orders = append(orders, order)
	}
	return orders, rows.Err()
}

func providerAllowed(provider string, providers []string) bool {
	for _, allowed := range providers {
		if strings.EqualFold(provider, allowed) {
			return true
		}
	}
	return false
}

func buildOrderDryRun(ctx context.Context, order settlementOrder, checkProvider bool, cfg paymentConfig) orderDryRun {
	snapshot := validateCatalogSnapshot(order)
	out := orderDryRun{
		ID:              order.ID,
		SourceTable:     order.SourceTable,
		Provider:        order.Provider,
		ProviderOrderID: order.ProviderOrderID,
		OrderType:       order.OrderType,
		Status:          order.Status,
		AmountPaise:     order.AmountPaise,
		Currency:        order.Currency,
		WorkspaceID:     order.WorkspaceID,
		TargetType:      order.TargetType,
		TargetID:        order.TargetID,
		CreatedAt:       order.CreatedAt,
		SnapshotSchema:  snapshot.Schema,
		SnapshotValid:   len(snapshot.Issues) == 0,
		ExpectedActions: settlementActions(order),
		Issues:          append([]dryRunIssue{}, snapshot.Issues...),
	}
	if order.Status == "paid" {
		out.SettlementAlreadyApplied = true
	}
	if order.Status == "pending" || order.Status == "failed" {
		out.SettlementWouldRun = !checkProvider
	}
	if checkProvider {
		status := checkGatewayStatus(ctx, order, cfg)
		out.ProviderStatus = &status
		if status.CheckError != "" {
			out.Issues = append(out.Issues, dryRunIssue{Severity: "error", Code: "provider_status_failed", Message: status.CheckError})
		}
		switch normalizedProviderState(status.State) {
		case "completed", "paid", "captured":
			out.SettlementWouldRun = order.Status != "paid"
			if status.AmountPaise > 0 && status.AmountPaise != order.AmountPaise {
				out.Issues = append(out.Issues, dryRunIssue{
					Severity: "error",
					Code:     "provider_amount_mismatch",
					Message:  fmt.Sprintf("provider amount %d does not match RawDrive order amount %d", status.AmountPaise, order.AmountPaise),
				})
				out.SettlementWouldRun = false
			}
		case "pending":
			out.SettlementWouldRun = false
		case "failed", "cancelled", "expired":
			out.SettlementWouldRun = false
		}
	}
	return out
}

type snapshotValidation struct {
	Schema string
	Issues []dryRunIssue
}

func validateCatalogSnapshot(order settlementOrder) snapshotValidation {
	out := snapshotValidation{Issues: []dryRunIssue{}}
	if len(order.CatalogSnapshot) == 0 || string(order.CatalogSnapshot) == "{}" {
		out.Issues = append(out.Issues, dryRunIssue{
			Severity: "error",
			Code:     "missing_catalog_snapshot",
			Message:  fmt.Sprintf("%s order %s has no immutable catalog snapshot", order.SourceTable, order.ID),
		})
		return out
	}
	var decoded map[string]any
	if err := json.Unmarshal(order.CatalogSnapshot, &decoded); err != nil {
		out.Issues = append(out.Issues, dryRunIssue{
			Severity: "error",
			Code:     "invalid_catalog_snapshot",
			Message:  fmt.Sprintf("catalog snapshot is not valid JSON: %v", err),
		})
		return out
	}
	if schema, ok := decoded["snapshot_schema"].(string); ok {
		out.Schema = schema
	}
	if out.Schema == "" {
		out.Issues = append(out.Issues, dryRunIssue{
			Severity: "error",
			Code:     "missing_snapshot_schema",
			Message:  "catalog snapshot is missing snapshot_schema",
		})
	}
	if billing, ok := decoded["billing"].(map[string]any); ok {
		if snapAmount, ok := jsonNumberAsInt64(billing["amount_paise"]); ok && snapAmount != order.AmountPaise {
			out.Issues = append(out.Issues, dryRunIssue{
				Severity: "error",
				Code:     "snapshot_amount_mismatch",
				Message:  fmt.Sprintf("snapshot billing.amount_paise=%d does not match order amount=%d", snapAmount, order.AmountPaise),
			})
		}
	} else {
		out.Issues = append(out.Issues, dryRunIssue{
			Severity: "error",
			Code:     "missing_snapshot_billing",
			Message:  "catalog snapshot is missing billing block",
		})
	}
	return out
}

func jsonNumberAsInt64(value any) (int64, bool) {
	switch v := value.(type) {
	case float64:
		return int64(v), true
	case int64:
		return v, true
	case int:
		return int64(v), true
	case json.Number:
		n, err := v.Int64()
		return n, err == nil
	default:
		return 0, false
	}
}

func settlementActions(order settlementOrder) []string {
	switch order.OrderType {
	case "subscription_renewal":
		return []string{
			"mark subscription upgrade order paid with provider payment id",
			"extend active subscription expiry from current future expiry or now",
			"preserve catalog_snapshot and plan_version_id on the subscription",
			"cancel stale workspace lifecycle jobs",
			"schedule payment-success, renewal, expiry, deletion, gallery-delete, and account-delete jobs",
		}
	case "subscription_upgrade":
		return []string{
			"mark subscription upgrade order paid with provider payment id",
			"update workspace plan tier and storage quota",
			"churn previous active subscription and insert the new active subscription",
			"preserve catalog_snapshot and plan_version_id on the subscription",
			"schedule payment-success, renewal, expiry, deletion, gallery-delete, and account-delete jobs",
		}
	case "storage_booster":
		return []string{
			"mark billing order paid with provider payment id",
			"insert an active workspace_storage_boosters row",
			"increase workspace_storage quota_bytes",
			"schedule storage_booster_expire safe-reduction job",
			"schedule payment-success email proof job",
		}
	case "gallery_extension":
		return []string{
			"mark billing order paid with provider payment id",
			"extend or clear gallery expiry based on the immutable product snapshot",
			"cancel stale gallery lifecycle jobs",
			"schedule expiry warning, deletion warning, gallery-delete, account-delete, and payment-success jobs",
		}
	case "event_upload":
		return []string{
			"mark billing order paid with provider payment id",
			"activate pay-per-event gallery window",
			"grant upload credits through upload_purchases and upload_ledger_entries",
			"schedule expiry warning, conversion prompt, deletion warning, gallery-delete, account-delete, and payment-success jobs",
		}
	default:
		return []string{"unsupported order type; real settlement would fail before mutation"}
	}
}

func checkGatewayStatus(ctx context.Context, order settlementOrder, cfg paymentConfig) providerStatus {
	switch order.Provider {
	case "razorpay":
		return checkRazorpayStatus(ctx, order, cfg.Razorpay)
	case "phonepe":
		return checkPhonePeStatus(ctx, order, cfg.PhonePe)
	default:
		return providerStatus{Checked: false, CheckError: "unsupported provider " + order.Provider}
	}
}

func checkRazorpayStatus(ctx context.Context, order settlementOrder, cfg razorpayConfig) providerStatus {
	status := providerStatus{Checked: true}
	if cfg.KeyID == "" || cfg.KeySecret == "" {
		status.CheckError = "razorpay key id/secret missing"
		return status
	}
	if order.ProviderOrderID == "" {
		status.CheckError = "order has no provider_order_id"
		return status
	}
	url := strings.TrimRight(cfg.BaseURL, "/") + "/v1/orders/" + order.ProviderOrderID
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		status.CheckError = err.Error()
		return status
	}
	req.SetBasicAuth(cfg.KeyID, cfg.KeySecret)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		status.CheckError = err.Error()
		return status
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64*1024))
	if resp.StatusCode >= 400 {
		status.CheckError = fmt.Sprintf("razorpay status HTTP %d", resp.StatusCode)
		return status
	}
	var decoded struct {
		Status     string `json:"status"`
		Amount     int64  `json:"amount"`
		AmountPaid int64  `json:"amount_paid"`
	}
	if err := json.Unmarshal(body, &decoded); err != nil {
		status.CheckError = "razorpay status JSON parse failed: " + err.Error()
		return status
	}
	status.State = strings.ToLower(decoded.Status)
	status.AmountPaise = decoded.Amount
	if decoded.AmountPaid > 0 {
		status.AmountPaise = decoded.AmountPaid
	}
	status.RawSummary = "razorpay order " + decoded.Status
	return status
}

func checkPhonePeStatus(ctx context.Context, order settlementOrder, cfg phonePeConfig) providerStatus {
	status := providerStatus{Checked: true}
	if cfg.ClientID == "" || cfg.ClientSecret == "" || cfg.BaseURL == "" {
		status.CheckError = "phonepe client id/secret/base URL missing"
		return status
	}
	client := handler.NewPhonePeV2Client(handler.PhonePeV2Config{
		ClientID:      cfg.ClientID,
		ClientSecret:  cfg.ClientSecret,
		ClientVersion: cfg.ClientVersion,
		BaseURL:       cfg.BaseURL,
		AuthBaseURL:   cfg.AuthBaseURL,
	})
	if client == nil {
		status.CheckError = "phonepe client could not be constructed"
		return status
	}
	out, err := client.FetchOrderStatus(ctx, order.ID.String())
	if err != nil {
		status.CheckError = err.Error()
		return status
	}
	status.State = out.State
	status.AmountPaise = out.Amount
	status.PaymentID = out.PrimaryTransaction
	status.ErrorCode = firstNonEmptyString(out.DetailedErrorCode, out.ErrorCode)
	status.RawSummary = "phonepe order " + out.State
	return status
}

func normalizedProviderState(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "completed", "paid", "captured":
		return strings.ToLower(strings.TrimSpace(value))
	case "created", "attempted", "pending":
		return "pending"
	case "failed", "cancelled", "canceled", "expired":
		return strings.ToLower(strings.TrimSpace(value))
	default:
		return ""
	}
}

func hasBlockingIssues(issues []dryRunIssue) bool {
	for _, issue := range issues {
		if issue.Severity == "error" {
			return true
		}
	}
	return false
}

func printHumanReport(w io.Writer, report dryRunReport) {
	fmt.Fprintf(w, "RawDrive gateway settlement dry-run\n")
	fmt.Fprintf(w, "Generated: %s\n", report.GeneratedAt.Format(time.RFC3339))
	fmt.Fprintf(w, "Mutates DB: %t\n\n", report.MutatesDB)

	fmt.Fprintln(w, "Gateway configuration")
	for _, cfg := range report.Config {
		state := "ready"
		if !cfg.Configured {
			state = "missing"
		}
		fmt.Fprintf(w, "- %s: %s", cfg.Provider, state)
		if len(cfg.Missing) > 0 {
			fmt.Fprintf(w, " (%s)", strings.Join(cfg.Missing, ", "))
		}
		fmt.Fprintln(w)
	}
	if report.Database != nil {
		fmt.Fprintln(w, "\nDatabase preflight")
		fmt.Fprintf(w, "- approved plan versions: %d\n", report.Database.ApprovedPlanVersions)
		fmt.Fprintf(w, "- approved product versions: %d\n", report.Database.ApprovedProductVersions)
		fmt.Fprintf(w, "- subscriptions missing snapshots: %d\n", report.Database.SubscriptionsMissingSnapshot)
		fmt.Fprintf(w, "- subscription orders missing snapshots: %d\n", report.Database.SubscriptionOrdersMissingSnapshot)
		fmt.Fprintf(w, "- pending billing orders: %d\n", report.Database.PendingBillingOrders)
		fmt.Fprintf(w, "- pending subscription orders: %d\n", report.Database.PendingSubscriptionOrders)
	}
	if len(report.Orders) > 0 {
		fmt.Fprintln(w, "\nOrders")
		for _, order := range report.Orders {
			fmt.Fprintf(w, "- %s %s %s %s amount=%d snapshot=%t would_settle=%t\n",
				order.SourceTable, order.ID, order.Provider, order.Status,
				order.AmountPaise, order.SnapshotValid, order.SettlementWouldRun,
			)
			if order.ProviderStatus != nil {
				fmt.Fprintf(w, "  provider status: state=%s payment=%s amount=%d error=%s\n",
					order.ProviderStatus.State,
					order.ProviderStatus.PaymentID,
					order.ProviderStatus.AmountPaise,
					order.ProviderStatus.CheckError,
				)
			}
			for _, action := range order.ExpectedActions {
				fmt.Fprintf(w, "  would: %s\n", action)
			}
			for _, issue := range order.Issues {
				fmt.Fprintf(w, "  %s[%s]: %s\n", issue.Severity, issue.Code, issue.Message)
			}
		}
	}
	if len(report.Issues) > 0 {
		fmt.Fprintln(w, "\nIssues")
		for _, issue := range report.Issues {
			fmt.Fprintf(w, "- %s[%s]: %s\n", issue.Severity, issue.Code, issue.Message)
		}
	}
}
