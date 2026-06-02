-- 139 rollback: restore the original seeded SMTP transport defaults when SMTP
-- is still not configured in platform_settings.
UPDATE platform_settings
SET value = '465', updated_at = now()
WHERE category = 'email'
  AND key = 'smtp_port'
  AND value = ''
  AND EXISTS (
    SELECT 1
    FROM platform_settings smtp_host
    WHERE smtp_host.category = 'email'
      AND smtp_host.key = 'smtp_host'
      AND smtp_host.value = ''
  );

UPDATE platform_settings
SET value = 'ssl', updated_at = now()
WHERE category = 'email'
  AND key = 'smtp_security'
  AND value = ''
  AND EXISTS (
    SELECT 1
    FROM platform_settings smtp_host
    WHERE smtp_host.category = 'email'
      AND smtp_host.key = 'smtp_host'
      AND smtp_host.value = ''
  );
