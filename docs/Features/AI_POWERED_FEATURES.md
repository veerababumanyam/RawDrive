# AI-Powered Features

> Terminology: See [`GLOSSARY.md`](GLOSSARY.md) (Workspace, Asset, Share Link, Trial, etc.).

## Overview

RawDrive is **AI-native** and uses a **multi-provider AI layer** to deliver intelligent photo analysis, curation, organization, and search features. These capabilities help photographers save time, improve consistency, and provide better client experiences.

**Provider strategy (default + options):**
- **Default (RawDrive-hosted): Google Gemini**
- **Optional providers (admin-configurable):** OpenAI, Anthropic, Azure-hosted models (Azure OpenAI / Azure AI Foundry), and OpenAI-compatible local servers (Ollama, LM Studio)

AI execution may run as:
- Hosted API calls (Gemini/OpenAI/Anthropic/Azure) OR
- Local/self-hosted inference (OpenAI-compatible endpoints) for enterprise/privacy-sensitive deployments.

## Purpose

AI features serve to:
- **Automate Organization**: Automatically tag and categorize photos
- **Enhance Quality**: Identify best photos and suggest improvements
- **Generate Content**: Create captions, hashtags, and stories
- **Detect Faces**: Identify and tag people in photos
- **Smart Curation**: Suggest best photos for galleries
- **Reduce Manual Work**: Minimize photographer effort in organization

## AI Credits System

### Credit Allocation

Each subscription tier includes monthly AI credits.

**Credits by Tier:**
```typescript
const AI_CREDITS_PER_TIER = {
  starter: 100,
  professional: 500,
  business: 2000,
  enterprise: 10000,
  // Trial is an account state. During the 30-day trial, treat the workspace as Business-tier
  // for feature access and limits (including credits).
  trial: 2000,
};
```

**Credit Costs:**
```typescript
const AI_CREDIT_COSTS = {
  analyzePhoto: 1, // Per photo
  generateCaption: 1, // Per photo
  generateHashtags: 1, // Per photo
  detectFaces: 5, // Per photo
  generateStory: 10, // Per gallery
  smartCuration: 20, // Per gallery
  duplicateDetection: 15, // Per batch
};
```

### Credit Management

Track and manage AI credit usage.

**Features:**
- Display current credit balance
- Show credit usage history
- Warn when credits running low
- Suggest upgrade when depleted
- Monthly credit reset
- Rollover options (Enterprise)

**UI Components:**
- Credit display widget
- Usage analytics
- Upgrade prompts
- Credit purchase options

### Credit Display

Show credit balance prominently.

```typescript
interface AICreditsDisplay {
  currentCredits: number;
  monthlyAllowance: number;
  usagePercentage: number;
  daysUntilReset: number;
  warningThreshold: number; // Alert when below this
}

// Display
<AICreditsDisplay 
  currentCredits={150}
  monthlyAllowance={500}
  usagePercentage={70}
  daysUntilReset={14}
/>
```

## Photo Analysis

### Automatic Photo Analysis

Analyze individual photos for metadata and insights.

**Analysis Results:**
```typescript
interface PhotoAnalysis {
  // Content
  description: string;
  tags: string[];
  hashtags: string[];
  
  // Quality
  qualityScore: number; // 0-100
  sharpness: number;
  exposure: number;
  composition: number;
  
  // Technical
  dominantColors: string[];
  lighting: 'natural' | 'artificial' | 'mixed';
  mood: string;
  
  // Suggestions
  improvements: string[];
  bestFor: string[]; // 'print', 'web', 'social', etc.
}
```

**Features:**
- One-click analysis
- Batch analysis
- Auto-tagging
- Quality scoring
- Improvement suggestions
- Best use recommendations

### Batch Analysis

Analyze multiple photos at once.

**Features:**
- Select multiple photos
- Start batch analysis
- Progress tracking
- Results summary
- Apply tags to all
- Export results

**Progress Tracking:**
```typescript
interface BatchAnalysisProgress {
  totalPhotos: number;
  processedPhotos: number;
  failedPhotos: number;
  estimatedTimeRemaining: number;
  creditsUsed: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}
```

### Quality Scoring

Automatic quality assessment for photos.

**Quality Metrics:**
- **Sharpness**: Focus and clarity (0-100)
- **Exposure**: Brightness and contrast (0-100)
- **Composition**: Framing and balance (0-100)
- **Overall Score**: Average of metrics (0-100)

**Quality Badges:**
- ⭐⭐⭐⭐⭐ Excellent (90-100)
- ⭐⭐⭐⭐ Good (75-89)
- ⭐⭐⭐ Fair (60-74)
- ⭐⭐ Poor (40-59)
- ⭐ Very Poor (0-39)

**Usage:**
- Filter by quality
- Sort by quality
- Identify best photos
- Suggest improvements

## Caption & Hashtag Generation

### Auto-Generated Captions

Generate descriptive captions for photos.

**Features:**
- One-click caption generation
- Customizable tone (professional, casual, poetic)
- Multiple caption options
- Edit and refine
- Apply to multiple photos
- Export captions

**Caption Styles:**
```typescript
type CaptionStyle = 'professional' | 'casual' | 'poetic' | 'technical';

// Example outputs for same photo:
// Professional: "Portrait of a woman in natural lighting with soft focus background"
// Casual: "Beautiful portrait with amazing lighting!"
// Poetic: "A moment of quiet reflection, bathed in golden light"
// Technical: "Portrait, f/2.8, 85mm, natural window light, shallow DOF"
```

### Hashtag Generation

Generate relevant hashtags for social media.

**Features:**
- Auto-generate hashtags
- Categorized hashtags (trending, niche, general)
- Customizable count (5-30)
- Copy to clipboard
- Apply to multiple photos
- Trending hashtag suggestions

**Hashtag Categories:**
```typescript
interface GeneratedHashtags {
  trending: string[]; // Popular hashtags
  niche: string[]; // Photography-specific
  general: string[]; // Broad appeal
  branded: string[]; // Studio-specific
}
```

## Face Detection & People Tagging

### Automatic Face Detection

Detect faces in photos automatically.

**Features:**
- Scan gallery for faces
- Identify unique people
- Group by person
- Confidence scores
- Batch detection
- Progress tracking

**Detection Results:**
```typescript
interface FaceDetection {
  photoId: string;
  faces: Face[];
  detectionConfidence: number; // 0-100
  processingTime: number; // ms
}

interface Face {
  id: string;
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number; // 0-100
  personId?: string; // Linked person
  personName?: string;
}
```

### People Tagging

Tag people in photos for organization.

**Features:**
- Manual tagging
- Auto-tagging from detection
- Create person profiles
- Link across photos
- Group by person
- Filter by person

**Person Profile:**
```typescript
interface PersonProfile {
  id: string;
  name: string;
  photoCount: number;
  firstSeen: Date;
  lastSeen: Date;
  photos: Photo[];
  notes?: string;
}
```

### Face Recognition

Recognize and group similar faces.

**Features:**
- Automatic face clustering
- Suggest person matches
- Merge duplicate people
- Split incorrect groups
- Confidence scores
- Manual corrections

**Clustering Algorithm:**
- Extract face embeddings
- Calculate similarity scores
- Group similar faces
- Suggest person names
- Allow manual refinement

## Gallery Story Generation

### AI-Generated Stories

Generate written summaries of galleries.

**Features:**
- One-click story generation
- Multiple story lengths (short, medium, long)
- Customizable tone
- Edit and refine
- Export as blog post
- Share on social media

**Story Lengths:**
```typescript
type StoryLength = 'short' | 'medium' | 'long';

// Short: 100-150 words
// Medium: 200-300 words
// Long: 400-600 words
```

**Story Tones:**
```typescript
type StoryTone = 'professional' | 'casual' | 'poetic' | 'journalistic';

// Professional: Formal, business-appropriate
// Casual: Friendly, conversational
// Poetic: Artistic, emotional
// Journalistic: Factual, narrative-driven
```

**Generated Story Example:**
```
"This beautiful wedding celebration captured the joy and elegance of Sarah and 
Michael's special day. From the intimate ceremony moments to the lively reception, 
every frame tells a story of love and connection. The natural lighting throughout 
the day created stunning opportunities for candid moments and formal portraits. 
The couple's attention to detail was evident in every aspect, from the floral 
arrangements to the heartfelt vows. This gallery is a testament to a day filled 
with laughter, tears of joy, and unforgettable memories."
```

## Smart Photo Curation

### Automatic Best Photo Selection

AI suggests best photos for galleries.

**Features:**
- Analyze all photos
- Score each photo
- Suggest top photos
- Customizable count
- Filter by criteria
- One-click selection

**Curation Criteria:**
```typescript
interface CurationCriteria {
  qualityScore: number; // Minimum quality
  diversity: boolean; // Variety of shots
  focusOnFaces: boolean; // Include portraits
  focusOnDetails: boolean; // Include close-ups
  focusOnWideShots: boolean; // Include landscapes
  excludeBlurry: boolean;
  excludeOverexposed: boolean;
  excludeUnderexposed: boolean;
}
```

### Duplicate Detection

Identify and remove duplicate photos.

**Features:**
- Scan for duplicates
- Show similarity score
- Side-by-side comparison
- Batch delete
- Keep best version
- Undo capability

**Duplicate Detection:**
```typescript
interface DuplicateGroup {
  id: string;
  photos: Photo[];
  similarity: number; // 0-100
  recommended: Photo; // Best version
}
```

### Similar Photo Grouping

Group similar photos together.

**Features:**
- Automatic grouping
- Customizable similarity threshold
- Manual grouping
- Merge groups
- Split groups
- Filter by group

## AI Queue Management

### Request Queuing

Manage AI requests efficiently.

**Features:**
- Queue AI requests
- Priority levels
- Rate limiting
- Concurrent processing
- Progress tracking
- Error handling

**Queue Management:**
```typescript
interface AIRequest {
  id: string;
  type: 'analyze' | 'caption' | 'hashtags' | 'faces' | 'story' | 'curation';
  photoIds: string[];
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  creditsRequired: number;
  createdAt: Date;
  completedAt?: Date;
}
```

### Concurrent Processing

Process multiple AI requests concurrently.

**Configuration:**
```typescript
const AI_QUEUE_CONFIG = {
  maxConcurrent: 3, // Max simultaneous requests
  maxRetries: 3, // Retry failed requests
  retryDelay: 5000, // ms between retries
  timeout: 60000, // ms before timeout
  priorityLevels: ['low', 'normal', 'high'],
};
```

## AI Settings & Controls

### AI Preferences

Allow photographers to customize AI behavior.

**Settings:**
```typescript
interface AIPreferences {
  // Auto-tagging
  autoTagPhotos: boolean;
  autoTagThreshold: number; // Confidence threshold
  
  // Suggestions
  showQualityScores: boolean;
  showImprovementSuggestions: boolean;
  
  // Face Detection
  autoDetectFaces: boolean;
  faceDetectionThreshold: number;
  
  // Privacy
  allowFaceStorage: boolean; // Store face embeddings
  allowDataUsage: boolean; // Use for model improvement
}
```

### AI Feature Toggles

Enable/disable specific AI features per user. Users can control which AI features are active in their settings.

**Available Toggles:**
| Feature | Description | Default |
|---------|-------------|---------|
| Photo Analysis | AI-powered quality assessment, tags, colors, lighting, and suggestions | Enabled |
| Caption Generation | Generate professional, casual, or poetic captions for photos | Enabled |
| Hashtag Generation | Generate categorized hashtags for social media optimization | Enabled |
| Gallery Stories | AI-written narratives and descriptions for photo galleries | Enabled |
| Smart Curation | AI-powered selection of best photos based on quality and diversity | Enabled |

**API Endpoints:**
```typescript
// Get feature toggles
GET /api/v1/users/me/gemini-settings/feature-toggles
// Response: { toggles: AIFeatureToggles, has_api_key: boolean, api_status: string }

// Update feature toggles
PATCH /api/v1/users/me/gemini-settings/feature-toggles
// Body: { photo_analysis?: boolean, captions?: boolean, ... }
```

**Database Schema:**
```sql
-- Feature toggles stored in user_gemini_settings table
ALTER TABLE user_gemini_settings ADD COLUMN
  feature_photo_analysis BOOLEAN NOT NULL DEFAULT TRUE,
  feature_captions BOOLEAN NOT NULL DEFAULT TRUE,
  feature_hashtags BOOLEAN NOT NULL DEFAULT TRUE,
  feature_gallery_story BOOLEAN NOT NULL DEFAULT TRUE,
  feature_smart_curation BOOLEAN NOT NULL DEFAULT TRUE;
```

**UI Location:**
Settings > AI & Gemini Settings > AI Features section

**Behavior:**
- Disabled features return 403 Forbidden when called
- Toggles require valid Gemini API key to be configured
- Changes are audited for compliance
- Toggles persist after API key revocation (preference preserved)
- Gallery detail action bar surfaces **AI Story** and **Smart Curation** when toggles are enabled and an AI API key is present (Profile > AI API key)

## AI Usage Analytics

### Usage Tracking

Track AI feature usage.

**Metrics:**
```typescript
interface AIUsageMetrics {
  creditsUsed: number;
  creditsRemaining: number;
  usagePercentage: number;
  
  // By feature
  analysisCount: number;
  captionCount: number;
  hashtagCount: number;
  faceDetectionCount: number;
  storyCount: number;
  
  // Trends
  dailyUsage: number[];
  weeklyUsage: number[];
  monthlyUsage: number[];
}
```

### Usage Dashboard

Visualize AI usage.

**Components:**
- Credit balance gauge
- Usage by feature (pie chart)
- Daily usage trend (line chart)
- Top features (bar chart)
- Recommendations for optimization

## Error Handling

### AI Request Failures

Handle AI processing failures gracefully.

**Common Errors:**
```typescript
interface AIError {
  code: string;
  message: string;
  retryable: boolean;
  suggestedAction: string;
}

// Error codes
const AI_ERROR_CODES = {
  INSUFFICIENT_CREDITS: 'Upgrade to use this feature',
  RATE_LIMITED: 'Too many requests, please wait',
  INVALID_IMAGE: 'Image format not supported',
  PROCESSING_TIMEOUT: 'Request took too long',
  SERVICE_UNAVAILABLE: 'AI service temporarily unavailable',
  INVALID_PARAMETERS: 'Invalid request parameters',
};
```

### Retry Logic

Automatically retry failed requests.

```typescript
const retryAIRequest = async (
  request: AIRequest,
  maxRetries: number = 3
) => {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await processAIRequest(request);
    } catch (error) {
      if (!isRetryable(error) || attempt === maxRetries - 1) {
        throw error;
      }
      
      const delay = Math.pow(2, attempt) * 1000;
      await sleep(delay);
    }
  }
};
```

## Privacy & Data Protection

### Data Privacy

Protect user data in AI processing.

**Measures:**
- No data stored after processing
- Encrypted transmission
- No model training on user data (unless opted in)
- GDPR compliant
- Data deletion on request
- Audit logging

### Opt-In/Opt-Out

Allow photographers to control data usage.

**Options:**
- Opt-in to model improvement
- Opt-out of face storage
- Opt-out of specific features
- Data deletion request
- Export data

## Accessibility

### AI Feature Accessibility

Ensure AI features are accessible.

**Requirements:**
- Keyboard navigation for all controls
- Screen reader support for results
- High contrast for quality scores
- Clear error messages
- Alternative text for generated content
- Captions for video analysis

## Related Files

- `frontend/src/components/ai/PhotoAnalysisPanel.tsx` - Photo analysis UI
- `frontend/src/components/ai/AutoSelectionWizard.tsx` - Smart curation
- `frontend/src/components/ai/DuplicateReviewPanel.tsx` - Duplicate detection
- `frontend/src/components/ai/BatchAnalysisProgress.tsx` - Progress tracking
- `frontend/src/components/gallery/PhotoAnalysisPanel.tsx` - Gallery analysis
- `services/aiInferenceService.ts` - AI inference integration (multi-provider Model Router; Gemini default; supports OpenAI/Anthropic/Azure-hosted/local)
- `docs/RBAC_AND_USER_MANAGEMENT.md` - Tier-based feature access

## Last Updated

2026-01-03
