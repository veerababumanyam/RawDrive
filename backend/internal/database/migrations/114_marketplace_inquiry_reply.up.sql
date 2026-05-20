-- Migration 109: add reply_message to marketplace_inquiries
-- Allows the photographer (to_user_id) to send a reply back to the inquirer.
ALTER TABLE marketplace_inquiries
    ADD COLUMN IF NOT EXISTS reply_message TEXT;
