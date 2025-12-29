# GEO (Generative Engine Optimization) Design Document

## Overview

The GEO system optimizes RawDrive's internal photo database for AI-powered search and discovery. Unlike traditional SEO which targets external search engines, GEO focuses on making photos maximally discoverable through semantic metadata enrichment, vector embeddings, relationship graphs, and intelligent indexing strategies. The system automatically analyzes photos to generate rich contextual data that enables natural language queries, visual similarity search, and intelligent recommendations.

## Architecture

### High-Level Components

```
┌─────────────────────────────────────────────────────────────┐
│                     GEO Orchestrator                         │
│  (Coordinates all GEO operations and scoring)                │
└────────────┬────────────────────────────────────────────────┘
             │
    ┌────────┴────────┬──────────────┬──────────────┬─────────┐
    │                 │              │              │         │
┌───▼────┐  ┌────────▼─────┐  ┌────▼─────┐  ┌────▼────┐  ┌─▼──────┐
│Metadata│  │  Embedding   │  │Semantic  │  │Context  │  │Search  │
│Enricher│  │  Optimizer   │  │  Graph   │  │Extractor│  │Indexer │
└───┬────┘  └──────┬───────┘  └────┬─────┘  └────┬────┘  └─┬──────┘
    │              │               │             │          │
    └──────────────┴───────────────┴─────────────┴──────────┘
                            │
                    ┌───────▼────────┐
                    │  GEO Database  │
                    │   (Postgres)   │
                    └────────────────┘
```

### Component Responsibilities

1. **GEO Orchestrator**: Main service coordinating all optimization operations
2. **Metadata Enricher**: Generates semantic descriptions, tags, and attributes
3. **Embedding Optimizer**: Manages vector embeddings for similarity search
4. **Semantic Graph**: Builds and maintains photo relationship networks
5. **Context Extractor**: Derives context from galleries, EXIF, and organization
6. **Search Indexer**: Maintains database indexes for fast retrieval



## Components and Interfaces

### 1. GEO Orchestrator Service

**Purpose**: Central coordination service for all GEO operations

**Interface**:
```typescript
interface GEOOrchestrator {
  // Calculate GEO quality score for a photo
  calculateGEOScore(photoId: string): Promise<GEOScore>;
  
  // Enrich metadata for under-optimized photos
  enrichPhoto(photoId: string, userId: string): Promise<EnrichmentResult>;
  
  // Batch enrich multiple photos
  enrichPhotoBatch(photoIds: string[], userId: string): Promise<BatchEnrichmentResult>;
  
  // Get optimization recommendations
  getOptimizationRecommendations(photoId: string): Promise<Recommendation[]>;
  
  // Analyze GEO health for a gallery
  analyzeGalleryGEO(galleryId: string): Promise<GalleryGEOAnalytics>;
}
```

### 2. Metadata Enricher Service

**Purpose**: Generate comprehensive semantic metadata for photos

**Interface**:
```typescript
interface MetadataEnricher {
  // Generate rich description
  generateDescription(photoUrl: string): Promise<string>;
  
  // Suggest relevant tags
  suggestTags(photoUrl: string, existingTags: string[]): Promise<TagSuggestion[]>;
  
  // Extract scene and mood
  analyzeSceneAndMood(photoUrl: string): Promise<SceneMoodAnalysis>;
  
  // Normalize and deduplicate tags
  normalizeTags(tags: string[]): Promise<string[]>;
}
```

### 3. Embedding Optimizer Service

**Purpose**: Manage vector embeddings for similarity search

**Interface**:
```typescript
interface EmbeddingOptimizer {
  // Generate or update embedding
  generateEmbedding(photoId: string, photoUrl: string): Promise<number[]>;
  
  // Validate embedding quality
  validateEmbedding(embedding: number[]): EmbeddingQuality;
  
  // Prioritize photos for embedding generation
  prioritizeEmbeddingGeneration(galleryId: string): Promise<string[]>;
  
  // Batch generate embeddings
  batchGenerateEmbeddings(photoIds: string[]): Promise<BatchEmbeddingResult>;
}
```

### 4. Semantic Graph Service

**Purpose**: Build and query photo relationship networks

**Interface**:
```typescript
interface SemanticGraphService {
  // Build relationships for a photo
  buildRelationships(photoId: string): Promise<void>;
  
  // Find related photos
  findRelatedPhotos(photoId: string, depth: number): Promise<RelatedPhoto[]>;
  
  // Update relationship strength
  updateRelationshipStrength(photo1: string, photo2: string, strength: number): Promise<void>;
  
  // Query relationship graph
  queryGraph(criteria: GraphQuery): Promise<GraphResult>;
}
```

### 5. Context Extractor Service

**Purpose**: Extract contextual metadata from various sources

**Interface**:
```typescript
interface ContextExtractor {
  // Extract gallery context
  extractGalleryContext(galleryId: string): Promise<GalleryContext>;
  
  // Extract EXIF metadata
  extractEXIFData(photoUrl: string): Promise<EXIFData>;
  
  // Infer event type from gallery
  inferEventType(galleryName: string, galleryDescription: string): Promise<EventType>;
  
  // Extract location context
  extractLocationContext(gpsData: GPSCoordinates): Promise<LocationContext>;
}
```



## Data Models

### GEO Score Model

```typescript
interface GEOScore {
  photoId: string;
  overallScore: number; // 0-100
  breakdown: {
    metadataCompleteness: number; // 0-100
    semanticRichness: number; // 0-100
    embeddingQuality: number; // 0-100
    contextualDepth: number; // 0-100
    relationshipDensity: number; // 0-100
  };
  missingFields: string[];
  recommendations: Recommendation[];
  calculatedAt: Date;
}

interface Recommendation {
  type: 'add_description' | 'enrich_tags' | 'generate_embedding' | 'add_faces' | 'extract_exif';
  priority: 'high' | 'medium' | 'low';
  impact: number; // Expected score improvement
  message: string;
  actionable: boolean;
}
```

### Photo Metadata Model (Extended)

```typescript
interface PhotoMetadata {
  // Existing fields
  id: string;
  filename: string;
  url: string;
  galleryId: string;
  
  // GEO-specific fields
  geoScore: number;
  aiDescription: string; // Rich semantic description
  tags: string[]; // Normalized tags
  sceneType: string; // e.g., "outdoor", "indoor", "studio"
  mood: string; // e.g., "joyful", "serene", "dramatic"
  dominantColors: string[]; // Hex color codes
  colorHarmony: string; // e.g., "complementary", "analogous"
  vibrancyScore: number;
  
  // Technical metadata
  exifData: EXIFData;
  cameraModel: string;
  lens: string;
  focalLength: number;
  aperture: string;
  shutterSpeed: string;
  iso: number;
  gpsCoordinates: GPSCoordinates;
  
  // AI analysis results
  qualityScores: QualityScores;
  faceAnalysis: FaceAnalysis;
  compositionAnalysis: CompositionAnalysis;
  
  // Embedding
  embedding: number[]; // 768-dimensional vector
  embeddingModel: string;
  embeddingGeneratedAt: Date;
  
  // Relationships
  relatedPhotoIds: string[];
  similarityScores: Map<string, number>;
  
  // Context
  galleryContext: GalleryContext;
  eventType: string;
  locationContext: LocationContext;
  
  // Metadata
  lastEnrichedAt: Date;
  enrichmentVersion: number;
}
```

### Semantic Relationship Model

```typescript
interface SemanticRelationship {
  id: string;
  photo1Id: string;
  photo2Id: string;
  relationshipType: RelationshipType;
  strength: number; // 0-1
  metadata: {
    visualSimilarity?: number;
    sharedTags?: string[];
    sharedSubjects?: string[];
    temporalProximity?: number; // minutes apart
    locationProximity?: number; // meters apart
    sameEvent?: boolean;
    samePeople?: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

enum RelationshipType {
  VISUAL_SIMILARITY = 'visual_similarity',
  SHARED_SUBJECT = 'shared_subject',
  SAME_EVENT = 'same_event',
  SAME_LOCATION = 'same_location',
  TEMPORAL_SEQUENCE = 'temporal_sequence',
  SAME_PEOPLE = 'same_people',
  SIMILAR_COMPOSITION = 'similar_composition',
  SIMILAR_MOOD = 'similar_mood',
}
```

### Gallery Context Model

```typescript
interface GalleryContext {
  galleryId: string;
  galleryName: string;
  galleryDescription: string;
  eventType: EventType;
  eventDate: Date;
  clientName: string;
  location: string;
  tags: string[];
  photoCount: number;
  averageGEOScore: number;
}

enum EventType {
  WEDDING = 'wedding',
  PORTRAIT = 'portrait',
  CORPORATE = 'corporate',
  PRODUCT = 'product',
  LANDSCAPE = 'landscape',
  EVENT = 'event',
  FAMILY = 'family',
  SPORTS = 'sports',
  UNKNOWN = 'unknown',
}
```



## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property Reflection

Before defining properties, we identify and eliminate redundancy:

**Redundant Properties Identified:**
- Properties 1.2 and 7.2 both test structured field storage - can be combined
- Properties 1.3 and 2.2 both test under-optimization detection - can be combined
- Properties 3.3 and 3.4 both test relationship retrieval - 3.4 subsumes 3.3
- Properties 8.2 and 8.4 both test color data structure - can be combined
- Properties 12.3 and 12.1 both test description quality - 12.1 is more comprehensive

**Consolidated Properties:**

### Core Metadata Properties

**Property 1: Automatic metadata generation**
*For any* uploaded photo, the system should automatically generate semantic metadata including ai_description, tags, scene_type, and mood fields with non-empty values.
**Validates: Requirements 1.1**

**Property 2: Structured metadata storage**
*For any* generated metadata, all fields should be stored in their correct database types (text, arrays, jsonb) with proper indexes for search performance.
**Validates: Requirements 1.2, 7.2**

**Property 3: Metadata enrichment increases GEO score**
*For any* photo, enriching its metadata should result in a GEO score that is greater than or equal to the previous score (monotonic increase).
**Validates: Requirements 1.4**

**Property 4: Semantic search leverages metadata**
*For any* natural language search query, results should include photos whose semantic metadata (description, tags, scene, mood) matches the query intent.
**Validates: Requirements 1.5**

### GEO Scoring Properties

**Property 5: GEO score bounds and structure**
*For any* analyzed photo, the GEO score should be between 0-100 inclusive, with valid breakdown scores for metadata completeness, semantic richness, embedding quality, contextual depth, and relationship density.
**Validates: Requirements 2.1**

**Property 6: Under-optimization detection**
*For any* photo with a GEO score below 70, the system should flag it for enrichment and provide specific recommendations.
**Validates: Requirements 1.3, 2.2**

**Property 7: Enrichment populates missing fields**
*For any* photo flagged for enrichment, triggering enrichment should populate at least one previously empty metadata field.
**Validates: Requirements 2.3**

**Property 8: Quota enforcement in batch operations**
*For any* batch enrichment request, the system should not exceed the user's AI quota limit and should fail gracefully when limits are reached.
**Validates: Requirements 2.4**

**Property 9: Score recalculation after enrichment**
*For any* photo that completes enrichment, the GEO score should be recalculated and the new score should reflect the metadata improvements.
**Validates: Requirements 2.5**

### Semantic Relationship Properties

**Property 10: Relationship detection**
*For any* analyzed photo, the system should identify semantic relationships (visual similarity, shared subjects, temporal proximity, etc.) with other photos in the collection.
**Validates: Requirements 3.1**

**Property 11: Bidirectional relationship storage**
*For any* identified relationship between photo A and photo B, the relationship should be queryable from both A to B and B to A.
**Validates: Requirements 3.2**

**Property 12: Graph traversal for search**
*For any* search query, the system should traverse the relationship graph to discover multi-hop connections (if A relates to B and B relates to C, then A indirectly relates to C).
**Validates: Requirements 3.4**

**Property 13: Incremental graph updates**
*For any* relationship change (addition or removal), the graph should update incrementally without requiring full reprocessing of all relationships.
**Validates: Requirements 3.5**

### Context Extraction Properties

**Property 14: Gallery context propagation**
*For any* photo in a gallery, the system should extract and associate contextual metadata from the gallery's name, description, event type, and date.
**Validates: Requirements 4.1**

**Property 15: Cascading context updates**
*For any* gallery metadata update, all photos in that gallery should receive updated contextual metadata.
**Validates: Requirements 4.2**

**Property 16: Context-aware analysis**
*For any* photo analysis, the system should incorporate gallery-level context, resulting in different contextual tags for the same photo in different galleries.
**Validates: Requirements 4.3**

**Property 17: Gallery-scoped search weighting**
*For any* search within a specific gallery, results should weight gallery-specific context higher than global metadata.
**Validates: Requirements 4.4**

**Property 18: Context updates on photo movement**
*For any* photo moved between galleries, the system should update its contextual metadata to reflect the new gallery's context.
**Validates: Requirements 4.5**

### Embedding Properties

**Property 19: Embedding dimensionality and normalization**
*For any* stored embedding, it should be exactly 768-dimensional and normalized to unit length (L2 norm = 1).
**Validates: Requirements 5.2**

**Property 20: Embedding prioritization by access frequency**
*For any* set of photos missing embeddings, the system should prioritize generation for photos with higher access counts.
**Validates: Requirements 5.3**

**Property 21: Cosine similarity with thresholds**
*For any* similarity search, the system should use cosine similarity and apply configurable thresholds to filter results.
**Validates: Requirements 5.4**

**Property 22: Low-quality embedding flagging**
*For any* embedding with low confidence or generated by an outdated model, the system should flag the photo for re-embedding.
**Validates: Requirements 5.5**

### EXIF and Technical Metadata Properties

**Property 23: EXIF extraction completeness**
*For any* uploaded photo with EXIF data, the system should extract all available fields including camera model, lens, focal length, aperture, shutter speed, ISO, and GPS coordinates.
**Validates: Requirements 7.1**

**Property 24: EXIF field typing and indexing**
*For any* extracted EXIF data, fields should be stored in appropriate types (integers for ISO, decimals for aperture, strings for camera model) with database indexes for range queries.
**Validates: Requirements 7.2**

**Property 25: Missing EXIF flagging**
*For any* photo without EXIF data, the system should mark it as having incomplete technical metadata.
**Validates: Requirements 7.3**

**Property 26: Technical criteria range queries**
*For any* search by technical criteria (e.g., "ISO > 3200", "focal length 50-85mm"), the system should return only photos matching the specified range.
**Validates: Requirements 7.4**

**Property 27: GPS-based location search**
*For any* photo with GPS coordinates in EXIF, the system should enable location-based search queries.
**Validates: Requirements 7.5**

### Color Analysis Properties

**Property 28: Color extraction and storage**
*For any* analyzed photo, the system should extract dominant colors as hex codes with coverage percentages and store them in a standardized color space.
**Validates: Requirements 8.1, 8.2, 8.4**

**Property 29: Color-based search**
*For any* color-based search query (e.g., "warm toned", "blue dominant"), the system should return photos whose color palettes match the query criteria.
**Validates: Requirements 8.3**

**Property 30: Mood inference from colors**
*For any* photo with color analysis, the system should infer and tag mood descriptors (vibrant, muted, dramatic, serene) based on color characteristics.
**Validates: Requirements 8.5**

### Face and Person Properties

**Property 31: Face detection data structure**
*For any* photo with detected faces, the system should store face count, bounding boxes, expressions, and person identifiers in the correct structure.
**Validates: Requirements 9.1**

**Property 32: Person tag association**
*For any* person tag added to a photo, the system should associate it with the corresponding face detection data.
**Validates: Requirements 9.2**

**Property 33: Person-based search**
*For any* search query for a specific person, the system should return all photos tagged with that person.
**Validates: Requirements 9.3**

**Property 34: Expression-based search**
*For any* search by facial expression (e.g., "smiling", "candid"), the system should return photos with matching expression data.
**Validates: Requirements 9.4**

**Property 35: Person relationship relevance boost**
*For any* search involving people, the system should boost relevance for photos containing related individuals.
**Validates: Requirements 9.5**

### Analytics and Monitoring Properties

**Property 36: Aggregate GEO metrics calculation**
*For any* GEO analytics request, the system should calculate aggregate metrics (average score, metadata completeness, embedding coverage, search success rate) correctly from underlying data.
**Validates: Requirements 10.1**

**Property 37: Score decline alerting**
*For any* significant decline in GEO scores, the system should trigger administrator alerts.
**Validates: Requirements 10.2**

**Property 38: Failed query pattern analysis**
*For any* set of search queries, the system should identify and report patterns in failed queries and metadata gaps.
**Validates: Requirements 10.3**

**Property 39: Impact-prioritized recommendations**
*For any* optimization recommendation, the system should prioritize by expected impact on GEO scores.
**Validates: Requirements 10.4**

**Property 40: Segmented metric reporting**
*For any* GEO health report, metrics should be correctly segmented by user tier, gallery type, and photo age.
**Validates: Requirements 10.5**

### User-Facing Properties

**Property 41: Specific optimization recommendations**
*For any* under-optimized photo, the system should provide specific, actionable recommendations (not generic advice).
**Validates: Requirements 11.2**

**Property 42: Gallery-level aggregate scores**
*For any* gallery, the system should calculate and display aggregate GEO scores correctly from all contained photos.
**Validates: Requirements 11.3**

**Property 43: Score improvement notifications**
*For any* photo whose GEO score improves by more than 10 points, the system should notify the photographer.
**Validates: Requirements 11.5**

### Description Generation Properties

**Property 44: Detailed description generation**
*For any* photo, generated descriptions should contain specific visual details (subject, composition, lighting, mood, setting) and avoid generic phrases like "nice photo" or "good quality".
**Validates: Requirements 12.1, 12.3**

**Property 45: Description full-text indexing**
*For any* generated description, it should be indexed for full-text search with proper tokenization and stemming.
**Validates: Requirements 12.2**

**Property 46: Description merging without redundancy**
*For any* photo with multiple descriptions, the system should merge them into a single comprehensive narrative without duplicate information.
**Validates: Requirements 12.4**

**Property 47: Description formatting**
*For any* generated description, it should have proper grammar, punctuation, and readability formatting.
**Validates: Requirements 12.5**

### Tag Management Properties

**Property 48: Multi-category tag generation**
*For any* analyzed photo, suggested tags should cover multiple categories (subjects, actions, locations, styles, moods, technical attributes).
**Validates: Requirements 13.1**

**Property 49: Tag relevance ranking**
*For any* set of suggested tags, they should be ranked by relevance and confidence scores.
**Validates: Requirements 13.2**

**Property 50: Tag preference learning**
*For any* photographer's tag acceptance/rejection pattern, the system should adjust future tag suggestions to match their preferences.
**Validates: Requirements 13.4**

**Property 51: Tag normalization suggestions**
*For any* collection with divergent tag vocabularies (e.g., "portrait" vs "portraits" vs "headshot"), the system should suggest normalization to maintain consistency.
**Validates: Requirements 13.5**

### Semantic Search Properties

**Property 52: Query intent extraction**
*For any* natural language search query, the system should parse it into structured components (intent, entities, attributes, constraints).
**Validates: Requirements 14.1**

**Property 53: Context-based disambiguation**
*For any* ambiguous search query, the system should use context (recent searches, gallery focus) to disambiguate intent.
**Validates: Requirements 14.2**

**Property 54: Multi-field semantic matching**
*For any* semantic search, the system should match against descriptions, tags, EXIF data, and inferred attributes.
**Validates: Requirements 14.3**

**Property 55: Multi-factor relevance ranking**
*For any* search results, ranking should consider semantic relevance, recency, quality scores, and user preferences.
**Validates: Requirements 14.4**

**Property 56: Alternative query suggestions**
*For any* search query that returns zero results, the system should suggest alternative phrasings or related concepts.
**Validates: Requirements 14.5**



## GEO Scoring Algorithm

### Score Calculation Formula

```typescript
function calculateGEOScore(photo: PhotoMetadata): GEOScore {
  const weights = {
    metadataCompleteness: 0.25,
    semanticRichness: 0.30,
    embeddingQuality: 0.20,
    contextualDepth: 0.15,
    relationshipDensity: 0.10,
  };
  
  const breakdown = {
    metadataCompleteness: calculateMetadataCompleteness(photo),
    semanticRichness: calculateSemanticRichness(photo),
    embeddingQuality: calculateEmbeddingQuality(photo),
    contextualDepth: calculateContextualDepth(photo),
    relationshipDensity: calculateRelationshipDensity(photo),
  };
  
  const overallScore = 
    breakdown.metadataCompleteness * weights.metadataCompleteness +
    breakdown.semanticRichness * weights.semanticRichness +
    breakdown.embeddingQuality * weights.embeddingQuality +
    breakdown.contextualDepth * weights.contextualDepth +
    breakdown.relationshipDensity * weights.relationshipDensity;
  
  return {
    photoId: photo.id,
    overallScore: Math.round(overallScore),
    breakdown,
    missingFields: identifyMissingFields(photo),
    recommendations: generateRecommendations(photo, breakdown),
    calculatedAt: new Date(),
  };
}
```

### Component Score Calculations

**1. Metadata Completeness (0-100)**
```typescript
function calculateMetadataCompleteness(photo: PhotoMetadata): number {
  const requiredFields = [
    'aiDescription',
    'tags',
    'sceneType',
    'mood',
    'dominantColors',
    'exifData',
    'qualityScores',
  ];
  
  let score = 0;
  
  // Core fields (60 points)
  if (photo.aiDescription && photo.aiDescription.length > 50) score += 15;
  if (photo.tags && photo.tags.length >= 5) score += 15;
  if (photo.sceneType) score += 10;
  if (photo.mood) score += 10;
  if (photo.dominantColors && photo.dominantColors.length >= 3) score += 10;
  
  // Technical metadata (20 points)
  if (photo.exifData) {
    if (photo.exifData.cameraModel) score += 5;
    if (photo.exifData.lens) score += 5;
    if (photo.exifData.iso) score += 5;
    if (photo.exifData.gpsCoordinates) score += 5;
  }
  
  // AI analysis (20 points)
  if (photo.qualityScores) score += 10;
  if (photo.faceAnalysis) score += 10;
  
  return Math.min(score, 100);
}
```

**2. Semantic Richness (0-100)**
```typescript
function calculateSemanticRichness(photo: PhotoMetadata): number {
  let score = 0;
  
  // Description quality (40 points)
  if (photo.aiDescription) {
    const wordCount = photo.aiDescription.split(' ').length;
    if (wordCount >= 50) score += 20;
    else if (wordCount >= 30) score += 15;
    else if (wordCount >= 15) score += 10;
    
    // Check for specific details
    const hasSubject = /\b(person|people|man|woman|child|couple|family)\b/i.test(photo.aiDescription);
    const hasComposition = /\b(foreground|background|centered|framed|balanced)\b/i.test(photo.aiDescription);
    const hasLighting = /\b(light|shadow|bright|dark|golden hour|sunset)\b/i.test(photo.aiDescription);
    const hasMood = /\b(joyful|serene|dramatic|peaceful|energetic)\b/i.test(photo.aiDescription);
    
    if (hasSubject) score += 5;
    if (hasComposition) score += 5;
    if (hasLighting) score += 5;
    if (hasMood) score += 5;
  }
  
  // Tag diversity (30 points)
  if (photo.tags) {
    const tagCategories = categorize Tags(photo.tags);
    score += Math.min(tagCategories.size * 6, 30);
  }
  
  // Scene and mood (20 points)
  if (photo.sceneType) score += 10;
  if (photo.mood) score += 10;
  
  // Color analysis (10 points)
  if (photo.dominantColors && photo.colorHarmony) score += 10;
  
  return Math.min(score, 100);
}
```

**3. Embedding Quality (0-100)**
```typescript
function calculateEmbeddingQuality(photo: PhotoMetadata): number {
  if (!photo.embedding) return 0;
  
  let score = 50; // Base score for having an embedding
  
  // Dimensionality check (20 points)
  if (photo.embedding.length === 768) score += 20;
  
  // Normalization check (15 points)
  const norm = Math.sqrt(photo.embedding.reduce((sum, val) => sum + val * val, 0));
  if (Math.abs(norm - 1.0) < 0.01) score += 15;
  
  // Recency (15 points)
  if (photo.embeddingGeneratedAt) {
    const daysSinceGeneration = (Date.now() - photo.embeddingGeneratedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceGeneration < 30) score += 15;
    else if (daysSinceGeneration < 90) score += 10;
    else if (daysSinceGeneration < 180) score += 5;
  }
  
  return Math.min(score, 100);
}
```

**4. Contextual Depth (0-100)**
```typescript
function calculateContextualDepth(photo: PhotoMetadata): number {
  let score = 0;
  
  // Gallery context (40 points)
  if (photo.galleryContext) {
    if (photo.galleryContext.eventType !== 'unknown') score += 15;
    if (photo.galleryContext.eventDate) score += 10;
    if (photo.galleryContext.clientName) score += 10;
    if (photo.galleryContext.location) score += 5;
  }
  
  // Location context (30 points)
  if (photo.locationContext) {
    if (photo.locationContext.city) score += 10;
    if (photo.locationContext.country) score += 10;
    if (photo.locationContext.venue) score += 10;
  }
  
  // Temporal context (15 points)
  if (photo.exifData?.captureDate) score += 15;
  
  // People context (15 points)
  if (photo.faceAnalysis && photo.faceAnalysis.faceCount > 0) {
    score += Math.min(photo.faceAnalysis.faceCount * 5, 15);
  }
  
  return Math.min(score, 100);
}
```

**5. Relationship Density (0-100)**
```typescript
function calculateRelationshipDensity(photo: PhotoMetadata): number {
  if (!photo.relatedPhotoIds || photo.relatedPhotoIds.length === 0) return 0;
  
  let score = 0;
  
  // Number of relationships (50 points)
  const relationshipCount = photo.relatedPhotoIds.length;
  if (relationshipCount >= 20) score += 50;
  else if (relationshipCount >= 10) score += 40;
  else if (relationshipCount >= 5) score += 30;
  else score += relationshipCount * 6;
  
  // Relationship diversity (30 points)
  // Count different relationship types
  const relationshipTypes = new Set<RelationshipType>();
  // Query relationships to get types
  // score += Math.min(relationshipTypes.size * 10, 30);
  
  // Relationship strength (20 points)
  if (photo.similarityScores) {
    const avgStrength = Array.from(photo.similarityScores.values())
      .reduce((sum, val) => sum + val, 0) / photo.similarityScores.size;
    score += avgStrength * 20;
  }
  
  return Math.min(score, 100);
}
```

### Recommendation Generation

```typescript
function generateRecommendations(photo: PhotoMetadata, breakdown: GEOScoreBreakdown): Recommendation[] {
  const recommendations: Recommendation[] = [];
  
  // Metadata completeness recommendations
  if (breakdown.metadataCompleteness < 70) {
    if (!photo.aiDescription || photo.aiDescription.length < 50) {
      recommendations.push({
        type: 'add_description',
        priority: 'high',
        impact: 15,
        message: 'Generate a detailed AI description to improve discoverability',
        actionable: true,
      });
    }
    
    if (!photo.tags || photo.tags.length < 5) {
      recommendations.push({
        type: 'enrich_tags',
        priority: 'high',
        impact: 15,
        message: 'Add more descriptive tags (currently has ' + (photo.tags?.length || 0) + ', recommended: 5+)',
        actionable: true,
      });
    }
    
    if (!photo.exifData) {
      recommendations.push({
        type: 'extract_exif',
        priority: 'medium',
        impact: 10,
        message: 'Extract EXIF metadata from the original file',
        actionable: true,
      });
    }
  }
  
  // Semantic richness recommendations
  if (breakdown.semanticRichness < 70) {
    if (!photo.sceneType) {
      recommendations.push({
        type: 'add_scene',
        priority: 'medium',
        impact: 10,
        message: 'Analyze and tag the scene type (indoor/outdoor/studio)',
        actionable: true,
      });
    }
    
    if (!photo.mood) {
      recommendations.push({
        type: 'add_mood',
        priority: 'medium',
        impact: 10,
        message: 'Analyze and tag the photo mood/atmosphere',
        actionable: true,
      });
    }
  }
  
  // Embedding quality recommendations
  if (breakdown.embeddingQuality < 70) {
    if (!photo.embedding) {
      recommendations.push({
        type: 'generate_embedding',
        priority: 'high',
        impact: 20,
        message: 'Generate vector embedding for similarity search',
        actionable: true,
      });
    } else if (photo.embeddingGeneratedAt) {
      const daysSince = (Date.now() - photo.embeddingGeneratedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince > 180) {
        recommendations.push({
          type: 'regenerate_embedding',
          priority: 'low',
          impact: 5,
          message: 'Regenerate embedding with latest model',
          actionable: true,
        });
      }
    }
  }
  
  // Contextual depth recommendations
  if (breakdown.contextualDepth < 70) {
    if (!photo.galleryContext?.eventType || photo.galleryContext.eventType === 'unknown') {
      recommendations.push({
        type: 'add_event_type',
        priority: 'medium',
        impact: 15,
        message: 'Set the event type for this gallery',
        actionable: true,
      });
    }
    
    if (!photo.faceAnalysis) {
      recommendations.push({
        type: 'add_faces',
        priority: 'medium',
        impact: 15,
        message: 'Run face detection to identify people',
        actionable: true,
      });
    }
  }
  
  // Relationship density recommendations
  if (breakdown.relationshipDensity < 50) {
    recommendations.push({
      type: 'build_relationships',
      priority: 'low',
      impact: 10,
      message: 'Build semantic relationships with similar photos',
      actionable: true,
    });
  }
  
  // Sort by priority and impact
  recommendations.sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    const priorityDiff = priorityOrder[b.priority] - priorityOrder[a.priority];
    if (priorityDiff !== 0) return priorityDiff;
    return b.impact - a.impact;
  });
  
  return recommendations;
}
```



## Error Handling

### Error Categories

1. **AI Service Errors**
   - Gemini API failures (rate limits, timeouts, invalid responses)
   - Quota exceeded errors
   - Model unavailability

2. **Data Validation Errors**
   - Invalid embedding dimensions
   - Malformed metadata
   - Missing required fields

3. **Database Errors**
   - Connection failures
   - Query timeouts
   - Constraint violations

4. **Processing Errors**
   - Image fetch failures
   - EXIF extraction errors
   - Relationship graph inconsistencies

### Error Handling Strategies

```typescript
class GEOErrorHandler {
  async handleEnrichmentError(error: Error, photoId: string): Promise<void> {
    if (error instanceof QuotaExceededError) {
      // Log and notify user
      logger.warn('AI quota exceeded during enrichment', { photoId });
      await notificationService.notifyQuotaExceeded(photoId);
      throw new UserFacingError('AI credit limit reached. Upgrade your plan for more credits.');
    }
    
    if (error instanceof GeminiAPIError) {
      // Retry with exponential backoff
      logger.error('Gemini API error during enrichment', { error, photoId });
      if (error.isRetryable) {
        return this.retryWithBackoff(() => this.enrichPhoto(photoId));
      }
      // Fall back to local analysis
      return this.fallbackToLocalAnalysis(photoId);
    }
    
    if (error instanceof ValidationError) {
      // Log validation error and skip
      logger.error('Validation error during enrichment', { error, photoId });
      throw new UserFacingError('Photo metadata validation failed. Please check the photo file.');
    }
    
    // Generic error handling
    logger.error('Unexpected error during enrichment', { error, photoId });
    throw new UserFacingError('Failed to enrich photo metadata. Please try again later.');
  }
  
  async handleSearchError(error: Error, query: string): Promise<void> {
    if (error instanceof DatabaseTimeoutError) {
      logger.error('Database timeout during search', { error, query });
      throw new UserFacingError('Search is taking too long. Try a more specific query.');
    }
    
    if (error instanceof InvalidQueryError) {
      logger.warn('Invalid search query', { error, query });
      throw new UserFacingError('Invalid search query. Please rephrase your search.');
    }
    
    logger.error('Unexpected error during search', { error, query });
    throw new UserFacingError('Search failed. Please try again.');
  }
  
  private async retryWithBackoff<T>(fn: () => Promise<T>, maxRetries: number = 3): Promise<T> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        if (attempt === maxRetries - 1) throw error;
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    throw new Error('Max retries exceeded');
  }
}
```

### Graceful Degradation

When AI services are unavailable, the system should degrade gracefully:

1. **Metadata Enrichment**: Fall back to basic EXIF extraction and manual tagging
2. **Similarity Search**: Use tag-based search instead of vector similarity
3. **Description Generation**: Use template-based descriptions with EXIF data
4. **Relationship Building**: Use temporal and gallery-based relationships only



## Testing Strategy

### Unit Testing

**Test Coverage Requirements:**
- GEO scoring algorithm: 95%+ coverage
- Metadata enrichment: 90%+ coverage
- Relationship graph operations: 90%+ coverage
- Search indexing: 85%+ coverage

**Key Unit Tests:**

1. **GEO Score Calculation**
   - Test score bounds (0-100)
   - Test breakdown component calculations
   - Test recommendation generation
   - Test edge cases (empty metadata, missing fields)

2. **Metadata Enrichment**
   - Test description generation quality
   - Test tag suggestion and ranking
   - Test scene and mood inference
   - Test EXIF extraction

3. **Embedding Operations**
   - Test dimensionality validation
   - Test normalization
   - Test similarity calculations
   - Test prioritization logic

4. **Relationship Graph**
   - Test relationship detection
   - Test bidirectional queries
   - Test graph traversal
   - Test incremental updates

### Property-Based Testing

The model will use **fast-check** (JavaScript/TypeScript property-based testing library) for property tests.

**Configuration:**
- Minimum 100 iterations per property test
- Use seed-based randomization for reproducibility
- Generate realistic test data (photos with varying metadata completeness)

**Property Test Examples:**

```typescript
import fc from 'fast-check';

describe('GEO Score Properties', () => {
  it('Property 1: Metadata enrichment increases GEO score', () => {
    fc.assert(
      fc.property(
        fc.record({
          photoId: fc.uuid(),
          aiDescription: fc.option(fc.string({ minLength: 10, maxLength: 200 })),
          tags: fc.array(fc.string(), { maxLength: 10 }),
          sceneType: fc.option(fc.constantFrom('indoor', 'outdoor', 'studio')),
          mood: fc.option(fc.constantFrom('joyful', 'serene', 'dramatic')),
        }),
        async (photo) => {
          const scoreBefore = await geoOrchestrator.calculateGEOScore(photo.photoId);
          await geoOrchestrator.enrichPhoto(photo.photoId);
          const scoreAfter = await geoOrchestrator.calculateGEOScore(photo.photoId);
          
          // Score should increase or stay the same
          expect(scoreAfter.overallScore).toBeGreaterThanOrEqual(scoreBefore.overallScore);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('Property 5: GEO score bounds and structure', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        async (photoId) => {
          const score = await geoOrchestrator.calculateGEOScore(photoId);
          
          // Overall score bounds
          expect(score.overallScore).toBeGreaterThanOrEqual(0);
          expect(score.overallScore).toBeLessThanOrEqual(100);
          
          // Breakdown scores bounds
          expect(score.breakdown.metadataCompleteness).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.metadataCompleteness).toBeLessThanOrEqual(100);
          expect(score.breakdown.semanticRichness).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.semanticRichness).toBeLessThanOrEqual(100);
          expect(score.breakdown.embeddingQuality).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.embeddingQuality).toBeLessThanOrEqual(100);
          expect(score.breakdown.contextualDepth).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.contextualDepth).toBeLessThanOrEqual(100);
          expect(score.breakdown.relationshipDensity).toBeGreaterThanOrEqual(0);
          expect(score.breakdown.relationshipDensity).toBeLessThanOrEqual(100);
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('Property 19: Embedding dimensionality and normalization', () => {
    fc.assert(
      fc.property(
        fc.uuid(),
        async (photoId) => {
          const photo = await photoRepository.findById(photoId);
          
          if (photo.embedding) {
            // Must be 768-dimensional
            expect(photo.embedding.length).toBe(768);
            
            // Must be normalized (L2 norm = 1)
            const norm = Math.sqrt(
              photo.embedding.reduce((sum, val) => sum + val * val, 0)
            );
            expect(Math.abs(norm - 1.0)).toBeLessThan(0.01);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
  
  it('Property 11: Bidirectional relationship storage', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.uuid(), fc.uuid()),
        async ([photoId1, photoId2]) => {
          // Create relationship from photo1 to photo2
          await semanticGraphService.buildRelationships(photoId1);
          
          // Query from both directions
          const relatedFromPhoto1 = await semanticGraphService.findRelatedPhotos(photoId1, 1);
          const relatedFromPhoto2 = await semanticGraphService.findRelatedPhotos(photoId2, 1);
          
          // If photo2 is related to photo1, then photo1 should be related to photo2
          const photo2InRelated1 = relatedFromPhoto1.some(r => r.photoId === photoId2);
          const photo1InRelated2 = relatedFromPhoto2.some(r => r.photoId === photoId1);
          
          if (photo2InRelated1) {
            expect(photo1InRelated2).toBe(true);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Testing

**Test Scenarios:**

1. **End-to-End Enrichment Flow**
   - Upload photo → Extract EXIF → Generate description → Suggest tags → Calculate GEO score
   - Verify all metadata is correctly stored and indexed

2. **Search Integration**
   - Enrich photos → Perform natural language search → Verify results match query intent
   - Test semantic search, tag search, EXIF search, and combined queries

3. **Relationship Graph Integration**
   - Build relationships for gallery → Query related photos → Verify graph traversal
   - Test multi-hop connections and relationship strength calculations

4. **Quota and Access Control**
   - Test enrichment with quota limits → Verify quota enforcement
   - Test feature access by tier → Verify tier restrictions

### Performance Testing

**Performance Benchmarks:**

1. **GEO Score Calculation**: < 50ms per photo
2. **Metadata Enrichment**: < 3 seconds per photo (with AI)
3. **Embedding Generation**: < 2 seconds per photo
4. **Similarity Search**: < 500ms for 10,000 photos
5. **Relationship Building**: < 5 seconds per photo
6. **Batch Enrichment**: < 30 seconds for 100 photos

**Load Testing:**
- Test with 100,000+ photos in database
- Test concurrent enrichment requests
- Test search performance under load
- Test relationship graph queries at scale

### Test Data Generation

```typescript
// Generate realistic test photos with varying metadata completeness
function generateTestPhoto(completeness: 'minimal' | 'partial' | 'complete'): PhotoMetadata {
  const base = {
    id: uuid(),
    filename: `test-photo-${Date.now()}.jpg`,
    url: `https://test.com/photos/${uuid()}.jpg`,
    galleryId: uuid(),
  };
  
  if (completeness === 'minimal') {
    return base;
  }
  
  if (completeness === 'partial') {
    return {
      ...base,
      aiDescription: 'A photo of a person outdoors',
      tags: ['portrait', 'outdoor'],
      sceneType: 'outdoor',
    };
  }
  
  // Complete metadata
  return {
    ...base,
    aiDescription: 'A joyful portrait of a young woman in a sunlit meadow, with golden hour lighting creating a warm glow. The composition follows the rule of thirds with the subject positioned on the right third, looking towards the left. Shallow depth of field creates a beautiful bokeh effect in the background.',
    tags: ['portrait', 'outdoor', 'golden hour', 'woman', 'meadow', 'bokeh', 'natural light'],
    sceneType: 'outdoor',
    mood: 'joyful',
    dominantColors: ['#F4A460', '#8FBC8F', '#FFD700'],
    colorHarmony: 'analogous',
    vibrancyScore: 85,
    exifData: {
      cameraModel: 'Canon EOS R5',
      lens: 'RF 85mm f/1.2',
      focalLength: 85,
      aperture: 'f/1.8',
      shutterSpeed: '1/500',
      iso: 400,
      captureDate: new Date(),
      gpsCoordinates: { lat: 37.7749, lon: -122.4194 },
    },
    qualityScores: {
      overall: 92,
      composition: 95,
      exposure: 90,
      focus: 94,
      color: 88,
      technical: 90,
    },
    faceAnalysis: {
      faceCount: 1,
      faces: [{
        boundingBox: { x: 0.4, y: 0.3, width: 0.2, height: 0.3 },
        confidence: 0.95,
        emotion: 'happy',
        emotionConfidence: 0.92,
      }],
      dominantEmotion: 'happy',
      groupPhoto: false,
    },
    embedding: generateNormalizedEmbedding(),
    embeddingModel: 'clip-vit-large',
    embeddingGeneratedAt: new Date(),
  };
}

function generateNormalizedEmbedding(): number[] {
  // Generate random 768-dimensional vector and normalize
  const embedding = Array.from({ length: 768 }, () => Math.random() - 0.5);
  const norm = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
  return embedding.map(val => val / norm);
}
```



## Database Schema

### New Tables

```sql
-- GEO Scores table
CREATE TABLE geo_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE UNIQUE,
  overall_score INTEGER NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  metadata_completeness INTEGER CHECK (metadata_completeness >= 0 AND metadata_completeness <= 100),
  semantic_richness INTEGER CHECK (semantic_richness >= 0 AND semantic_richness <= 100),
  embedding_quality INTEGER CHECK (embedding_quality >= 0 AND embedding_quality <= 100),
  contextual_depth INTEGER CHECK (contextual_depth >= 0 AND contextual_depth <= 100),
  relationship_density INTEGER CHECK (relationship_density >= 0 AND relationship_density <= 100),
  missing_fields TEXT[],
  recommendations JSONB,
  calculated_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_geo_scores_photo ON geo_scores(photo_id);
CREATE INDEX idx_geo_scores_overall ON geo_scores(overall_score DESC);
CREATE INDEX idx_geo_scores_under_optimized ON geo_scores(overall_score) WHERE overall_score < 70;

-- Semantic Relationships table
CREATE TABLE semantic_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo1_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  photo2_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  relationship_type VARCHAR(50) NOT NULL,
  strength DECIMAL(3,2) NOT NULL CHECK (strength >= 0 AND strength <= 1),
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(photo1_id, photo2_id, relationship_type),
  CHECK (photo1_id != photo2_id)
);

CREATE INDEX idx_relationships_photo1 ON semantic_relationships(photo1_id);
CREATE INDEX idx_relationships_photo2 ON semantic_relationships(photo2_id);
CREATE INDEX idx_relationships_type ON semantic_relationships(relationship_type);
CREATE INDEX idx_relationships_strength ON semantic_relationships(strength DESC);
CREATE INDEX idx_relationships_bidirectional ON semantic_relationships(photo1_id, photo2_id);

-- Gallery Context table
CREATE TABLE gallery_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gallery_id UUID NOT NULL REFERENCES galleries(id) ON DELETE CASCADE UNIQUE,
  event_type VARCHAR(50) NOT NULL DEFAULT 'unknown',
  event_date DATE,
  client_name VARCHAR(255),
  location VARCHAR(255),
  extracted_tags TEXT[],
  photo_count INTEGER DEFAULT 0,
  average_geo_score DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_gallery_context_gallery ON gallery_context(gallery_id);
CREATE INDEX idx_gallery_context_event_type ON gallery_context(event_type);
CREATE INDEX idx_gallery_context_event_date ON gallery_context(event_date);

-- Photo Enrichment Log table
CREATE TABLE photo_enrichment_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id UUID NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
  enrichment_type VARCHAR(50) NOT NULL,
  status VARCHAR(20) NOT NULL,
  error_message TEXT,
  credits_used INTEGER DEFAULT 0,
  processing_time_ms INTEGER,
  geo_score_before INTEGER,
  geo_score_after INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_enrichment_log_photo ON photo_enrichment_log(photo_id);
CREATE INDEX idx_enrichment_log_status ON photo_enrichment_log(status);
CREATE INDEX idx_enrichment_log_created ON photo_enrichment_log(created_at DESC);

-- Search Query Log table
CREATE TABLE search_query_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  query_text TEXT NOT NULL,
  query_type VARCHAR(50) NOT NULL,
  results_count INTEGER NOT NULL,
  selected_photo_ids UUID[],
  processing_time_ms INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_search_log_user ON search_query_log(user_id);
CREATE INDEX idx_search_log_created ON search_query_log(created_at DESC);
CREATE INDEX idx_search_log_results ON search_query_log(results_count);
```

### Extended Photos Table

```sql
-- Add GEO-specific columns to existing photos table
ALTER TABLE photos ADD COLUMN IF NOT EXISTS scene_type VARCHAR(50);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS mood VARCHAR(50);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS dominant_colors TEXT[];
ALTER TABLE photos ADD COLUMN IF NOT EXISTS color_harmony VARCHAR(50);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS vibrancy_score INTEGER CHECK (vibrancy_score >= 0 AND vibrancy_score <= 100);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS embedding_model VARCHAR(50);
ALTER TABLE photos ADD COLUMN IF NOT EXISTS embedding_generated_at TIMESTAMP;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMP;
ALTER TABLE photos ADD COLUMN IF NOT EXISTS enrichment_version INTEGER DEFAULT 1;

-- Add indexes for GEO search
CREATE INDEX IF NOT EXISTS idx_photos_scene_type ON photos(scene_type);
CREATE INDEX IF NOT EXISTS idx_photos_mood ON photos(mood);
CREATE INDEX IF NOT EXISTS idx_photos_dominant_colors ON photos USING GIN(dominant_colors);
CREATE INDEX IF NOT EXISTS idx_photos_ai_description_fts ON photos USING GIN(to_tsvector('english', ai_description));
CREATE INDEX IF NOT EXISTS idx_photos_tags_fts ON photos USING GIN(to_tsvector('english', array_to_string(tags, ' ')));
```

### Materialized Views for Analytics

```sql
-- GEO Analytics Summary (refreshed hourly)
CREATE MATERIALIZED VIEW geo_analytics_summary AS
SELECT
  DATE_TRUNC('day', gs.calculated_at) as date,
  COUNT(*) as total_photos,
  AVG(gs.overall_score) as avg_geo_score,
  AVG(gs.metadata_completeness) as avg_metadata_completeness,
  AVG(gs.semantic_richness) as avg_semantic_richness,
  AVG(gs.embedding_quality) as avg_embedding_quality,
  AVG(gs.contextual_depth) as avg_contextual_depth,
  AVG(gs.relationship_density) as avg_relationship_density,
  COUNT(*) FILTER (WHERE gs.overall_score < 70) as under_optimized_count,
  COUNT(*) FILTER (WHERE p.embedding IS NOT NULL) as photos_with_embeddings
FROM geo_scores gs
JOIN photos p ON gs.photo_id = p.id
WHERE p.deleted_at IS NULL
GROUP BY DATE_TRUNC('day', gs.calculated_at);

CREATE UNIQUE INDEX idx_geo_analytics_date ON geo_analytics_summary(date);

-- Search Performance Summary (refreshed daily)
CREATE MATERIALIZED VIEW search_performance_summary AS
SELECT
  DATE_TRUNC('day', created_at) as date,
  query_type,
  COUNT(*) as total_queries,
  AVG(results_count) as avg_results_count,
  AVG(processing_time_ms) as avg_processing_time_ms,
  COUNT(*) FILTER (WHERE results_count = 0) as failed_queries_count,
  COUNT(*) FILTER (WHERE array_length(selected_photo_ids, 1) > 0) as queries_with_selections
FROM search_query_log
GROUP BY DATE_TRUNC('day', created_at), query_type;

CREATE UNIQUE INDEX idx_search_perf_date_type ON search_performance_summary(date, query_type);
```

## Performance Optimization

### Database Indexing Strategy

1. **Full-Text Search Indexes**
   - GIN indexes on `ai_description` and `tags` for fast text search
   - Trigram indexes for fuzzy matching

2. **Vector Search Optimization**
   - IVFFlat index on `embedding` column for approximate nearest neighbor search
   - Tune `lists` parameter based on dataset size

3. **Relationship Graph Indexes**
   - Composite indexes on `(photo1_id, photo2_id)` for bidirectional queries
   - Index on `relationship_type` for filtered queries

4. **Temporal Indexes**
   - Indexes on `created_at`, `updated_at` for time-based queries
   - Partial indexes on recent data (last 30 days)

### Caching Strategy

```typescript
class GEOCacheService {
  private redis: Redis;
  
  // Cache GEO scores (TTL: 1 hour)
  async cacheGEOScore(photoId: string, score: GEOScore): Promise<void> {
    await this.redis.setex(
      `geo:score:${photoId}`,
      3600,
      JSON.stringify(score)
    );
  }
  
  async getCachedGEOScore(photoId: string): Promise<GEOScore | null> {
    const cached = await this.redis.get(`geo:score:${photoId}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  // Cache search results (TTL: 15 minutes)
  async cacheSearchResults(queryHash: string, results: any[]): Promise<void> {
    await this.redis.setex(
      `geo:search:${queryHash}`,
      900,
      JSON.stringify(results)
    );
  }
  
  async getCachedSearchResults(queryHash: string): Promise<any[] | null> {
    const cached = await this.redis.get(`geo:search:${queryHash}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  // Cache relationship graph (TTL: 30 minutes)
  async cacheRelationships(photoId: string, relationships: any[]): Promise<void> {
    await this.redis.setex(
      `geo:relationships:${photoId}`,
      1800,
      JSON.stringify(relationships)
    );
  }
  
  async getCachedRelationships(photoId: string): Promise<any[] | null> {
    const cached = await this.redis.get(`geo:relationships:${photoId}`);
    return cached ? JSON.parse(cached) : null;
  }
  
  // Invalidate caches when photo is updated
  async invalidatePhotoCache(photoId: string): Promise<void> {
    await this.redis.del(
      `geo:score:${photoId}`,
      `geo:relationships:${photoId}`
    );
  }
}
```

### Query Optimization

```typescript
// Optimized semantic search query
async function semanticSearch(query: string, userId: string, limit: number = 50): Promise<Photo[]> {
  // Parse query into components
  const { keywords, filters, sortBy } = parseQuery(query);
  
  // Build optimized SQL query
  const sql = `
    WITH ranked_photos AS (
      SELECT
        p.*,
        gs.overall_score,
        ts_rank(to_tsvector('english', p.ai_description), plainto_tsquery('english', $1)) as description_rank,
        ts_rank(to_tsvector('english', array_to_string(p.tags, ' ')), plainto_tsquery('english', $1)) as tag_rank,
        CASE
          WHEN p.scene_type = ANY($2) THEN 1.5
          WHEN p.mood = ANY($3) THEN 1.3
          ELSE 1.0
        END as context_boost
      FROM photos p
      JOIN galleries g ON p.gallery_id = g.id
      LEFT JOIN geo_scores gs ON p.id = gs.photo_id
      WHERE g.created_by = $4
        AND p.deleted_at IS NULL
        AND (
          to_tsvector('english', p.ai_description) @@ plainto_tsquery('english', $1)
          OR to_tsvector('english', array_to_string(p.tags, ' ')) @@ plainto_tsquery('english', $1)
          OR p.scene_type = ANY($2)
          OR p.mood = ANY($3)
        )
    )
    SELECT *
    FROM ranked_photos
    ORDER BY (description_rank + tag_rank) * context_boost * (overall_score / 100.0) DESC
    LIMIT $5
  `;
  
  const result = await pool.query(sql, [
    keywords.join(' '),
    filters.sceneTypes || [],
    filters.moods || [],
    userId,
    limit,
  ]);
  
  return result.rows;
}
```

