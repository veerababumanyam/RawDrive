-- Update password hash for business@test.rawdrive.in
UPDATE user_identities
SET password_hash = '$argon2id$v=19$m=65536,t=3,p=4$optnWvoXc7yHFpOYzaa2Cg$NynshFzDskOTCiVMmjW7PDLXSp5V3O+gKf2WB+M9Zo4'
WHERE email = 'business@test.rawdrive.in';

-- Verify
SELECT substring(password_hash, 1, 40) as hash_start FROM user_identities WHERE email = 'business@test.rawdrive.in';
