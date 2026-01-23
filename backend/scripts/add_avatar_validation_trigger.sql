-- Add database trigger to validate and auto-heal avatar references
--
-- This trigger prevents orphaned avatar references by:
-- 1. Checking if avatar_asset_id is being set
-- 2. Verifying that corresponding avatar_images row exists
-- 3. Auto-clearing the reference if no image data is found
--
-- This acts as a safety net to prevent data inconsistencies even if the
-- application code fails to validate properly.
--
-- Usage:
--   docker exec rawdrive-backend psql -U rawdrive -d rawdrive_db -f scripts/add_avatar_validation_trigger.sql

-- Create the validation function
CREATE OR REPLACE FUNCTION validate_avatar_reference()
RETURNS TRIGGER AS $$
BEGIN
    -- If avatar_asset_id is being set, verify avatar_images row exists
    IF NEW.avatar_asset_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM avatar_images
            WHERE client_id = NEW.client_id
        ) THEN
            -- Auto-clear invalid reference
            NEW.avatar_asset_id := NULL;
            NEW.avatar_crop_data := NULL;

            -- Log warning
            RAISE WARNING 'Avatar reference auto-cleared for client % - no image data found',
                NEW.client_id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (idempotent)
DROP TRIGGER IF EXISTS validate_client_avatar ON clients;

-- Create the trigger
CREATE TRIGGER validate_client_avatar
BEFORE INSERT OR UPDATE ON clients
FOR EACH ROW
EXECUTE FUNCTION validate_avatar_reference();

-- Confirmation message
SELECT 'Avatar validation trigger installed successfully' AS status;
