# Smart Curate - AI-Powered Photo Curation

## Overview

Smart Curate is RawDrive's AI-powered photo culling system that helps photographers quickly identify their best photos from large shoots. The system uses quality analysis, blur detection, and intelligent algorithms to surface the best candidates while identifying technical rejects.

## Features

### 1. AI Quality Scoring (US1)

Analyzes each photo and assigns scores (0-100) across multiple dimensions:

| Metric | Description |
|--------|-------------|
| **Overall Score** | Weighted combination of all quality factors |
| **Sharpness Score** | Focus accuracy and detail clarity |
| **Exposure Score** | Proper light balance, no clipping |
| **Composition Score** | Rule of thirds, balance, framing |

**Quality Tiers:**
- Excellent (80-100): Publication-ready
- Good (60-79): Client-deliverable
- Fair (40-59): May need editing
- Poor (0-39): Consider rejecting

### 2. Blur Detection (US4)

Identifies and classifies blur with sophisticated detection:

| Blur Type | Description | Technical Reject? |
|-----------|-------------|-------------------|
| **Motion Blur** | Camera shake or subject movement | Yes (if severe) |
| **Focus Blur** | Missed focus or wrong focal plane | Yes (if severe) |
| **Bokeh** | Intentional artistic blur | No (preserved) |

**Severity Levels:**
- Low: Minor, often acceptable
- Medium: Noticeable, may impact usability
- High: Severe, typically reject

**Blur Regions:**
- Center: Main subject area affected
- Edges: Vignette effect or edge softness
- Full: Entire image affected

### 3. Technical Reject Classification

Photos are flagged as technical rejects when:
- High-confidence blur (>70%) that isn't intentional
- Severe blur severity ("high")
- Very low sharpness score (<40)

Technical rejects are automatically excluded from Smart Curate selection (can be toggled).

## API Endpoints

### Quality Analysis

```
GET /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/quality-analysis
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `session_id` | UUID | Filter by curation session |
| `min_score` | float | Minimum quality score |
| `max_score` | float | Maximum quality score |
| `blur_only` | bool | Only return blurry photos |
| `technical_rejects_only` | bool | Only return technical rejects |
| `limit` | int | Results per page (max 100) |
| `offset` | int | Pagination offset |

**Response:**
```json
{
  "gallery_id": "uuid",
  "results": [
    {
      "asset_id": "uuid",
      "overall_score": 75.5,
      "sharpness_score": 80.0,
      "exposure_score": 70.0,
      "composition_score": 76.5,
      "blur_detected": false,
      "blur_type": null,
      "blur_confidence": 0,
      "blur_severity": null,
      "blur_region": null,
      "is_intentional_blur": false,
      "is_technical_reject": false
    }
  ],
  "summary": {
    "total_analyzed": 150,
    "average_score": 68.3,
    "blur_count": 12,
    "excellent_count": 25,
    "good_count": 60,
    "fair_count": 45,
    "poor_count": 20
  }
}
```

### Blur Detection

```
GET /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/blur-detection
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `blur_only` | bool | Only return photos with blur |
| `technical_rejects_only` | bool | Only return technical rejects |
| `blur_type` | string | Filter by type: motion, focus, bokeh |
| `severity` | string | Filter by severity: low, medium, high |
| `limit` | int | Results per page |
| `offset` | int | Pagination offset |

**Response:**
```json
{
  "gallery_id": "uuid",
  "results": [
    {
      "asset_id": "uuid",
      "blur_detected": true,
      "blur_type": "motion",
      "blur_confidence": 0.85,
      "blur_severity": "high",
      "blur_region": "center",
      "is_intentional_blur": false,
      "is_technical_reject": true,
      "sharpness_score": 35.0
    }
  ],
  "total": 12,
  "summary": {
    "total_analyzed": 150,
    "blur_count": 12,
    "motion_blur_count": 5,
    "focus_blur_count": 4,
    "bokeh_count": 3,
    "technical_reject_count": 8,
    "severity_low": 2,
    "severity_medium": 3,
    "severity_high": 7
  }
}
```

### Smart Curation

```
POST /api/v1/workspaces/{workspace_id}/galleries/{gallery_id}/smart-tagging/curate
```

**Request Body:**
```json
{
  "count": 50,
  "quality_threshold": 0.6,
  "diversity_weight": 0.3,
  "prefer_people": true,
  "exclude_technical_rejects": true,
  "exclude_asset_ids": ["uuid1", "uuid2"]
}
```

**Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `count` | int | 10 | Number of photos to select |
| `quality_threshold` | float | 0.6 | Minimum quality score (0-1) |
| `diversity_weight` | float | 0.3 | Variety vs pure quality balance |
| `prefer_people` | bool | false | Prioritize photos with faces |
| `exclude_technical_rejects` | bool | true | Skip blurry/reject photos |
| `exclude_asset_ids` | UUID[] | null | Manually excluded photos |

## Frontend Components

### SmartCurationPanel

Main curation interface with settings controls.

```tsx
import { SmartCurationPanel } from '@/components/features/ai';

<SmartCurationPanel
  workspaceId={workspaceId}
  galleryId={galleryId}
  galleryName="Wedding Photos"
  totalPhotos={500}
  onCurationComplete={(result) => console.log('Curated:', result)}
  onSelectionChange={(ids) => console.log('Selected:', ids)}
/>
```

### BlurIndicator

Visual blur status indicator with multiple variants.

```tsx
import { BlurIndicator, BlurBadge } from '@/components/features/ai';

// Full indicator with details
<BlurIndicator
  blurDetected={true}
  blurType="motion"
  severity="high"
  confidence={0.85}
  region="center"
  isIntentional={false}
  isTechnicalReject={true}
  variant="card"
  showDetails={true}
/>

// Compact badge for lists
<BlurBadge
  blurDetected={true}
  severity="high"
  isIntentional={false}
/>
```

### QualityScoreCard

Display quality scores with visual meter.

```tsx
import { QualityScoreCard } from '@/components/features/ai';

<QualityScoreCard
  overallScore={78}
  sharpnessScore={85}
  exposureScore={72}
  compositionScore={77}
  blurDetected={false}
/>
```

### CurationProgress

Progress indicator during analysis.

```tsx
import { CurationProgress, CurationProgressMini } from '@/components/features/ai';

<CurationProgress
  status="analyzing"
  progress={{
    percent: 45,
    analyzed_count: 67,
    total_photos: 150,
    stage: "Analyzing Quality"
  }}
/>
```

## TypeScript Types

```typescript
import type {
  CurationStatus,
  BlurSeverity,
  BlurType,
  BlurRegion,
  PhotoQualityResult,
  BlurDetectionResult,
  QualityAnalysisResponse,
  BlurDetectionResponse,
} from '@/types/curation';
```

## Configuration

### Gemini API Integration

Smart Curate uses the user's Gemini API key for vision analysis. Configure via User Settings > AI Settings.

### Quality Analysis Settings

Default thresholds can be adjusted per-session:

```typescript
const settings = {
  quality_threshold: 0.6,    // Minimum score to consider
  diversity_weight: 0.3,     // Variety vs quality balance
  prefer_people: false,      // Face priority
  exclude_technical_rejects: true,  // Skip blurry photos
};
```

## Best Practices

1. **Large Galleries**: For galleries >500 photos, run quality analysis first, then curate from analyzed results.

2. **Wedding/Event Photos**: Enable `prefer_people: true` and use higher `diversity_weight` (0.4-0.5) to ensure variety.

3. **Technical Rejects**: Keep `exclude_technical_rejects: true` for final delivery; disable for review.

4. **Quality Threshold**: Start with 0.6 for general culling, increase to 0.8+ for print selection.

## Future Enhancements

- Duplicate/similarity grouping (US2)
- Target count culling (US3)
- Expression detection
- Scene clustering
- Per-person coverage
- Preference learning

## Related Documentation

- [API Standards](./TechnicalSpecs/API_STANDARDS.md)
- [AI Integration](./TechnicalSpecs/AI_INTEGRATION.md)
- [Feature Specification](../specs/023-enhanced-smart-curate/spec.md)
