# Implementation Plan: Digital Invitation Wizard

**Branch**: `6-invitation-wizard` | **Date**: December 5, 2025 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/6-invitation-wizard/spec.md`

---

## Summary

Build a comprehensive 3-step digital invitation creation wizard for Indian cultural events (weddings, festivals, religious ceremonies) with AI-powered theme generation, smart text suggestions, photo enhancement, background music, and animated frames. The system uses Google Gemini for AI capabilities and a curated royalty-free music library to avoid copyright issues.

## Technical Context

**Language/Version**: PHP 8.5 (Laravel 11), TypeScript/JavaScript (Vue 3)  
**Primary Dependencies**: Laravel Jetstream, Inertia.js, Vue 3, Tailwind CSS, Google Gemini 3 Pro API, Imagen 3, GSAP/Lottie, Howler.js  
**Storage**: MySQL (Laravel Cloud managed), Cloudflare R2 (images, music, animations)  
**Testing**: PHPUnit, Pest, Vitest, Cypress  
**Target Platform**: Web (Desktop/Mobile responsive), Mobile via Inertia SSR  
**Project Type**: Web application (Laravel monolith with Vue 3 frontend)  
**Performance Goals**: 
- Template preview: <2s load
- AI theme generation: <30s
- Music playback start: <2s
- Animation rendering: 60fps
**Constraints**: 
- All music must be pre-licensed (royalty-free)
- AI-generated content must be culturally sensitive
- Graceful degradation on low-performance devices
**Scale/Scope**: 
- 15+ templates at launch
- 100+ music tracks
- 6 animation style categories
- 6 regional languages supported

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| Modular Design | ✅ PASS | Invitation module is self-contained with clear boundaries |
| API-First | ✅ PASS | All invitation operations exposed via Laravel API routes |
| Test Coverage | ✅ PASS | Unit tests for services, Feature tests for endpoints |
| Performance Standards | ✅ PASS | Defined SLAs for preview, AI, music, animations |
| Security | ✅ PASS | Sanctum auth, input validation, licensed content only |
| **Config Management** | ✅ PASS | All secrets/keys via `.env` → `config()`, never hardcoded |
| **WCAG 2.1 AA** | ✅ PASS | Full accessibility compliance required |
| **ISO Standards** | ✅ PASS | ISO 8601 dates, ISO 639-1 languages, ISO 4217 currency |
| **Error Handling** | ✅ PASS | Structured exceptions, error boundaries, graceful degradation |

---

## Coding Standards & Best Practices

### Accessibility (WCAG 2.1 AA Compliance)

| Criterion | Requirement | Implementation |
|-----------|-------------|----------------|
| **1.1.1 Non-text Content** | Alt text for all images | `alt` attributes, `aria-label` for decorative |
| **1.3.1 Info & Relationships** | Semantic HTML | Proper heading hierarchy, form labels |
| **1.4.3 Contrast (Minimum)** | 4.5:1 text, 3:1 UI | Tailwind color palette validated |
| **1.4.4 Resize Text** | 200% zoom support | Relative units (rem), responsive design |
| **2.1.1 Keyboard** | Full keyboard navigation | Focus management, tab order, skip links |
| **2.4.1 Bypass Blocks** | Skip to main content | Skip link component |
| **2.4.4 Link Purpose** | Descriptive link text | No "click here", context in link |
| **2.4.7 Focus Visible** | Visible focus indicator | Custom focus rings in Tailwind |
| **3.1.1 Language of Page** | `lang` attribute | Dynamic based on invitation language |
| **3.3.1 Error Identification** | Clear error messages | Inline validation, ARIA live regions |
| **3.3.2 Labels or Instructions** | Form field labels | Associated labels, helper text |
| **4.1.2 Name, Role, Value** | ARIA attributes | Proper roles for custom components |

### ISO Standards Compliance

| Standard | Application | Example |
|----------|-------------|--------|
| **ISO 8601** | All dates/times | `2025-12-15T10:00:00+05:30` |
| **ISO 639-1** | Language codes | `en`, `hi`, `ta`, `te`, `kn`, `ml` |
| **ISO 3166-1** | Country codes | `IN` for India |
| **ISO 4217** | Currency codes | `INR` for Indian Rupee |
| **RFC 5646** | Language tags | `en-IN`, `hi-IN`, `ta-IN` |
| **RFC 7231** | HTTP methods | Proper REST verb usage |
| **RFC 7807** | Problem Details | Standardized error responses |

### Naming Conventions

#### PHP/Laravel (PSR-12)

```php
// Classes: PascalCase
class InvitationService {}
class AIThemeGenerationController {}

// Methods/Functions: camelCase
public function generateTheme(): AIGeneratedTheme {}
private function validateEventDetails(array $data): void {}

// Variables: camelCase
$invitationId = $request->input('invitation_id');
$isPublished = $invitation->status === 'published';

// Constants: SCREAMING_SNAKE_CASE
const MAX_IMAGES_PER_INVITATION = 10;
const AI_GENERATION_TIMEOUT = 30;

// Database columns: snake_case
$table->string('event_title');
$table->timestamp('published_at');

// Config keys: snake_case with dot notation
config('invitation.ai.gemini.model');
```

#### TypeScript/Vue (Airbnb + Vue Style Guide)

```typescript
// Components: PascalCase
TemplateGallery.vue
AIThemeGenerator.vue

// Composables: camelCase with 'use' prefix
useInvitationWizard.ts
useAutoSave.ts

// Variables/Functions: camelCase
const isLoading = ref(false);
function handleTemplateSelect(template: Template): void {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_FILE_SIZE_MB = 10;
const AUTOSAVE_INTERVAL_MS = 30000;

// Types/Interfaces: PascalCase
interface Invitation {}
type EventType = 'wedding' | 'birthday' | 'diwali';

// Props: camelCase
defineProps<{ invitationId: string; isEditing: boolean }>();

// Events: kebab-case
emit('template-selected', template);
emit('save-draft');

// CSS classes: kebab-case (BEM optional)
.invitation-card {}
.template-gallery__item {}
.btn--primary {}
```

### File Structure Standards

```text
# PHP Files
app/
├── Http/
│   ├── Controllers/          # {Resource}Controller.php
│   ├── Requests/             # {Action}{Resource}Request.php
│   │   └── Invitation/
│   │       ├── CreateInvitationRequest.php
│   │       ├── UpdateInvitationRequest.php
│   │       └── PublishInvitationRequest.php
│   └── Resources/            # {Resource}Resource.php
│       └── Invitation/
│           ├── InvitationResource.php
│           └── InvitationCollection.php
├── Models/                   # Singular PascalCase
├── Services/                 # {Domain}Service.php
├── Jobs/                     # {Verb}{Noun}.php (e.g., GenerateAITheme)
├── Events/                   # {Noun}{Verb}ed.php (e.g., InvitationPublished)
├── Listeners/                # {Verb}{Noun}Listener.php
├── Exceptions/               # {Noun}Exception.php
│   └── Invitation/
│       ├── InvitationNotFoundException.php
│       ├── AIGenerationFailedException.php
│       └── MusicTrackUnavailableException.php
└── Enums/                    # Singular PascalCase
    └── Invitation/
        ├── EventType.php
        ├── InvitationStatus.php
        └── AnimationIntensity.php

# Vue/TypeScript Files
resources/js/
├── Pages/                    # PascalCase.vue
├── Components/               # PascalCase.vue
├── Composables/              # use{Name}.ts
├── Stores/                   # {name}Store.ts
├── Types/                    # {name}.types.ts
│   └── invitation.types.ts
├── Utils/                    # {name}.utils.ts
│   ├── date.utils.ts
│   ├── validation.utils.ts
│   └── accessibility.utils.ts
└── Constants/                # {name}.constants.ts
    └── invitation.constants.ts
```

### Error Handling Standards

#### Backend (Laravel)

```php
// Custom Exception Classes
namespace App\Exceptions\Invitation;

class AIGenerationFailedException extends Exception
{
    public function __construct(
        public readonly string $service,
        public readonly ?string $originalError = null,
        string $message = 'AI generation failed'
    ) {
        parent::__construct($message);
    }

    public function render(): JsonResponse
    {
        return response()->json([
            'error' => [
                'type' => 'ai_generation_failed',
                'message' => $this->getMessage(),
                'service' => $this->service,
                'retry_after' => 30,
            ]
        ], 503);
    }
}

// RFC 7807 Problem Details Format
class ProblemDetailsResponse
{
    public static function create(
        string $type,
        string $title,
        int $status,
        ?string $detail = null,
        ?array $errors = null
    ): JsonResponse {
        return response()->json([
            'type' => "https://rawbox.app/errors/{$type}",
            'title' => $title,
            'status' => $status,
            'detail' => $detail,
            'errors' => $errors,
            'timestamp' => now()->toIso8601String(),
        ], $status);
    }
}

// Service Layer Error Handling
class ThemeGenerationService
{
    public function generate(string $prompt): AIGeneratedTheme
    {
        try {
            $result = $this->geminiService->generate($prompt);
            return $this->processResult($result);
        } catch (GeminiApiException $e) {
            Log::error('Gemini API failed', [
                'prompt' => Str::limit($prompt, 100),
                'error' => $e->getMessage(),
            ]);
            throw new AIGenerationFailedException(
                service: 'gemini',
                originalError: $e->getMessage()
            );
        }
    }
}
```

#### Frontend (Vue 3 + TypeScript)

```typescript
// Error Boundary Component
<script setup lang="ts">
import { onErrorCaptured, ref } from 'vue';

const error = ref<Error | null>(null);
const hasError = ref(false);

onErrorCaptured((err: Error) => {
  error.value = err;
  hasError.value = true;
  
  // Log to monitoring service
  logError(err, { component: 'InvitationWizard' });
  
  return false; // Prevent propagation
});

function retry() {
  hasError.value = false;
  error.value = null;
}
</script>

<template>
  <div v-if="hasError" role="alert" aria-live="assertive">
    <h2>Something went wrong</h2>
    <p>{{ error?.message }}</p>
    <button @click="retry">Try Again</button>
  </div>
  <slot v-else />
</template>

// API Error Handling Composable
export function useApiError() {
  const error = ref<ApiError | null>(null);
  const isError = computed(() => error.value !== null);

  async function handleRequest<T>(
    request: () => Promise<T>,
    options?: { showToast?: boolean; fallback?: T }
  ): Promise<T | undefined> {
    try {
      error.value = null;
      return await request();
    } catch (e) {
      const apiError = parseApiError(e);
      error.value = apiError;
      
      if (options?.showToast) {
        toast.error(apiError.message);
      }
      
      // Announce to screen readers
      announceError(apiError.message);
      
      return options?.fallback;
    }
  }

  return { error, isError, handleRequest, clearError };
}

// Accessible Error Announcer
function announceError(message: string): void {
  const announcer = document.getElementById('aria-live-announcer');
  if (announcer) {
    announcer.textContent = `Error: ${message}`;
  }
}
```

### Validation Standards

```php
// Laravel Form Request with detailed messages
class CreateInvitationRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'event_type' => ['required', 'string', Rule::enum(EventType::class)],
            'event_title' => ['required', 'string', 'max:200'],
            'host_names' => ['required', 'array', 'min:1', 'max:10'],
            'host_names.*' => ['required', 'string', 'max:100'],
            'event_date' => ['required', 'date', 'after:today'],
            'event_time' => ['nullable', 'date_format:H:i'],
            'language' => ['required', 'string', Rule::in(['en', 'hi', 'ta', 'te', 'kn', 'ml'])],
        ];
    }

    public function messages(): array
    {
        return [
            'event_title.required' => 'Please enter a title for your event.',
            'event_date.after' => 'Event date must be in the future.',
            'host_names.min' => 'Please add at least one host name.',
        ];
    }
}
```

### Logging Standards

```php
// Structured logging with context
Log::channel('invitation')->info('Invitation published', [
    'invitation_id' => $invitation->id,
    'user_id' => auth()->id(),
    'event_type' => $invitation->event_type,
    'has_music' => $invitation->music_enabled,
    'has_animation' => $invitation->animation_style_id !== null,
    'ai_features_used' => $this->getAIFeaturesUsed($invitation),
]);

// Error logging with stack trace
Log::channel('invitation')->error('AI theme generation failed', [
    'invitation_id' => $invitationId,
    'prompt' => Str::limit($prompt, 200),
    'error_type' => get_class($exception),
    'error_message' => $exception->getMessage(),
    'stack_trace' => $exception->getTraceAsString(),
]);
```

## Project Structure

### Documentation (this feature)

```text
specs/6-invitation-wizard/
├── plan.md              # This file
├── research.md          # Phase 0 output - technology decisions
├── data-model.md        # Phase 1 output - entity definitions
├── quickstart.md        # Phase 1 output - development setup
├── contracts/           # Phase 1 output - API specifications
│   └── invitation-api.yaml
└── tasks.md             # Phase 2 output - implementation tasks
```

### Source Code (repository root)

```text
# Backend (Laravel)
app/
├── Http/
│   └── Controllers/
│       └── Invitation/
│           ├── InvitationController.php
│           ├── InvitationTemplateController.php
│           ├── InvitationImageController.php
│           ├── InvitationMusicController.php
│           ├── InvitationAnimationController.php
│           └── AI/
│               ├── ThemeGenerationController.php
│               ├── TextGenerationController.php
│               ├── PhotoEnhancementController.php
│               ├── MusicRecommendationController.php
│               └── DesignAssistantController.php
├── Models/
│   └── Invitation/
│       ├── Invitation.php
│       ├── InvitationTemplate.php
│       ├── InvitationImage.php
│       ├── InvitationDraft.php
│       ├── InvitationMusic.php
│       ├── InvitationAnimation.php
│       ├── MusicTrack.php
│       ├── AnimationStyle.php
│       ├── AIGeneratedTheme.php
│       ├── AITextSuggestion.php
│       ├── AIPhotoEnhancement.php
│       └── AIDesignConversation.php
├── Services/
│   └── Invitation/
│       ├── InvitationService.php
│       ├── TemplateService.php
│       ├── DraftService.php
│       ├── PublishingService.php
│       ├── MusicService.php
│       ├── AnimationService.php
│       └── AI/
│           ├── GeminiService.php
│           ├── ThemeGenerationService.php
│           ├── TextGenerationService.php
│           ├── PhotoEnhancementService.php
│           ├── MusicRecommendationService.php
│           └── DesignAssistantService.php
├── Jobs/
│   └── Invitation/
│       ├── GenerateAITheme.php
│       ├── EnhancePhoto.php
│       ├── ProcessImageUpload.php
│       └── GenerateInvitationPreview.php
└── Events/
    └── Invitation/
        ├── InvitationCreated.php
        ├── InvitationPublished.php
        └── AIGenerationCompleted.php

# Frontend (Vue 3 + Inertia)
resources/js/
├── Pages/
│   └── Invitation/
│       ├── Index.vue              # Invitation list/dashboard
│       ├── Create.vue             # Wizard container
│       ├── Edit.vue               # Edit existing
│       ├── Preview.vue            # Full preview
│       ├── Public.vue             # Public invitation view (with music/animation)
│       └── Steps/
│           ├── Step1EventDetails.vue
│           ├── Step2TemplateSelection.vue
│           └── Step3ImagesPublish.vue
├── Components/
│   └── Invitation/
│       ├── TemplateGallery.vue
│       ├── TemplatePreview.vue
│       ├── ColorPicker.vue
│       ├── FontSelector.vue
│       ├── ImageUploader.vue
│       ├── ImageGallery.vue
│       ├── MusicLibrary.vue
│       ├── MusicPlayer.vue
│       ├── AnimationSelector.vue
│       ├── AnimationPreview.vue
│       ├── AIThemeGenerator.vue
│       ├── AITextSuggestions.vue
│       ├── AIPhotoEnhancer.vue
│       ├── AIDesignChat.vue
│       ├── AIMusicRecommend.vue
│       └── PublishModal.vue
├── Composables/
│   └── invitation/
│       ├── useInvitationWizard.ts
│       ├── useTemplates.ts
│       ├── useMusic.ts
│       ├── useAnimations.ts
│       ├── useAIGeneration.ts
│       └── useAutoSave.ts
└── Stores/
    └── invitation/
        └── wizardStore.ts

# Database Migrations
database/migrations/
├── 2025_12_06_000001_create_invitations_table.php
├── 2025_12_06_000002_create_invitation_templates_table.php
├── 2025_12_06_000003_create_invitation_images_table.php
├── 2025_12_06_000004_create_invitation_drafts_table.php
├── 2025_12_06_000005_create_music_tracks_table.php
├── 2025_12_06_000006_create_invitation_music_table.php
├── 2025_12_06_000007_create_animation_styles_table.php
├── 2025_12_06_000008_create_invitation_animations_table.php
├── 2025_12_06_000009_create_ai_generated_themes_table.php
├── 2025_12_06_000010_create_ai_text_suggestions_table.php
├── 2025_12_06_000011_create_ai_photo_enhancements_table.php
└── 2025_12_06_000012_create_ai_design_conversations_table.php

# Tests
tests/
├── Feature/
│   └── Invitation/
│       ├── InvitationCreationTest.php
│       ├── TemplateSelectionTest.php
│       ├── ImageUploadTest.php
│       ├── MusicSelectionTest.php
│       ├── AnimationSelectionTest.php
│       ├── AIThemeGenerationTest.php
│       ├── AITextGenerationTest.php
│       ├── PublishingTest.php
│       └── PublicAccessTest.php
└── Unit/
    └── Invitation/
        ├── InvitationServiceTest.php
        ├── TemplateServiceTest.php
        ├── MusicServiceTest.php
        ├── AnimationServiceTest.php
        └── AI/
            ├── GeminiServiceTest.php
            └── ThemeGenerationServiceTest.php
```

**Structure Decision**: Web application structure following Laravel conventions with feature-based organization. All invitation-related code grouped under `Invitation` namespace/folder for clear boundaries.

## Centralized Configuration (.env Pattern)

**CRITICAL**: No API keys, secrets, or model names hardcoded. All values from `.env` → `config()` helper.

### Environment Variables Template

```env
# =============================================================================
# INVITATION WIZARD CONFIGURATION
# =============================================================================

# AI Model Configuration (NEVER HARDCODE - models change frequently)
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3-pro
GEMINI_FLASH_MODEL=gemini-2.5-flash
IMAGEN_MODEL=imagen-3

# AI Rate Limits & Tokens
AI_RATE_LIMIT_PER_MINUTE=60
AI_MAX_TOKENS=4096
AI_TIMEOUT_SECONDS=30
AI_RETRY_ATTEMPTS=3

# Music Library Configuration
MUSIC_LIBRARY_PROVIDER=internal
MUSIC_CDN_URL=${APP_URL}/storage/music
MUSIC_MAX_FILE_SIZE_MB=15
MUSIC_PREVIEW_DURATION_SECONDS=30

# Animation Settings
ANIMATION_CDN_URL=${APP_URL}/storage/animations
ANIMATION_PRELOAD_ENABLED=true
ANIMATION_LOW_PERFORMANCE_THRESHOLD=30

# Storage Configuration
CLOUDFLARE_R2_ACCESS_KEY_ID=your-access-key
CLOUDFLARE_R2_SECRET_ACCESS_KEY=your-secret-key
CLOUDFLARE_R2_BUCKET=rawbox-invitations
CLOUDFLARE_R2_ENDPOINT=https://your-account.r2.cloudflarestorage.com
CLOUDFLARE_R2_URL=${APP_URL}/storage

# Feature Flags
INVITATION_AI_THEME_ENABLED=true
INVITATION_AI_TEXT_ENABLED=true
INVITATION_AI_PHOTO_ENABLED=true
INVITATION_AI_MUSIC_ENABLED=true
INVITATION_MUSIC_ENABLED=true
INVITATION_ANIMATION_ENABLED=true
INVITATION_ANALYTICS_ENABLED=true

# Regional Settings
INVITATION_DEFAULT_LANGUAGE=en
INVITATION_SUPPORTED_LANGUAGES=en,hi,ta,te,kn,ml
INVITATION_DEFAULT_TIMEZONE=Asia/Kolkata
INVITATION_DEFAULT_CURRENCY=INR

# Autosave Settings
INVITATION_AUTOSAVE_INTERVAL_SECONDS=30
INVITATION_MAX_UNDO_HISTORY=50
```

### Config File Structure

```php
// config/invitation.php
return [
    'ai' => [
        'gemini' => [
            'api_key' => env('GEMINI_API_KEY'),
            'model' => env('GEMINI_MODEL', 'gemini-3-pro'),
            'flash_model' => env('GEMINI_FLASH_MODEL', 'gemini-2.5-flash'),
        ],
        'imagen' => [
            'model' => env('IMAGEN_MODEL', 'imagen-3'),
        ],
        'rate_limit' => (int) env('AI_RATE_LIMIT_PER_MINUTE', 60),
        'max_tokens' => (int) env('AI_MAX_TOKENS', 4096),
        'timeout' => (int) env('AI_TIMEOUT_SECONDS', 30),
        'retry_attempts' => (int) env('AI_RETRY_ATTEMPTS', 3),
    ],
    
    'music' => [
        'provider' => env('MUSIC_LIBRARY_PROVIDER', 'internal'),
        'cdn_url' => env('MUSIC_CDN_URL'),
        'max_file_size_mb' => (int) env('MUSIC_MAX_FILE_SIZE_MB', 15),
        'preview_duration' => (int) env('MUSIC_PREVIEW_DURATION_SECONDS', 30),
    ],
    
    'animation' => [
        'cdn_url' => env('ANIMATION_CDN_URL'),
        'preload_enabled' => env('ANIMATION_PRELOAD_ENABLED', true),
        'low_performance_threshold' => (int) env('ANIMATION_LOW_PERFORMANCE_THRESHOLD', 30),
    ],
    
    'storage' => [
        'r2' => [
            'access_key' => env('CLOUDFLARE_R2_ACCESS_KEY_ID'),
            'secret_key' => env('CLOUDFLARE_R2_SECRET_ACCESS_KEY'),
            'bucket' => env('CLOUDFLARE_R2_BUCKET'),
            'endpoint' => env('CLOUDFLARE_R2_ENDPOINT'),
            'url' => env('CLOUDFLARE_R2_URL'),
        ],
    ],
    
    'features' => [
        'ai_theme_enabled' => env('INVITATION_AI_THEME_ENABLED', true),
        'ai_text_enabled' => env('INVITATION_AI_TEXT_ENABLED', true),
        'ai_photo_enabled' => env('INVITATION_AI_PHOTO_ENABLED', true),
        'ai_music_enabled' => env('INVITATION_AI_MUSIC_ENABLED', true),
        'music_enabled' => env('INVITATION_MUSIC_ENABLED', true),
        'animation_enabled' => env('INVITATION_ANIMATION_ENABLED', true),
        'analytics_enabled' => env('INVITATION_ANALYTICS_ENABLED', true),
    ],
    
    'regional' => [
        'default_language' => env('INVITATION_DEFAULT_LANGUAGE', 'en'),
        'supported_languages' => explode(',', env('INVITATION_SUPPORTED_LANGUAGES', 'en,hi,ta,te,kn,ml')),
        'default_timezone' => env('INVITATION_DEFAULT_TIMEZONE', 'Asia/Kolkata'),
        'default_currency' => env('INVITATION_DEFAULT_CURRENCY', 'INR'),
    ],
    
    'autosave' => [
        'interval_seconds' => (int) env('INVITATION_AUTOSAVE_INTERVAL_SECONDS', 30),
        'max_undo_history' => (int) env('INVITATION_MAX_UNDO_HISTORY', 50),
    ],
];
```

### Service Class Pattern

```php
// ✅ CORRECT: Load from config
class ThemeGenerationService
{
    private string $model;
    private string $apiKey;
    private int $timeout;
    
    public function __construct()
    {
        $this->model = config('invitation.ai.gemini.model');
        $this->apiKey = config('invitation.ai.gemini.api_key');
        $this->timeout = config('invitation.ai.timeout');
    }
    
    public function generateTheme(string $prompt): AIGeneratedTheme
    {
        // Use $this->model, never hardcode 'gemini-3-pro'
    }
}

// ❌ WRONG: Never hardcode
class ThemeGenerationService
{
    private string $model = 'gemini-3-pro';  // NEVER DO THIS
    private string $apiKey = 'AIza...';       // ABSOLUTELY NEVER
}
```

### Frontend Safety (Inertia)

```php
// app/Http/Middleware/HandleInertiaRequests.php
public function share(Request $request): array
{
    return [
        // ✅ Share only non-sensitive config
        'invitation' => [
            'features' => config('invitation.features'),
            'regional' => config('invitation.regional'),
            'music' => [
                'cdn_url' => config('invitation.music.cdn_url'),
                'preview_duration' => config('invitation.music.preview_duration'),
            ],
            'animation' => [
                'cdn_url' => config('invitation.animation.cdn_url'),
                'preload_enabled' => config('invitation.animation.preload_enabled'),
            ],
        ],
        // ❌ Never share: api_key, access_key, secret_key
    ];
}
```

### Environment Files Structure

```text
.env                    # Production (never commit)
.env.example            # Template with all keys documented
.env.local              # Local development (gitignored)
.env.testing            # Testing environment
.env.staging            # Staging environment
```

---

## Complexity Tracking

> No constitution violations identified. Feature complexity is justified by user requirements.

| Area | Complexity | Justification |
|------|------------|---------------|
| AI Integration | High | 4 AI features (theme, text, photo, music) required by spec |
| Music System | Medium | Licensed library management, streaming, autoplay handling |
| Animation System | Medium | Performance detection, fallback rendering |
| Multi-language | Medium | 6 regional languages + cultural context |
| Centralized Config | Low | All secrets/keys in .env for easy maintenance |

---

## Phase 0 Deliverables

### Research Areas

1. **AI Integration Architecture**
   - Google Gemini API setup and authentication
   - Imagen 3 integration for theme generation
   - Rate limiting and cost management
   - Fallback strategies when AI unavailable

2. **Music Library Management**
   - Royalty-free music sourcing (providers: Epidemic Sound, Artlist, etc.)
   - Audio streaming architecture (Howler.js vs native Audio API)
   - Browser autoplay policy handling
   - Music file storage and CDN delivery

3. **Animation Framework**
   - GSAP vs Lottie vs CSS animations comparison
   - Device performance detection strategies
   - Animation presets for cultural themes
   - Fallback rendering for low-end devices

4. **Regional Language Support**
   - Font libraries for Indian languages
   - Google Fonts vs custom font hosting
   - RTL/LTR handling for multilingual text
   - AI text generation in regional languages

5. **Template System Architecture**
   - Template storage format (JSON schema)
   - Customization persistence
   - Real-time preview rendering
   - Template versioning

**Output**: `research.md` with decisions and rationale

---

## Phase 1 Deliverables

### Data Model Design

1. **Core Entities**
   - Invitation (event details, status, public URL)
   - InvitationTemplate (design assets, customization schema)
   - InvitationImage (uploads, processing status)
   - InvitationDraft (auto-save state)

2. **Music Entities**
   - MusicTrack (library catalog)
   - InvitationMusic (selection per invitation)

3. **Animation Entities**
   - AnimationStyle (presets, compatibility)
   - InvitationAnimation (selection per invitation)

4. **AI Entities**
   - AIGeneratedTheme (prompt, assets, refinements)
   - AITextSuggestion (wording options)
   - AIPhotoEnhancement (before/after)
   - AIDesignConversation (chat history)

**Output**: `data-model.md` with entity relationships

### API Contracts

1. **Invitation CRUD** - Create, read, update, delete invitations
2. **Template API** - Browse, filter, preview templates
3. **Image API** - Upload, process, enhance images
4. **Music API** - Browse library, select track, preview
5. **Animation API** - Browse styles, select, preview
6. **AI Endpoints**
   - POST /ai/theme/generate
   - POST /ai/theme/refine
   - POST /ai/text/generate
   - POST /ai/photo/enhance
   - POST /ai/music/recommend
   - POST /ai/design/chat
7. **Publishing API** - Publish, unpublish, share

**Output**: `contracts/invitation-api.yaml` (OpenAPI 3.1)

### Quickstart Guide

- Development environment setup
- Database seeding with sample templates/music
- AI service configuration
- Testing workflow

**Output**: `quickstart.md`

---

## Implementation Phases

### Phase 2A: Core Wizard (P1 Stories)

| User Story | Tasks | Priority |
|------------|-------|----------|
| US-1: Event Details | Form components, validation, persistence | P1 |
| US-2: Template Selection | Gallery, preview, customization | P1 |
| US-3: Upload & Publish | Image upload, publishing, URL generation | P1 |

### Phase 2B: Draft & Preview (P2 Stories)

| User Story | Tasks | Priority |
|------------|-------|----------|
| US-4: Preview | Full-screen preview, device toggle | P2 |
| US-5: Save Draft | Auto-save, draft list, resume | P2 |
| US-11: Background Music | Music library, player, autoplay | P2 |
| US-12: Animated Frames | Animation selector, rendering | P2 |

### Phase 2C: AI Features (P2 Stories)

| User Story | Tasks | Priority |
|------------|-------|----------|
| US-7: AI Theme Generation | Gemini + Imagen integration | P2 |
| US-8: AI Text Generation | Cultural text suggestions | P2 |

### Phase 2D: Advanced Features (P3 Stories)

| User Story | Tasks | Priority |
|------------|-------|----------|
| US-6: Duplicate Invitation | Copy functionality | P3 |
| US-9: AI Photo Enhancement | Background removal, restore | P3 |
| US-10: AI Design Assistant | Chat interface, recommendations | P3 |
| US-13: AI Music Recommendation | Mood-based suggestions | P3 |

---

## Dependencies

### External Services

| Service | Purpose | Fallback |
|---------|---------|----------|
| Google Gemini API | AI text, theme understanding | Pre-built templates/text |
| Imagen 3 | Image generation | Stock design assets |
| Cloudflare R2 | File storage | Laravel local storage |
| Google Maps API | Venue directions | Manual address display |

### Internal Dependencies

| Module | Dependency | Impact |
|--------|------------|--------|
| Auth | Laravel Jetstream | User authentication |
| Teams | Jetstream Teams | Multi-user access |
| Media | Media Processing Module | Image optimization |

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| AI service unavailable | Medium | High | Graceful fallback to pre-built options |
| Music copyright issues | Low | Critical | Platform-curated library only |
| Animation performance | Medium | Medium | Device detection + CSS fallback |
| Regional font rendering | Low | Medium | Self-hosted fonts + testing |
| AI cultural insensitivity | Low | High | Content review + user feedback loop |

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Wizard completion rate | 80% | Analytics: Step 1 → Published |
| Average creation time | <5 min | Time tracking |
| AI feature adoption | 50% | Users using ≥1 AI feature |
| Music adoption | 60% | Invitations with music enabled |
| Animation adoption | 75% | Invitations with animations |
| Performance | 60fps | Animation frame rate monitoring |
| Copyright claims | 0 | Legal tracking |

---

## Next Steps

1. **Phase 0**: Generate `research.md` with technology decisions
2. **Phase 1**: Generate `data-model.md`, `contracts/`, `quickstart.md`
3. **Phase 2**: Generate `tasks.md` with implementation tasks (via `/speckit.tasks`)


# Feature Specification: RSVP Management System

**Feature Branch**: `7-rsvp-management`  
**Created**: December 5, 2025  
**Status**: Draft  
**Input**: User description: "RSVP Management - Guest tracking and attendance analytics for digital invitations"

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Guest Submits RSVP Response (Priority: P1)

As a guest, I want to respond to an invitation with my attendance status so the host knows if I'm coming.

**Why this priority**: RSVP submission is the core purpose of the feature. Without guest responses, there's no data to manage.

**Independent Test**: Can be tested by opening an invitation, filling the RSVP form, submitting, and verifying response is recorded.

**Acceptance Scenarios**:

1. **Given** a guest views a published invitation, **When** they scroll to RSVP section, **Then** they see a form to submit their response.
2. **Given** the form is displayed, **When** guest enters name and selects "Attending," **Then** they can submit the response.
3. **Given** guest submits RSVP, **When** submission succeeds, **Then** they see confirmation message thanking them.
4. **Given** guest provides email/phone, **When** they submit, **Then** they receive confirmation via their provided contact method.
5. **Given** a guest tries to RSVP again, **When** they access the form, **Then** they see their previous response with option to update.

---

### User Story 2 - Host Views RSVP Dashboard (Priority: P1)

As an event host, I want to see all RSVPs in a dashboard so I can track who's attending my event.

**Why this priority**: The dashboard is how hosts access and use RSVP data. Essential for the feature to provide value.

**Independent Test**: Can be tested by viewing dashboard after guests have RSVPed and verifying accurate counts and guest list.

**Acceptance Scenarios**:

1. **Given** host opens their invitation management, **When** they view RSVP section, **Then** they see summary statistics (total responses, attending, not attending, maybe).
2. **Given** RSVPs exist, **When** host views the list, **Then** they see each guest's name, contact, status, guest count, and response date.
3. **Given** multiple RSVPs exist, **When** host filters by "Attending," **Then** only confirmed attendees are displayed.
4. **Given** dashboard is open, **When** a new RSVP arrives, **Then** the dashboard updates automatically (or with refresh).

---

### User Story 3 - Host Receives RSVP Notifications (Priority: P2)

As an event host, I want to be notified when guests RSVP so I stay informed without constantly checking the dashboard.

**Why this priority**: Notifications keep hosts engaged and informed. Important but dashboard provides the data regardless.

**Independent Test**: Can be tested by submitting an RSVP and verifying host receives email notification within 5 minutes.

**Acceptance Scenarios**:

1. **Given** a guest submits an RSVP, **When** submission completes, **Then** host receives email notification with guest name and status.
2. **Given** multiple RSVPs arrive in short time, **When** notifications are sent, **Then** they are batched (not overwhelming individual emails).
3. **Given** host prefers daily digest, **When** configured, **Then** they receive one daily email summarizing all RSVPs.
4. **Given** notification is received, **When** host clicks it, **Then** they are taken directly to the RSVP dashboard.

---

### User Story 4 - Guest Includes Additional Details (Priority: P2)

As a guest, I want to specify guest count, dietary preferences, and send a message so I can provide helpful information to the host.

**Why this priority**: Additional details help hosts plan (catering, seating) but basic attendance tracking works without them.

**Independent Test**: Can be tested by submitting RSVP with 3 guests and dietary note, then verifying host sees this information.

**Acceptance Scenarios**:

1. **Given** a guest is filling RSVP form, **When** they indicate "Attending," **Then** they see field to specify number of guests attending.
2. **Given** host has enabled dietary preferences, **When** guest views form, **Then** they can select from dietary options (vegetarian, vegan, allergies).
3. **Given** message field is available, **When** guest types a message, **Then** it is saved and visible to host in dashboard.
4. **Given** guest count is entered, **When** host views RSVP, **Then** they see total guest count (not just number of RSVP submissions).

---

### User Story 5 - Export RSVP Data (Priority: P3)

As an event host, I want to export my guest list so I can use it for venue planning, name tags, or sharing with vendors.

**Why this priority**: Export extends usefulness but core tracking works without it. Nice-to-have for power users.

**Independent Test**: Can be tested by clicking export and verifying downloaded file contains all RSVP data in usable format.

**Acceptance Scenarios**:

1. **Given** host is on RSVP dashboard, **When** they click "Export," **Then** they see options for CSV and PDF formats.
2. **Given** CSV export is selected, **When** downloaded, **Then** file contains all columns (name, contact, status, guests, message, date).
3. **Given** PDF export is selected, **When** downloaded, **Then** file is formatted as printable guest list.
4. **Given** filters are applied, **When** export is triggered, **Then** only filtered results are exported.

---

### User Story 6 - Guest Updates Previous Response (Priority: P3)

As a guest, I want to update my RSVP if my plans change so the host has accurate attendance information.

**Why this priority**: Plan changes are common but most guests respond once. Update capability is helpful but not critical.

**Independent Test**: Can be tested by submitting RSVP, then using edit link to change from "Attending" to "Not Attending."

**Acceptance Scenarios**:

1. **Given** a guest has previously RSVPed, **When** they receive their confirmation email, **Then** it includes a unique link to edit their response.
2. **Given** guest clicks edit link, **When** form loads, **Then** their previous responses are pre-filled.
3. **Given** guest changes status from "Attending" to "Not Attending," **When** they submit, **Then** updated response replaces the original.
4. **Given** response is updated, **When** host views dashboard, **Then** they see current status and can view change history.

---

### Edge Cases

- What happens when guest submits RSVP without providing contact information?
  - Name is required; contact is optional but recommended. RSVP is accepted without contact.
- What happens when event date has passed?
  - RSVP form is disabled with message "This event has ended."
- What happens when invitation is deleted while RSVPs exist?
  - RSVPs are preserved for host reference but form is no longer accessible.
- What happens when guest count exceeds reasonable limits (e.g., "500 guests")?
  - Validation limits guest count to configurable maximum (default: 20); larger values require confirmation.
- What happens when network fails during RSVP submission?
  - Error message displayed with retry option; partial data is not saved.

---

## Requirements *(mandatory)*

### Functional Requirements

**Guest RSVP:**
- **FR-001**: System MUST display RSVP form on published invitation pages.
- **FR-002**: System MUST capture guest name (required) and attendance status (required).
- **FR-003**: System MUST capture contact (email or phone) with at least one recommended.
- **FR-004**: System MUST support attendance statuses: Attending, Not Attending, Maybe.
- **FR-005**: System MUST allow specifying number of guests attending (default: 1).
- **FR-006**: System MUST allow optional message to host (max 500 characters).
- **FR-007**: System MUST allow optional dietary preference selection (if enabled by host).
- **FR-008**: System MUST prevent duplicate RSVPs from same identified guest (offer update instead).
- **FR-009**: System MUST send confirmation to guest if email/phone provided.

**Host Dashboard:**
- **FR-010**: System MUST display summary statistics (total, attending, not attending, maybe, total guest count).
- **FR-011**: System MUST display list of all RSVPs with full details.
- **FR-012**: System MUST allow filtering by attendance status.
- **FR-013**: System MUST allow searching RSVPs by guest name.
- **FR-014**: System MUST show when RSVPs were last updated.

**Notifications:**
- **FR-015**: System MUST send email notification to host for each RSVP (default behavior).
- **FR-016**: System MUST support batched notifications to prevent overwhelming hosts.
- **FR-017**: System MUST support daily digest notification option.
- **FR-018**: System MUST allow disabling notifications per invitation.

**Export & Updates:**
- **FR-019**: System MUST allow exporting RSVPs as CSV.
- **FR-020**: System MUST allow exporting RSVPs as printable PDF.
- **FR-021**: System MUST provide unique edit link for each RSVP.
- **FR-022**: System MUST allow guests to update their RSVP via edit link.
- **FR-023**: System MUST preserve RSVP history when updates occur.

### Key Entities

- **RSVP**: A guest's response to an invitation; includes guest name, contact, attendance status, guest count, dietary preferences, message, submission timestamp, and edit token.
- **RSVPSettings**: Host's configuration for RSVP collection; includes whether dietary options are enabled, guest count limits, notification preferences.
- **RSVPNotification**: Scheduled or sent notification about RSVPs; includes batch contents, delivery status, and recipient.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 80% of invitation recipients submit an RSVP response (for invitations with RSVP enabled).
- **SC-002**: RSVP submission completes in under 60 seconds for average guest.
- **SC-003**: Host receives RSVP notification within 5 minutes of submission (or in next digest).
- **SC-004**: Dashboard accurately reflects total guest count (sum of all attending guests, not just responses).
- **SC-005**: Export generates correctly formatted files with 100% of data included.
- **SC-006**: 95% of hosts report RSVP tracking as "helpful" or "very helpful" for event planning.
- **SC-007**: RSVP update rate is under 10% (indicating guests generally respond accurately first time).

---

## Assumptions

- RSVP is optional feature hosts can enable/disable per invitation.
- Guest identification is primarily by email address for duplicate detection.
- Dietary preference options are predefined (not custom per event for initial release).
- RSVP data is retained according to invitation retention policy (auto-delete after event + 7 days unless extended).
- Hosts can manually add RSVPs for guests who respond offline (phone, in-person).

---

## Out of Scope

- Automated reminder to guests who haven't RSVPed
- Seating chart or table assignment
- Integration with external guest list management tools
- RSVP capacity limits with waitlist
- Plus-one management (separate from guest count)
- RSVP response via SMS
- Multi-event RSVP (separate response per event in invitation)
