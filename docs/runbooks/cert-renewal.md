# TLS Certificate Renewal Runbook

**Automatic renewal cron:** `0 3,15 * * *` on both `.42` and `.44`. Runs `/opt/rawdrive/renew-ssl.sh`, which invokes certbot non-interactively and reloads nginx on success.

**Current mode:** `CERTBOT_MODE=webroot` (HTTP-01 via `/var/www/certbot/.well-known/acme-challenge/`).

**Cert expiry:** ~90 days from issuance. Certbot renews any cert that's within 30 days of expiry.

## Manual renewal (if cron fails)

```bash
ssh root@187.127.142.42 'CERTBOT_MODE=webroot /opt/rawdrive/renew-ssl.sh'
# On success, certbot writes to /etc/letsencrypt/live/rawdrive.in/
# and nginx reloads automatically.
```

After renewal, sync certs to `.44`:
```bash
ssh root@187.127.142.42 'tar -cf - /etc/letsencrypt' | ssh root@187.127.142.44 'tar -xf - -C /'
ssh root@187.127.142.44 'docker exec deploy-nginx-1 nginx -s reload'
```

## Webroot HTTP-01 gotcha

Let's Encrypt randomly picks one of the two A records (`.42` or `.44`) to validate the challenge. The webroot only exists on `.42`. `.44`'s nginx has a proxy rule for `/.well-known/acme-challenge/` that forwards to `.42`, so whichever IP LE picks resolves the challenge.

If `.44`'s proxy rule is broken or the port 80 rule doesn't match, half of LE's attempts will fail. Check the site config:
```bash
ssh root@187.127.142.44 'docker exec deploy-nginx-1 cat /etc/nginx/conf.d/rawdrive.conf | grep -A 5 acme-challenge'
```

## Switching to DNS-01 (when you have a valid Cloudflare API token)

The CF API token shipped with the bootstrap is revoked (see BOOTSTRAP-KNOWN-ISSUES.md P0). Once you have a new token:

```bash
# On both app nodes:
ssh root@<NODE> 'cat > /etc/letsencrypt/cloudflare.ini <<CF
dns_cloudflare_api_token = <NEW_TOKEN>
CF
chmod 600 /etc/letsencrypt/cloudflare.ini'

# Switch cron to DNS-01 mode:
ssh root@<NODE> "crontab -l | sed 's|CERTBOT_MODE=webroot|CERTBOT_MODE=dns-01|' | crontab -"
```

DNS-01 is more robust because it doesn't need port 80 open.

## Rate limits

Let's Encrypt enforces:
- 50 certs/week per registered domain
- 5 duplicate certs/week
- 5 failed validations/hour per account + hostname

If you hit one, stop and wait. Don't loop certbot in anger.

## Common failures

| Symptom | Cause | Fix |
|---|---|---|
| "Fetching challenge timed out" | `.42` port 80 firewalled | `ufw status`, ensure 80/tcp allowed |
| "Invalid response 404" from LE | webroot path mismatch or `.44` proxy rule broken | inspect nginx config; confirm challenge file exists in `/var/www/certbot/.well-known/acme-challenge/` briefly |
| "Too many certificates" | hit rate limit | wait a week or use staging env |
| "Account not registered" | first-time issuance without --agree-tos | run once manually with `--agree-tos --email support@rawdrive.in` |
