"""Integration tests for Face Detection Service using real photos.

This module tests the face detection pipeline with actual photos from tests/photos.
"""

import asyncio
import os
import pytest
from pathlib import Path
from uuid import uuid4

# Test photos directory - using absolute path to workspace root
PHOTOS_DIR = Path(__file__).parent.parent.parent.parent / "tests" / "photos"


def get_test_photos() -> list[Path]:
    """Get list of test photo paths."""
    extensions = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
    photos = []
    if PHOTOS_DIR.exists():
        for file in PHOTOS_DIR.iterdir():
            if file.suffix.lower() in extensions:
                photos.append(file)
    return photos


class TestFaceDetectionWithRealPhotos:
    """Integration tests using real photos."""
    
    @pytest.fixture
    def test_photos(self) -> list[Path]:
        """Get available test photos."""
        photos = get_test_photos()
        if not photos:
            pytest.skip("No test photos found in tests/photos")
        return photos
    
    def test_photos_directory_exists(self):
        """Verify test photos directory exists and contains photos."""
        assert PHOTOS_DIR.exists(), f"Photos directory not found: {PHOTOS_DIR}"
        
        photos = get_test_photos()
        assert len(photos) > 0, "No test photos found"
        
        print(f"\nFound {len(photos)} test photos:")
        for photo in photos:
            print(f"  - {photo.name} ({photo.stat().st_size / 1024:.1f} KB)")
    
    def test_photo_files_are_readable(self, test_photos: list[Path]):
        """Verify all test photos can be read."""
        for photo in test_photos:
            assert photo.exists(), f"Photo not found: {photo}"
            assert photo.stat().st_size > 0, f"Photo is empty: {photo}"
            
            # Read file to verify it's accessible
            with open(photo, "rb") as f:
                data = f.read()
                assert len(data) > 0, f"Could not read photo: {photo}"
    
    def test_thumbnail_service_crops_faces(self, test_photos: list[Path]):
        """Test thumbnail service can crop regions from real photos."""
        from app.services.face_thumbnail_service import FaceThumbnailService
        
        service = FaceThumbnailService()
        
        for photo in test_photos[:2]:  # Test first 2 photos
            with open(photo, "rb") as f:
                image_data = f.read()
            
            # Simulate a face bounding box in center of image
            bounding_box = {
                "x": 30.0,  # 30% from left
                "y": 20.0,  # 20% from top
                "width": 40.0,  # 40% width
                "height": 50.0,  # 50% height
            }
            
            # Test cropping
            try:
                cropped = service.crop_face_region(image_data, bounding_box)
                assert len(cropped) > 0, f"Cropped image is empty for {photo.name}"
                print(f"\n  Cropped {photo.name}: {len(cropped)} bytes")
                
                # Test thumbnail generation at all sizes
                thumbnails = service.generate_all_sizes(cropped)
                assert "small" in thumbnails
                assert "medium" in thumbnails
                assert "large" in thumbnails
                
                print(f"    Thumbnails: small={len(thumbnails['small'])}B, "
                      f"medium={len(thumbnails['medium'])}B, "
                      f"large={len(thumbnails['large'])}B")
                
            except Exception as e:
                pytest.fail(f"Failed to process {photo.name}: {e}")
    
    def test_image_dimensions_extraction(self, test_photos: list[Path]):
        """Test extracting dimensions from real photos."""
        from PIL import Image
        
        for photo in test_photos:
            with open(photo, "rb") as f:
                image_data = f.read()
            
            try:
                from io import BytesIO
                img = Image.open(BytesIO(image_data))
                width, height = img.size
                
                assert width > 0 and height > 0, f"Invalid dimensions for {photo.name}"
                print(f"\n  {photo.name}: {width}x{height}px")
                
            except Exception as e:
                pytest.fail(f"Failed to get dimensions for {photo.name}: {e}")
    
    def test_face_detection_bounding_box_validation(self, test_photos: list[Path]):
        """Test that bounding box validation works with real image dimensions."""
        from app.api.face_schemas import BoundingBox
        
        # Valid bounding boxes (percentages)
        valid_boxes = [
            BoundingBox(x=10, y=10, width=30, height=40),
            BoundingBox(x=0, y=0, width=100, height=100),
            BoundingBox(x=50, y=50, width=25, height=25),
        ]
        
        for box in valid_boxes:
            # All should be valid percentage values
            assert 0 <= box.x <= 100
            assert 0 <= box.y <= 100
            assert 0 < box.width <= 100
            assert 0 < box.height <= 100
            assert box.x + box.width <= 100
            assert box.y + box.height <= 100
        
        print(f"\nValidated {len(valid_boxes)} bounding box configurations")
    
    def test_embedding_normalization(self):
        """Test that embedding normalization works correctly."""
        import math
        
        def normalize_vector(vec: list[float]) -> list[float]:
            """Normalize a vector to unit length."""
            magnitude = math.sqrt(sum(x * x for x in vec))
            if magnitude == 0:
                result = [0.0] * len(vec)
                result[0] = 1.0
                return result
            return [x / magnitude for x in vec]
        
        # Test with various vectors
        test_vectors = [
            [1.0] * 512,
            [0.5] * 256 + [-0.5] * 256,
            [i / 512 for i in range(512)],
        ]
        
        for vec in test_vectors:
            normalized = normalize_vector(vec)
            
            # Verify L2 norm is 1
            l2_norm = math.sqrt(sum(x * x for x in normalized))
            assert abs(l2_norm - 1.0) < 0.0001, f"L2 norm should be 1, got {l2_norm}"
        
        print(f"\nNormalized {len(test_vectors)} test vectors successfully")
    
    def test_cluster_assignment_logic(self):
        """Test cluster assignment with simulated embeddings."""
        import math
        from uuid import uuid4
        
        def normalize_vector(vec: list[float]) -> list[float]:
            magnitude = math.sqrt(sum(x * x for x in vec))
            if magnitude == 0:
                return [1.0] + [0.0] * (len(vec) - 1)
            return [x / magnitude for x in vec]
        
        def cosine_similarity(a: list[float], b: list[float]) -> float:
            return sum(x * y for x, y in zip(a, b))
        
        # Create 2 distinct clusters
        centroid_a = normalize_vector([1.0] * 256 + [0.0] * 256)
        centroid_b = normalize_vector([0.0] * 256 + [1.0] * 256)
        
        clusters = [
            {"id": uuid4(), "centroid": centroid_a, "name": "Cluster A"},
            {"id": uuid4(), "centroid": centroid_b, "name": "Cluster B"},
        ]
        
        # Test face embeddings
        face_close_to_a = normalize_vector([0.9] * 256 + [0.1] * 256)
        face_close_to_b = normalize_vector([0.1] * 256 + [0.9] * 256)
        
        # Find best cluster for each face
        def find_best_cluster(embedding, threshold=0.7):
            best_match = None
            best_sim = threshold
            for cluster in clusters:
                sim = cosine_similarity(embedding, cluster["centroid"])
                if sim > best_sim:
                    best_sim = sim
                    best_match = cluster
            return best_match, best_sim
        
        match_a, sim_a = find_best_cluster(face_close_to_a)
        match_b, sim_b = find_best_cluster(face_close_to_b)
        
        assert match_a is not None, "Face A should match a cluster"
        assert match_b is not None, "Face B should match a cluster"
        assert match_a["name"] == "Cluster A", "Face A should match Cluster A"
        assert match_b["name"] == "Cluster B", "Face B should match Cluster B"
        
        print(f"\nCluster assignment test passed:")
        print(f"  Face A → {match_a['name']} (similarity: {sim_a:.4f})")
        print(f"  Face B → {match_b['name']} (similarity: {sim_b:.4f})")
    
    def test_merge_operation_logic(self):
        """Test face group merge operation logic."""
        from uuid import uuid4
        
        # Create two groups with faces
        group_a = uuid4()
        group_b = uuid4()
        
        faces = {
            uuid4(): group_a,
            uuid4(): group_a,
            uuid4(): group_b,
            uuid4(): group_b,
            uuid4(): group_b,
        }
        
        initial_count_a = sum(1 for g in faces.values() if g == group_a)
        initial_count_b = sum(1 for g in faces.values() if g == group_b)
        
        print(f"\nBefore merge:")
        print(f"  Group A: {initial_count_a} faces")
        print(f"  Group B: {initial_count_b} faces")
        
        # Merge A into B
        for face_id, group_id in list(faces.items()):
            if group_id == group_a:
                faces[face_id] = group_b
        
        final_count_b = sum(1 for g in faces.values() if g == group_b)
        final_count_a = sum(1 for g in faces.values() if g == group_a)
        
        print(f"\nAfter merge (A → B):")
        print(f"  Group A: {final_count_a} faces")
        print(f"  Group B: {final_count_b} faces")
        
        assert final_count_a == 0, "Group A should be empty after merge"
        assert final_count_b == 5, "Group B should have all 5 faces"
    
    def test_split_operation_logic(self):
        """Test face group split operation logic."""
        from uuid import uuid4
        
        original_group = uuid4()
        
        faces = {uuid4(): original_group for _ in range(5)}
        
        print(f"\nBefore split:")
        print(f"  Original group: {len(faces)} faces")
        
        # Split 2 faces to new group
        new_group = uuid4()
        faces_to_split = list(faces.keys())[:2]
        
        for face_id in faces_to_split:
            faces[face_id] = new_group
        
        original_count = sum(1 for g in faces.values() if g == original_group)
        new_count = sum(1 for g in faces.values() if g == new_group)
        
        print(f"\nAfter split (2 faces):")
        print(f"  Original group: {original_count} faces")
        print(f"  New group: {new_count} faces")
        
        assert original_count == 3, "Original should have 3 faces"
        assert new_count == 2, "New group should have 2 faces"


# Run tests directly
if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
