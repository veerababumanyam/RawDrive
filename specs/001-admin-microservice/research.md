# Research: Admin Microservice Architecture

**Feature**: Admin Microservice
**Date**: 2025-12-27
**Status**: Complete

This document consolidates research findings for technical decisions in the Admin Microservice implementation.

---

## 1. TOTP MFA Integration

**Decision**: Use `pyotp` library for TOTP generation and verification

**Rationale**:
- Python-native, well-maintained library
- Compatible with Google Authenticator, Authy, and other standard TOTP apps
- Simpler than speakeasy (Node.js library mentioned in spec assumptions)
- Since admin-service is Python/FastAPI, pyotp is the natural choice

**Alternatives Considered**:
- `speakeasy` (Node.js) - Would require Node.js service or different approach
- Custom TOTP implementation - Unnecessary complexity, security risk

**Implementation Pattern**:
```python
import pyotp

# Setup: Generate secret for admin
secret = pyotp.random_base32()
totp = pyotp.TOTP(secret)
provisioning_uri = totp.provisioning_uri(email, issuer_name="RawDrive Admin")

# Verification
is_valid = totp.verify(user_provided_code, valid_window=1)  # Allow 30s drift
```

**Backup Codes**:
- Generate 10 one-time backup codes at MFA setup
- Store hashed (bcrypt) in `admin_platform_admins.backup_codes_hashed`
- Consume and remove on use

---

## 2. Session Binding (FR-086)

**Decision**: Use device fingerprint hash + IP CIDR range validation

**Rationale**:
- Device fingerprint provides persistent identity across sessions
- IP CIDR (/24 for IPv4) allows for minor network changes (DHCP, mobile)
- Significant changes (different /16 or fingerprint) trigger re-authentication
- Balance between security and usability

**Implementation Pattern**:
```python
from dataclasses import dataclass
import hashlib
import ipaddress

@dataclass
class SessionBinding:
    device_fingerprint_hash: str  # SHA-256 of client-provided fingerprint
    ip_network: str  # /24 CIDR for the original IP

    @classmethod
    def from_request(cls, fingerprint: str, ip: str) -> "SessionBinding":
        fp_hash = hashlib.sha256(fingerprint.encode()).hexdigest()
        network = str(ipaddress.ip_network(f"{ip}/24", strict=False))
        return cls(device_fingerprint_hash=fp_hash, ip_network=network)

    def validate(self, fingerprint: str, ip: str) -> tuple[bool, str]:
        current_fp = hashlib.sha256(fingerprint.encode()).hexdigest()
        current_network = str(ipaddress.ip_network(f"{ip}/24", strict=False))

        if current_fp != self.device_fingerprint_hash:
            return False, "device_changed"
        if current_network != self.ip_network:
            return False, "ip_range_changed"
        return True, "valid"
```

**Frontend Fingerprinting**:
- Use `@fingerprintjs/fingerprintjs` library (existing frontend pattern)
- Send fingerprint hash in `X-Device-Fingerprint` header

---

## 3. Break-Glass Dual Control

**Decision**: Implement async approval workflow with real-time notification

**Rationale**:
- Dual control (two-person authorization) is industry standard for emergency access
- Async approval allows second admin to be remote
- Real-time alerts ensure awareness across all Super Admins
- 1-hour max session prevents forgotten open sessions

**Implementation Pattern**:
```python
class BreakGlassService:
    async def request_break_glass(
        self,
        initiator_id: UUID,
        reason: str
    ) -> BreakGlassRequest:
        # 1. Create pending request
        request = await self._create_request(initiator_id, reason)

        # 2. Notify all other Super Admins via all channels
        other_super_admins = await self._get_other_super_admins(initiator_id)
        await self.notification_service.send_critical_alert(
            recipients=other_super_admins,
            event="break_glass_requested",
            data={"request_id": request.id, "initiator": initiator_id, "reason": reason}
        )

        # 3. Publish event for real-time dashboard update
        await self.event_bus.publish("admin:alerts", {
            "type": "admin.break_glass_requested",
            "request_id": str(request.id),
            "initiator_id": str(initiator_id),
            "reason": reason,
        })

        return request

    async def approve_break_glass(
        self,
        request_id: UUID,
        approver_id: UUID
    ) -> BreakGlassSession:
        request = await self._get_request(request_id)

        # Validate: approver cannot be initiator
        if request.initiator_id == approver_id:
            raise PermissionError("Cannot approve your own break-glass request")

        # Create session with 1-hour expiry (no extension)
        session = await self._create_session(
            request=request,
            approver_id=approver_id,
            expires_at=datetime.now(UTC) + timedelta(hours=1)
        )

        # Notify all Super Admins
        await self.notification_service.send_critical_alert(
            recipients=await self._get_all_super_admins(),
            event="break_glass_activated",
            data={"session_id": session.id, "initiator": request.initiator_id}
        )

        return session
```

**Edge Case (EC-012)**: If no second Super Admin is available:
- System maintains pre-configured emergency contact list
- Out-of-band approval via secure channel (phone + verification code)
- Logged as "emergency_override" with additional audit detail

---

## 4. Audit Log Partitioning

**Decision**: PostgreSQL native range partitioning by month

**Rationale**:
- RawDrive already uses PostgreSQL 16
- Native partitioning is well-supported and performant
- Monthly partitions balance query performance and maintenance
- Supports 2-year retention with easy archive/drop

**Implementation Pattern**:
```sql
-- Create partitioned table
CREATE TABLE admin_audit_logs (
    log_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    admin_id UUID NOT NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    details JSONB,
    ip_address INET,
    session_type VARCHAR(20)  -- 'normal', 'support', 'break_glass'
) PARTITION BY RANGE (created_at);

-- Create partitions (script runs monthly via cron)
CREATE TABLE admin_audit_logs_2025_01 PARTITION OF admin_audit_logs
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Indexes on each partition (created automatically)
CREATE INDEX idx_audit_admin_created ON admin_audit_logs (admin_id, created_at);
CREATE INDEX idx_audit_action_created ON admin_audit_logs (action, created_at);
CREATE INDEX idx_audit_resource ON admin_audit_logs (resource_type, resource_id, created_at);
```

**Retention Strategy**:
- Partitions older than 2 years: archive to cold storage (S3), then drop
- Archival job runs weekly
- 7-year archive retention for compliance (FR-105)

---

## 5. Feature Flag SDK

**Decision**: Thin Python SDK with Redis caching + event-driven invalidation

**Rationale**:
- Follows existing caching patterns in RawDrive
- 30-second TTL balances consistency and performance
- Event-driven invalidation for immediate propagation
- Hardcoded defaults for circuit-breaker fallback

**Implementation Pattern**:
```python
# admin-service/src/sdk/feature_flags.py
class FeatureFlagClient:
    def __init__(self, admin_service_url: str, redis: Redis):
        self._url = admin_service_url
        self._redis = redis
        self._local_cache: dict[str, FlagValue] = {}
        self._defaults: dict[str, bool] = {}  # Hardcoded fallbacks

    async def is_enabled(
        self,
        flag_key: str,
        user_id: str | None = None,
        workspace_id: str | None = None
    ) -> bool:
        cache_key = f"ff:{flag_key}:{user_id or ''}:{workspace_id or ''}"

        # 1. Check local cache (in-memory, refreshed on event)
        if cache_key in self._local_cache:
            return self._local_cache[cache_key].enabled

        # 2. Check Redis cache
        cached = await self._redis.get(cache_key)
        if cached:
            return json.loads(cached)["enabled"]

        # 3. Call admin service
        try:
            result = await self._evaluate_flag(flag_key, user_id, workspace_id)
            await self._redis.setex(cache_key, 30, json.dumps(result))
            return result["enabled"]
        except Exception:
            # 4. Circuit breaker: return hardcoded default
            return self._defaults.get(flag_key, False)

    async def subscribe_to_changes(self):
        """Subscribe to Redis pub/sub for flag changes."""
        async for message in self._redis.subscribe("admin:events"):
            if message["type"] == "admin.feature_flag_change":
                # Invalidate local cache for this flag
                flag_key = message["data"]["flag_key"]
                self._invalidate_flag(flag_key)
```

---

## 6. Service-to-Service Auth

**Decision**: Signed JWT service tokens (not mTLS)

**Rationale**:
- Simpler than mTLS for Docker Compose / Kubernetes internal network
- Consistent with existing JWT infrastructure
- Service tokens have long TTL (24 hours) and limited scope
- HMAC-SHA256 signing with shared secret (simpler than asymmetric for internal)

**Implementation Pattern**:
```python
# Service token generation (admin-service startup)
def create_service_token(service_name: str, secret: str) -> str:
    payload = {
        "sub": service_name,
        "iss": "admin-service",
        "aud": "rawdrive-internal",
        "iat": datetime.now(UTC),
        "exp": datetime.now(UTC) + timedelta(hours=24),
        "scope": ["internal:read", "internal:write"]
    }
    return jwt.encode(payload, secret, algorithm="HS256")

# Verification middleware in main backend
async def verify_service_token(request: Request):
    token = request.headers.get("X-Service-Token")
    try:
        payload = jwt.decode(token, SERVICE_SECRET, algorithms=["HS256"])
        if payload["aud"] != "rawdrive-internal":
            raise HTTPException(403, "Invalid audience")
        request.state.service_name = payload["sub"]
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Invalid service token")
```

---

## 7. Circuit Breaker Pattern

**Decision**: Reuse existing `CircuitBreaker` class from AI provider integration

**Rationale**:
- Production-tested implementation already in codebase
- Configurable failure threshold, recovery time, half-open testing
- Thread-safe with asyncio locks
- Consistent patterns across services

**Source**: `backend/src/app/services/ai/circuit_breaker.py`

**Configuration for Admin Service**:
```python
backend_breaker = CircuitBreaker(CircuitBreakerConfig(
    failure_threshold=5,      # Open after 5 consecutive failures
    recovery_time_ms=30000,   # Wait 30 seconds before testing
    half_open_requests=2,     # 2 successes to close
    name="main_backend",
))
```

---

## 8. Admin Session Management

**Decision**: Redis-based sessions with 4-hour max TTL, device binding

**Rationale**:
- Shorter TTL than user sessions (7 days) for security
- Aligns with FR-075 requirement
- Extends existing `SessionService` pattern
- Device binding validates on each request

**Implementation Pattern**:
```python
# Admin session key format
def _admin_session_key(session_id: UUID) -> str:
    return f"admin:session:{session_id}"

class AdminSessionService:
    MAX_TTL_SECONDS = 4 * 3600  # 4 hours

    async def create_session(
        self,
        admin_id: UUID,
        device_fingerprint: str,
        ip_address: str,
    ) -> AdminSession:
        session = AdminSession(
            session_id=uuid.uuid4(),
            admin_id=admin_id,
            binding=SessionBinding.from_request(device_fingerprint, ip_address),
            created_at=datetime.now(UTC),
            expires_at=datetime.now(UTC) + timedelta(seconds=self.MAX_TTL_SECONDS),
        )
        await self._redis.setex(
            _admin_session_key(session.session_id),
            self.MAX_TTL_SECONDS,
            session.to_json()
        )
        return session

    async def validate_session(
        self,
        session_id: UUID,
        device_fingerprint: str,
        ip_address: str,
    ) -> AdminSession:
        data = await self._redis.get(_admin_session_key(session_id))
        if not data:
            raise SessionExpiredError()

        session = AdminSession.from_json(data)

        # Validate binding
        valid, reason = session.binding.validate(device_fingerprint, ip_address)
        if not valid:
            await self._invalidate_session(session_id, reason)
            raise SessionBindingError(reason)

        return session
```

---

## 9. Bulk Operation Safety

**Decision**: Rate limiting + batch queuing + progress tracking

**Rationale**:
- Prevents accidental mass actions (FR-063)
- Allows cancellation mid-operation (EC-014)
- Provides audit trail for each batch
- Existing rate limiter pattern extended for admin operations

**Implementation Pattern**:
```python
# Rate limit for bulk operations: 5 per hour per admin
BULK_RATE_LIMIT = RateLimitConfig(requests=5, window_seconds=3600)

class BulkOperationService:
    MAX_BATCH_SIZE = 100  # FR-061

    async def start_bulk_operation(
        self,
        admin_id: UUID,
        operation_type: str,
        target_ids: list[UUID],
        confirmation_token: str,
    ) -> BulkOperation:
        # 1. Validate confirmation
        if not await self._verify_confirmation(confirmation_token, target_ids):
            raise InvalidConfirmationError()

        # 2. Check rate limit
        if not await self._check_rate_limit(admin_id, "bulk"):
            raise RateLimitExceededError()

        # 3. Create trackable operation
        operation = BulkOperation(
            id=uuid.uuid4(),
            admin_id=admin_id,
            operation_type=operation_type,
            total_count=len(target_ids),
            status="pending",
        )

        # 4. Queue for async processing
        await self._queue.add_job(
            "bulk_operation",
            {"operation_id": operation.id, "target_ids": target_ids},
        )

        return operation

    async def process_batch(self, operation_id: UUID, batch: list[UUID]):
        """Process a single batch, update progress, allow cancellation."""
        operation = await self._get_operation(operation_id)

        if operation.status == "cancelled":
            return  # Stop processing

        for target_id in batch:
            try:
                await self._process_single(operation.operation_type, target_id)
                operation.processed_count += 1
            except Exception as e:
                operation.error_count += 1
                operation.errors.append({"id": target_id, "error": str(e)})

            # Update progress every 10 items
            if operation.processed_count % 10 == 0:
                await self._update_progress(operation)
```

---

## 10. Anomaly Detection (FR-088)

**Decision**: Rule-based detection with configurable thresholds

**Rationale**:
- Simpler than ML for initial implementation
- Configurable rules can evolve without model retraining
- Detects: unusual hours, geographic anomalies, bulk operation velocity
- Alerts to all Super Admins on detection

**Implementation Pattern**:
```python
@dataclass
class AnomalyRule:
    name: str
    check: Callable[[AdminActivity], bool]
    severity: str  # "low", "medium", "high"

ANOMALY_RULES = [
    AnomalyRule(
        name="unusual_hours",
        check=lambda a: a.timestamp.hour < 5 or a.timestamp.hour > 23,
        severity="medium",
    ),
    AnomalyRule(
        name="geographic_anomaly",
        check=lambda a: a.country_code != a.admin.usual_country,
        severity="high",
    ),
    AnomalyRule(
        name="bulk_velocity",
        check=lambda a: a.operations_last_hour > 50,
        severity="medium",
    ),
    AnomalyRule(
        name="privilege_escalation_attempt",
        check=lambda a: a.action == "grant_role" and a.target_role == "super_admin",
        severity="high",
    ),
]

class AnomalyDetector:
    async def check_activity(self, activity: AdminActivity) -> list[Anomaly]:
        anomalies = []
        for rule in ANOMALY_RULES:
            if rule.check(activity):
                anomaly = Anomaly(
                    rule_name=rule.name,
                    severity=rule.severity,
                    activity=activity,
                )
                anomalies.append(anomaly)

                # Publish alert
                await self._publish_alert(anomaly)

        return anomalies
```

---

## 11. DSAR Automation (FR-098-101)

**Decision**: Workflow-based processing with dependency tracking

**Rationale**:
- GDPR/CCPA requires response within 30 days
- Automated collection reduces manual effort
- Dependency checking prevents incomplete erasure
- SLA tracking with alerts at thresholds

**Implementation Pattern**:
```python
class DSARService:
    SLA_DAYS = 30

    async def create_request(
        self,
        request_type: str,  # "access", "erasure", "portability"
        subject_email: str,
        submitted_by: UUID,
    ) -> DSARRequest:
        # 1. Verify subject identity (separate workflow)
        # 2. Create request with SLA deadline
        request = DSARRequest(
            id=uuid.uuid4(),
            type=request_type,
            subject_email=subject_email,
            status="pending_verification",
            sla_deadline=datetime.now(UTC) + timedelta(days=self.SLA_DAYS),
        )

        # 3. Start automated data collection
        await self._queue.add_job("dsar_collect", {"request_id": request.id})

        return request

    async def generate_export(self, request_id: UUID) -> DSARExport:
        """Generate comprehensive data export for access request."""
        request = await self._get_request(request_id)

        # Collect from all sources
        export = DSARExport(request_id=request_id)

        # User profile data
        export.add_section("profile", await self._collect_profile(request.subject_email))

        # Activity logs
        export.add_section("activity", await self._collect_activity(request.subject_email))

        # Workspace memberships
        export.add_section("workspaces", await self._collect_workspaces(request.subject_email))

        # Third-party sharing log
        export.add_section("sharing", await self._collect_sharing_log(request.subject_email))

        # Assets (with presigned URLs)
        export.add_section("assets", await self._collect_assets(request.subject_email))

        return export

    async def process_erasure(self, request_id: UUID) -> ErasureResult:
        """Process right-to-erasure with dependency checking."""
        request = await self._get_request(request_id)

        # 1. Check dependencies
        dependencies = await self._check_dependencies(request.subject_email)
        if dependencies.blocking:
            return ErasureResult(
                status="blocked",
                reason="Active subscriptions or pending payments",
                dependencies=dependencies,
            )

        # 2. Execute erasure workflow
        await self._anonymize_audit_logs(request.subject_email)
        await self._delete_pii(request.subject_email)
        await self._notify_processors(request.subject_email)  # Third-party services

        return ErasureResult(status="completed")
```

---

## 12. Real-time Presence (US-014)

**Decision**: WebSocket with Redis pub/sub for presence broadcasting

**Rationale**:
- Enables concurrent edit detection (US-014, EC-018)
- Existing Redis infrastructure handles pub/sub
- WebSocket for real-time UI updates
- Optimistic locking with version check for actual saves

**Implementation Pattern**:
```python
# WebSocket endpoint
@app.websocket("/ws/presence")
async def presence_websocket(websocket: WebSocket, admin_id: UUID):
    await websocket.accept()

    # Subscribe to resource presence channel
    async def on_presence_update(message):
        await websocket.send_json(message)

    subscriber = await redis.subscribe("admin:presence")

    try:
        while True:
            data = await websocket.receive_json()

            if data["type"] == "join":
                # Broadcast: admin is viewing this resource
                await redis.publish("admin:presence", {
                    "action": "joined",
                    "admin_id": str(admin_id),
                    "resource_type": data["resource_type"],
                    "resource_id": data["resource_id"],
                })

            elif data["type"] == "leave":
                await redis.publish("admin:presence", {
                    "action": "left",
                    "admin_id": str(admin_id),
                    "resource_id": data["resource_id"],
                })
    finally:
        await subscriber.unsubscribe()

# Optimistic locking on save
async def update_feature_flag(
    flag_id: UUID,
    updates: FlagUpdate,
    expected_version: int,
    admin_id: UUID,
) -> FeatureFlag:
    async with db.transaction():
        flag = await db.get(FeatureFlag, flag_id, for_update=True)

        if flag.version != expected_version:
            raise ConflictError(
                current_version=flag.version,
                current_data=flag,
                message="Resource was modified by another admin",
            )

        flag.update(updates)
        flag.version += 1
        flag.updated_by = admin_id

        await db.commit()
        return flag
```

---

## 13. Permission Delegation (FR-095-097)

**Decision**: Time-boxed delegation records with automatic expiration

**Rationale**:
- Vacation coverage without permanent privilege escalation
- Clear audit trail shows both delegator and delegate
- Automatic expiration prevents forgotten delegations
- Notification before expiry (FR-097)

**Implementation Pattern**:
```python
class DelegationService:
    MAX_DELEGATION_DAYS = 30
    EXPIRY_REMINDER_HOURS = 24

    async def create_delegation(
        self,
        delegator_id: UUID,
        delegate_id: UUID,
        permissions: list[str],
        start_at: datetime,
        end_at: datetime,
    ) -> Delegation:
        # Validate
        if (end_at - start_at).days > self.MAX_DELEGATION_DAYS:
            raise ValidationError("Delegation cannot exceed 30 days")

        if not await self._can_delegate(delegator_id, permissions):
            raise PermissionError("Cannot delegate permissions you don't have")

        delegation = Delegation(
            id=uuid.uuid4(),
            delegator_id=delegator_id,
            delegate_id=delegate_id,
            permissions=permissions,
            start_at=start_at,
            end_at=end_at,
            status="active",
        )

        # Notify delegate
        await self.notification_service.send(
            recipient=delegate_id,
            template="delegation_received",
            data={"delegator": delegator_id, "permissions": permissions, "end_at": end_at},
        )

        # Schedule expiry reminder
        await self._queue.add_job(
            "delegation_reminder",
            {"delegation_id": delegation.id},
            delay=end_at - timedelta(hours=self.EXPIRY_REMINDER_HOURS),
        )

        # Schedule automatic revocation
        await self._queue.add_job(
            "delegation_expire",
            {"delegation_id": delegation.id},
            delay=end_at,
        )

        return delegation

    async def get_effective_permissions(self, admin_id: UUID) -> set[str]:
        """Get permissions including delegated ones."""
        base_permissions = await self._get_base_permissions(admin_id)

        # Add active delegations
        delegations = await self._get_active_delegations(admin_id)
        delegated = set()
        for d in delegations:
            delegated.update(d.permissions)

        return base_permissions | delegated
```

---

## Summary

All research topics have been addressed with decisions, rationale, and implementation patterns. Key findings:

| Topic | Decision | Complexity |
|-------|----------|------------|
| MFA | pyotp library | Low |
| Session Binding | Device fingerprint + IP CIDR | Medium |
| Break-Glass | Async dual-control workflow | Medium |
| Audit Partitioning | PostgreSQL range partitioning | Low |
| Feature Flag SDK | Redis cache + event invalidation | Medium |
| Service Auth | Signed JWT service tokens | Low |
| Circuit Breaker | Reuse existing implementation | Low |
| Admin Sessions | Redis with 4-hour TTL | Low |
| Bulk Operations | Rate limiting + async queuing | Medium |
| Anomaly Detection | Rule-based with thresholds | Medium |
| DSAR Automation | Workflow-based processing | High |
| Real-time Presence | WebSocket + Redis pub/sub | Medium |
| Permission Delegation | Time-boxed with auto-expiry | Medium |

**Ready for Phase 1**: All technical decisions are resolved. Proceed to data model and API contract generation.
