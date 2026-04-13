DELETE FROM platform_settings
WHERE category = 'email'
  AND key IN ('smtp_security', 'smtp_from_name');
