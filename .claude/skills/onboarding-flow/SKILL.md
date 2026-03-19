---
name: onboarding-flow
description: "User onboarding and registration patterns for RawDrive: signup flow, workspace creation, trial setup, onboarding wizard, the onboarding-service microservice (port 8006), feature tours, and first-run experiences. Use this skill when implementing registration flows, workspace provisioning, trial management, onboarding step tracking, welcome sequences, or the onboarding-service. Also use for user activation funnels, progressive onboarding, and time-to-value optimization. Triggers on: onboarding, registration, signup, sign up, workspace creation, trial, onboarding wizard, welcome, first-run, activation, onboarding-service, user provisioning, getting started, setup wizard."
---

# Onboarding Flow Patterns

The onboarding-service (port 8006) manages registration, workspace provisioning, trial setup, and guided first-run experiences to minimize time-to-value.

## Service Architecture

```
services/onboarding-service/src/
├── api/v1/
│   ├── registration.py      # Signup, email verification
│   ├── onboarding.py        # Wizard steps, progress tracking
│   └── workspace_setup.py   # Workspace provisioning
├── services/
│   ├── registration_service.py    # User + workspace creation
│   ├── onboarding_service.py      # Step management
│   ├── trial_service.py           # Trial provisioning + limits
│   └── provisioning_service.py    # Default data seeding
├── schemas/
└── config.py
```

## Registration Flow

```
User clicks "Sign Up"
    │
    ├── 1. Collect: email, password, name, business type
    ├── 2. Create user account
    ├── 3. Send verification email
    ├── 4. User verifies email
    ├── 5. Create workspace
    ├── 6. Provision trial plan
    ├── 7. Seed default data (sample gallery, templates)
    ├── 8. Start onboarding wizard
    └── 9. Track activation milestones
```

```python
class RegistrationService:
    async def register(self, data: RegistrationRequest) -> RegistrationResponse:
        # 1. Validate (unique email, password strength)
        await self._validate_registration(data)

        # 2. Create user
        user = await self.user_repo.create(
            email=data.email,
            password_hash=hash_password(data.password),
            name=data.name,
        )

        # 3. Create workspace
        workspace = await self.workspace_repo.create(
            name=data.business_name or f"{data.name}'s Studio",
            owner_id=user.id,
            business_type=data.business_type,
        )

        # 4. Assign owner role
        await self.role_repo.assign(user.id, workspace.id, Role.OWNER)

        # 5. Provision trial
        await self.trial_service.start_trial(
            workspace_id=workspace.id,
            plan=TrialPlan.PROFESSIONAL,
            duration_days=14,
        )

        # 6. Seed default data
        await self.provisioning_service.seed_defaults(workspace.id)

        # 7. Send verification email
        await self.email_service.send_verification(user.email, user.id)

        # 8. Initialize onboarding progress
        await self.onboarding_service.initialize(user.id, workspace.id)

        return RegistrationResponse(user_id=user.id, workspace_id=workspace.id)
```

## Onboarding Wizard Steps

```python
class OnboardingStep(str, Enum):
    VERIFY_EMAIL = "verify_email"
    COMPLETE_PROFILE = "complete_profile"       # Avatar, bio, website
    UPLOAD_FIRST_PHOTOS = "upload_first_photos"  # Upload at least 5 photos
    CREATE_GALLERY = "create_gallery"            # Create first gallery
    CUSTOMIZE_DESIGN = "customize_design"        # Use Design Studio
    SHARE_GALLERY = "share_gallery"              # Generate share link
    INVITE_CLIENT = "invite_client"              # Optional: invite first client

class OnboardingService:
    async def get_progress(
        self, user_id: UUID, workspace_id: UUID
    ) -> OnboardingProgress:
        steps = await self.onboarding_repo.get_steps(user_id, workspace_id)
        return OnboardingProgress(
            steps=steps,
            completed=sum(1 for s in steps if s.completed),
            total=len(steps),
            current_step=next((s for s in steps if not s.completed), None),
        )

    async def complete_step(
        self, user_id: UUID, workspace_id: UUID, step: OnboardingStep
    ) -> OnboardingProgress:
        await self.onboarding_repo.mark_complete(user_id, workspace_id, step)
        # Check for activation milestone
        progress = await self.get_progress(user_id, workspace_id)
        if progress.completed >= 4:  # "Activated" threshold
            await self._mark_activated(user_id, workspace_id)
        return progress
```

## Trial Management

```python
class TrialService:
    async def start_trial(
        self, workspace_id: UUID, plan: TrialPlan, duration_days: int = 14
    ) -> Trial:
        trial = Trial(
            workspace_id=workspace_id,
            plan=plan,
            starts_at=datetime.utcnow(),
            expires_at=datetime.utcnow() + timedelta(days=duration_days),
            status=TrialStatus.ACTIVE,
            limits=self._get_trial_limits(plan),
        )
        return trial

    def _get_trial_limits(self, plan: TrialPlan) -> dict:
        return {
            "storage_gb": 5,
            "galleries": 3,
            "ai_credits": 50,
            "team_members": 1,
        }

    async def check_trial_status(self, workspace_id: UUID) -> TrialStatus:
        trial = await self.trial_repo.get_active(workspace_id)
        if not trial:
            return TrialStatus.NONE
        if trial.expires_at < datetime.utcnow():
            await self._expire_trial(trial)
            return TrialStatus.EXPIRED
        return TrialStatus.ACTIVE
```

## Default Data Seeding

```python
class ProvisioningService:
    async def seed_defaults(self, workspace_id: UUID):
        """Seed workspace with sample data so it's not empty on first login."""
        # 1. Sample gallery with placeholder images
        # 2. Default design templates
        # 3. Default notification preferences
        # 4. Default watermark settings
        # This reduces "blank slate" anxiety and shows the product's capabilities
```

## Frontend Onboarding Components

```typescript
// Key components:
// OnboardingWizard — step-by-step guide with progress bar
// WelcomeModal — first-login welcome with quick tour
// FeatureSpotlight — contextual tooltips highlighting features
// ProgressChecklist — persistent sidebar showing remaining steps
// TrialBanner — countdown showing days remaining + upgrade CTA

// Track onboarding progress
function useOnboarding() {
  return useQuery({
    queryKey: ['onboarding', 'progress'],
    queryFn: () => api.get('/onboarding/progress'),
  });
}
```
