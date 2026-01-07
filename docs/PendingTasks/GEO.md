# AI & Search Features (GEO - Generative Engine Optimization)

> **Status**: Required - Production Ready

## Business Value Proposition AI & Search Features (GEO) provide intelligent photo analysis, semantic search, and AI-powered curation that help photographers find photos instantly, generate content automatically, and deliver curated galleries efficiently. The system uses a multi-provider AI layer with Google Gemini as the default provider. ### Key Business Benefits - **Time Savings**: 70% faster gallery curation with AI assistance - **Quality Assurance**: Automatic quality scoring identifies best photos - **Content Generation**: AI-generated captions, hashtags, and stories - **Intelligent Search**: Natural language search across all photos - **Smart Curation**: AI selects best photos while preserving diversity - **Duplicate Detection**: Identify and manage similar photos - **Scalability**: Process thousands of photos efficiently

---









---
```

```


---

---



---




```

---


```


```



```


```





```





---



---













---

## User Personas ### Primary Users 1. **Photographer/Studio Owner** - Uses AI to cull large shoots quickly - Generates captions and hashtags for social media - Creates gallery stories for client delivery - Searches photos using natural language 2. **Studio Editor/Assistant** - Reviews AI quality scores - Applies AI-suggested curation - Uses duplicate detection to clean galleries - Generates content for marketing 3. **Enterprise Admin** - Configures AI provider settings - Manages AI credit allocation - Monitors AI usage and costs --- ## Key Capabilities ### 1. Photo Quality Analysis **Quality Metrics** - **Sharpness**: Focus and clarity (0-100) - **Exposure**: Brightness and contrast (0-100) - **Composition**: Framing and balance (0-100) - **Overall Score**: Weighted average (0-100) **Quality Badges** - ⭐⭐⭐⭐⭐ Excellent (90-100) - ⭐⭐⭐⭐ Good (75-89) - ⭐⭐⭐ Fair (60-74) - ⭐⭐ Poor (40-59) - ⭐ Very Poor (0-39) **Technical Analysis** - Motion blur detection with severity indicator - Focus issue identification - Highlight/shadow clipping detection - Noise level assessment - Intentional bokeh vs. technical blur distinction **Batch Analysis** - Analyze multiple photos at once - Progress tracking - Results summary - Apply tags to all - Export results ### 2. Smart Photo Curation **Target-Count Culling** - Specify target count (e.g., "Cull 3,000 to 500") - AI selects best diverse set - Preserves variety across moments - Explains selection reasoning **Curation Criteria** - Quality score threshold - Diversity enforcement - Face/expression quality - Story moment coverage - Per-person coverage balancing **Curation Presets** - **Social Media Highlights**: 20-30 most striking photos - **Print Album**: 50-100 story-focused selections - **Vendor Delivery**: Venue, florals, dress, cake focus - **Full Documentary**: 300+ comprehensive coverage **Similarity Grouping** - Cluster visually similar photos (burst shots) - Identify best shot per group - Group view with representative photo - Override AI recommendations ### 3. Caption & Hashtag Generation **Caption Generation** - Multiple style options: - Professional: Formal, business-appropriate - Casual: Friendly, conversational - Poetic: Artistic, emotional - Technical: Camera settings, technical details - 3-5 caption options per generation - One-click apply to photo **Hashtag Generation** - Categorized hashtags: - Trending: Popular hashtags - Niche: Photography-specific - General: Broad appeal - Branded: Studio-specific - Customizable count (5-30) - Copy to clipboard - Platform-optimized suggestions ### 4. Gallery Story Generation **Story Features** - AI-generated narrative summaries - Multiple lengths: Short (100-150 words), Medium (200-300), Long (400-600) - Tone options: Professional, Casual, Poetic, Journalistic - Edit and refine capability - Export as blog post **Story Content** - Event overview - Key moments highlighted - Emotional narrative - Technical excellence notes ### 5. AI Native UX Experience (New) **Command Bar Integration (Cmd+K)** - **Unified Entry Point**: All search and navigation via a central floating palette. - **Natural Language Parsing**: "Show me weddings from last summer" -> Filters: `{ category: 'wedding', date: 'last summer' }`. - **Action Execution**: "Create a new gallery called 'Smith Wedding'" -> Opens wizard with pre-filled title. **Generative Inputs ("Magic Rewrite")** - **Context Aware**: Text areas for captions/bios have a sparkle icon. - **Tone Shift**: "Make it friendlier", "Make it professional", "Fix grammar". - **Skeleton Loading**: UI displays "shimmering" text blocks of approximate length while AI generates content to reduce perceived latency. ### 6. Semantic Search (GEO) **Natural Language Search** - Search using everyday language - "Photos of bride laughing" - "Sunset ceremony shots" - "Group photos with grandparents" **Search Capabilities** - Content-based search (objects, scenes, actions) - Emotion-based search (joy, tears, laughter) - Technical search (lighting, composition) - Combined filters with text search **Vector Embeddings** - pgvector for similarity search - HNSW indexes for performance - Workspace-scoped search - Cross-gallery search ### 6. Auto-Tagging & Metadata **Automatic Tags** - Scene type (ceremony, reception, portraits) - Objects detected (cake, flowers, rings) - People count - Mood/emotion - Lighting type - Dominant colors **Metadata Extraction** - EXIF data parsing - Camera-specific fields (Canon, Sony, Nikon, Fuji) - GPS location (privacy-controlled) - Date/time with timezone ### 7. Duplicate Detection **Detection Features** - SHA256 checksum matching (exact duplicates) - Visual similarity scoring (near-duplicates) - Side-by-side comparison - Batch processing **Management Options** - Skip duplicates on upload - Replace existing - Keep both - Bulk delete duplicates ### 8. Scene & Moment Detection **Scene Categories** - Ceremony - Reception - Portraits - Getting ready - First look - First dance - Cake cutting - Speeches/toasts **Story Moment Identification** - Key wedding moments auto-detected - Ensures curation includes all moments - Timeline visualization - Coverage gap warnings ### 9. AI Credits System **Credit Allocation by Tier** | Tier | Monthly Credits | |------|-----------------| | Starter | 100 | | Professional | 500 | | Business | 2,000 | | Enterprise | 10,000 | | Trial | 2,000 | **Credit Costs** | Operation | Credits | |-----------|---------| | Analyze Photo | 1 | | Generate Caption | 1 | | Generate Hashtags | 1 | | Detect Faces | 5 | | Generate Story | 10 | | Smart Curation | 20 | | Duplicate Detection | 15 | **Credit Management** - Display current balance - Usage history - Low credit warnings - Upgrade prompts - Monthly reset - Rollover options (Enterprise) ### 10. AI Feature Toggles Users can enable/disable specific AI features: - Photo Analysis - Caption Generation - Hashtag Generation - Gallery Stories - Smart Curation Settings persist after API key changes. --- ## Feature Services | Feature | Backend Service | |---------|-----------------| | AI Smart Culling | `PhotoAnalysisService` | | Face Recognition | `FaceDetectionService` | | Quality Scoring | `PhotoAnalysisService` | | Scene/Event Tagging | `ContentDetectionService` | | Caption/Hashtags | `CaptionHashtagService` | | Gallery Story | `StoryGenerator` | | Smart Proofing | `SmartCuration` | | Duplicate Detection | `DuplicateDetectionService` | | Emotion Detection | `PhotoAnalysisService` | | Lighting Analysis | `PhotoAnalysisService` | | Diversity Balancing | `SmartCuration` | | Auto-Crop | `PhotoAnalysisService` | | Style Consistency | `StyleAnalysisService` | | Video Highlights | `VideoAnalysisService` | --- ## Integration Points ### With Other Features | Feature | Integration | |---------|-------------| | **Gallery Management** | AI analysis on upload; quality filtering; smart curation | | **Face Detection** | Face embeddings in search; expression analysis | | **Client CRM** | Client-specific recommendations | | **Invitations** | AI-generated invitation content | | **Company Profile** | AI-generated profile descriptions | | **Billing** | AI credits per subscription tier | | **Analytics** | AI usage metrics and trends | --- ## Technical Architecture ### Backend Services ``` photo_analysis_service.py - Quality scoring, blur detection smart_curation_service.py - AI-powered photo selection caption_hashtag_service.py - Caption and hashtag generation story_generator_service.py - Gallery story generation content_detection_service.py - Scene and object detection search_service.py - Semantic search metadata_extraction_service.py - EXIF and metadata parsing duplicate_detection_service.py - Duplicate identification ai_inference_service.py - Multi-provider AI calls ``` ### AI Provider Architecture **Multi-Provider Support** - **Default**: Google Gemini (RawDrive-hosted) - **Optional**: OpenAI, Anthropic, Azure OpenAI - **Local**: OpenAI-compatible servers (Ollama, LM Studio) **Provider Management** - Admin-configurable API keys - Automatic failover - Rate limiting per provider - Circuit breaker pattern ### API Endpoints **Photo Analysis** ``` POST /api/v1/workspaces/{id}/smart-tagging/analyze - Analyze photo POST /api/v1/workspaces/{id}/smart-tagging/batch - Batch analysis GET /api/v1/photos/{id}/analysis - Get analysis results ``` **Content Generation** ``` POST /api/v1/workspaces/{id}/smart-tagging/captions - Generate captions POST /api/v1/workspaces/{id}/smart-tagging/hashtags - Generate hashtags POST /api/v1/galleries/{id}/story - Generate story ``` **Smart Curation** ``` POST /api/v1/galleries/{id}/curate - Start curation GET /api/v1/galleries/{id}/curation/{sessionId} - Get session status POST /api/v1/galleries/{id}/curation/{sessionId}/apply - Apply selections ``` **Search** ``` POST /api/v1/workspaces/{id}/search - Semantic search GET /api/v1/workspaces/{id}/search/suggestions - Search suggestions ``` **AI Settings** ``` GET /api/v1/users/me/gemini-settings - Get AI settings PUT /api/v1/users/me/gemini-settings - Update settings GET /api/v1/users/me/gemini-settings/feature-toggles - Get toggles PATCH /api/v1/users/me/gemini-settings/feature-toggles - Update toggles ``` ### Database Schema **Core Tables** ```sql photo_analysis - Analysis results per photo ├── analysis_id (UUID) ├── asset_id (UUID) ├── workspace_id (UUID) ├── quality_score (INTEGER) ├── sharpness_score (INTEGER) ├── exposure_score (INTEGER) ├── composition_score (INTEGER) ├── is_technical_reject (BOOLEAN) ├── blur_type (VARCHAR) ├── lighting_type (VARCHAR) ├── mood (VARCHAR) ├── tags (TEXT[]) ├── dominant_colors (TEXT[]) ├── improvements (TEXT[]) └── analyzed_at (TIMESTAMP) curation_sessions - Smart curation sessions ├── session_id (UUID) ├── gallery_id (UUID) ├── workspace_id (UUID) ├── target_count (INTEGER) ├── preset (VARCHAR) ├── status (VARCHAR) ├── selected_asset_ids (UUID[]) ├── safety_set_ids (UUID[]) └── created_at (TIMESTAMP) ai_usage_logs - Credit tracking ├── log_id (UUID) ├── user_id (UUID) ├── workspace_id (UUID) ├── operation (VARCHAR) ├── credits_used (INTEGER) ├── provider (VARCHAR) └── created_at (TIMESTAMP) user_gemini_settings - User AI configuration ├── user_id (UUID) ├── api_key_encrypted (TEXT) ├── model_preference (VARCHAR) ├── feature_photo_analysis (BOOLEAN) ├── feature_captions (BOOLEAN) ├── feature_hashtags (BOOLEAN) ├── feature_gallery_story (BOOLEAN) ├── feature_smart_curation (BOOLEAN) └── updated_at (TIMESTAMP) search_embeddings - Vector embeddings for search ├── embedding_id (UUID) ├── asset_id (UUID) ├── workspace_id (UUID) ├── embedding (VECTOR(512)) ├── provider (VARCHAR) └── created_at (TIMESTAMP) ``` ### Frontend Components **AIToolsHub (Primary Entry Point)** ``` AIToolsHub - Unified slide-out panel ├── AnalyzeTab - Quality analysis, blur detection ├── CurateTab - Smart curation with presets └── CreateTab - Batch story/caption/hashtag ``` **Quality Analysis** ``` QualityScoreCard - Individual score display QualityResultsGrid - Grid with filtering BlurIndicator - Blur type badges BlurBadge - Blur severity indicator ``` **Content Generation** ``` StoryGenerator - Gallery story generation CaptionGenerator - Per-photo captions HashtagGenerator - Per-photo hashtags ``` **Curation** ``` SmartCurationPanel - Curation interface CurationPresetSelector - Preset selection CurationProgress - Progress tracking CurationResults - Selection review ``` --- ## Scalability Considerations ### Handling Large Galleries **Batch Processing** - Async processing with BullMQ - Configurable batch sizes - Progress tracking - Resume capability **Performance Optimization** - Request deduplication - Result caching - Circuit breaker for AI providers - Rate limiting per user/workspace **Vector Search** - pgvector with HNSW indexes - Workspace-scoped queries - Efficient similarity search - Caching of frequent queries ### Performance Targets - Quality analysis: < 30 seconds per photo - Curation (3,000 → 500): < 30 seconds after analysis - Search response: < 500ms - Caption generation: < 5 seconds - Story generation: < 30 seconds --- ## Security & Compliance ### Data Protection - **API Keys**: Encrypted at rest, never exposed in responses - **User Scoping**: All AI operations scoped to user/workspace - **Input Validation**: Sanitized inputs to AI providers - **Rate Limiting**: Per-user and per-workspace limits ### Privacy - **No Training**: User data not used for model training (unless opted in) - **Data Minimization**: Only necessary data sent to AI providers - **Audit Logging**: All AI operations logged ### Compliance - **GDPR**: Data deletion on request - **SOC2**: Audit trail for AI operations - **Transparency**: "Generated by AI" indicators --- ## Business Metrics ### Key Performance Indicators - **AI Adoption Rate**: % of users using AI features - **Time Savings**: Reduction in curation time - **Quality Correlation**: AI scores vs. photographer rankings - **Search Success Rate**: % of searches with results - **Credit Utilization**: % of allocated credits used ### Success Criteria - 70% faster gallery curation with AI - 85%+ correlation between AI and photographer quality rankings - Search "no result" rate under 5% - 30%+ reduction in time spent finding photos - User satisfaction 4.5+/5 for AI features --- ## Future Enhancements ### Additional Features - **Video Analysis**: Quality scoring for video content - **Style Transfer**: Apply consistent editing styles - **Trend Prediction**: Identify trending content styles - **Advanced Crop Suggestions**: AI-powered crop recommendations - **Multi-Language Captions**: Generate captions in multiple languages - **Voice Search**: Search using voice commands


