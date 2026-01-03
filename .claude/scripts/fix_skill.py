#!/usr/bin/env python3
"""Fix naming conventions in SKILL.md files."""
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SKILLS_DIR = BASE_DIR / "skills"


def fix_ai_mcp_integration():
    path = SKILLS_DIR / "ai-mcp-integration" / "SKILL.md"
    content = path.read_text()

    # tenant -> workspace
    content = content.replace('tenant_id', 'workspace_id')
    content = content.replace('tenantId', 'workspaceId')
    content = content.replace('for tenant/gallery', 'for workspace/library')

    # gallery -> library
    content = content.replace('gallery_id', 'library_id')
    content = content.replace('galleryId', 'libraryId')
    content = content.replace('gallery:/', 'library:/')
    content = content.replace('get_gallery_stats', 'get_library_stats')
    content = content.replace('compute_gallery_stats', 'compute_library_stats')
    content = content.replace('for a gallery', 'for a library')
    content = content.replace('_fetch_gallery_photos', '_fetch_library_assets')
    content = content.replace('Auto-select the best photos from a gallery', 'Auto-select the best photos from a library')

    # SQL table/column fixes
    content = content.replace('FROM photos p', 'FROM assets a')
    content = content.replace('photo_embeddings pe', 'asset_embeddings ae')
    content = content.replace('pe.photo_id', 'ae.asset_id')
    content = content.replace('pe.embedding', 'ae.embedding')
    content = content.replace('p.tenant_id', 'a.workspace_id')
    content = content.replace('p.gallery_id', 'a.library_id')
    content = content.replace('p.id as photo_id', 'a.id as asset_id')
    content = content.replace('p.filename', 'a.filename')
    content = content.replace('p.ai_description', 'a.ai_description')
    content = content.replace('p.curation_score', 'a.curation_score')
    content = content.replace('p.deleted_at', 'a.deleted_at')

    # Gemini -> LLM
    content = content.replace('# Gemini pricing: ~$0.00002 per image', '# LLM pricing varies by provider (e.g., ~$0.00002 per image)')
    content = content.replace('CostOptimizedGemini', 'CostOptimizedLLM')
    content = content.replace('gemini:', 'llm:')
    content = content.replace('self._gemini', 'self._llm')
    content = content.replace('should_use_gemini', 'should_use_llm')
    content = content.replace('gemini_operations', 'llm_operations')
    content = content.replace('Use Gemini for', 'Use LLM for')
    content = content.replace('Uses Gemini for', 'Uses LLM for')
    content = content.replace('use_gemini_for_curation', 'use_llm_for_curation')
    content = content.replace('_score_with_gemini', '_score_with_llm')
    content = content.replace('test_gemini.py', 'test_llm.py')
    content = content.replace('from src.services.gemini import GeminiService', 'from src.services.llm_client import LLMService')
    content = content.replace('gemini_service', 'llm_service')
    content = content.replace('_detect_with_gemini', '_detect_with_llm')
    content = content.replace('InsightFace or Gemini', 'InsightFace or LLM')

    # Photo -> Asset in frontend/component context
    content = content.replace('analyzePhoto', 'analyzeAsset')
    content = content.replace('searchPhotos', 'searchAssets')
    content = content.replace('photoId', 'assetId')
    content = content.replace('PhotoAnalysis', 'AssetAnalysis')
    content = content.replace('autoSelectPhotos', 'autoSelectAssets')
    content = content.replace('AIPhotoAnalysis', 'AIAssetAnalysis')
    content = content.replace('photo: Photo', 'asset: Asset')
    content = content.replace('photo.id', 'asset.id')
    content = content.replace('response.data.photos', 'response.data.assets')
    content = content.replace('Photo[]', 'Asset[]')
    content = content.replace("showToast('Failed to analyze photo'", "showToast('Failed to analyze asset'")
    content = content.replace('selected_photos=', 'selected_assets=')

    path.write_text(content)
    print('Fixed ai-mcp-integration')


def fix_testing():
    path = SKILLS_DIR / "testing" / "SKILL.md"
    content = path.read_text()

    # tenant -> workspace
    content = content.replace('tenant_id', 'workspace_id')
    content = content.replace('tenantId', 'workspaceId')
    content = content.replace('createTestTenant', 'createTestWorkspace')
    content = content.replace('testTenant', 'testWorkspace')

    # gallery -> library
    content = content.replace('gallery_id', 'library_id')
    content = content.replace('galleryId', 'libraryId')

    # Gemini -> LLM
    content = content.replace('test_gemini.py', 'test_llm.py')
    content = content.replace('mock_gemini_response', 'mock_llm_response')
    content = content.replace('GeminiService', 'LLMService')
    content = content.replace('gemini_service', 'llm_service')
    content = content.replace('from src.services.gemini import', 'from src.services.llm_client import')

    path.write_text(content)
    print('Fixed testing')


def fix_performance():
    path = SKILLS_DIR / "performance" / "SKILL.md"
    content = path.read_text()

    # tenant -> workspace
    content = content.replace('tenant_id', 'workspace_id')
    content = content.replace('tenantId', 'workspaceId')

    path.write_text(content)
    print('Fixed performance')


if __name__ == '__main__':
    fix_ai_mcp_integration()
    fix_testing()
    fix_performance()
    print('All done!')
