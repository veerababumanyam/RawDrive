-- 139: clear incomplete seeded SMTP transport defaults.
--
-- Migration 039 seeded smtp_port=465 and smtp_security=ssl even when
-- smtp_host was intentionally empty. Because platform_settings wins over
-- environment variables, local Docker then mixed env smtp_host=mailpit with
-- DB smtp_port=465/smtp_security=ssl and registration OTP delivery failed.
--
-- Only clear the transport defaults when smtp_host is still empty, meaning the
-- SMTP transport is not configured in platform_settings and should fall back
-- coherently to environment variables.
UPDATE platform_settings
SET value = '', updated_at = now()
WHERE category = 'email'
  AND key = 'smtp_port'
  AND value = '465'
  AND EXISTS (
    SELECT 1
    FROM platform_settings smtp_host
    WHERE smtp_host.category = 'email'
      AND smtp_host.key = 'smtp_host'
      AND smtp_host.value = ''
  );

UPDATE platform_settings
SET value = '', updated_at = now()
WHERE category = 'email'
  AND key = 'smtp_security'
  AND value = 'ssl'
  AND EXISTS (
    SELECT 1
    FROM platform_settings smtp_host
    WHERE smtp_host.category = 'email'
      AND smtp_host.key = 'smtp_host'
      AND smtp_host.value = ''
  );
