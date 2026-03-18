# Email DNS Setup Guide

This guide documents the DNS records required for RawDrive's Postal mail server to achieve good email deliverability. DNS records can take 24-48 hours to propagate, so configure them as early as possible after deploying Postal.

## Prerequisites

1. Postal is running via docker-compose (`rawdrive-postal` container is healthy)
2. You have DNS management access for your sending domain
3. You know the public IP address of the server running Postal

## Step-by-Step Setup

### 1. Deploy Postal

```bash
# Start the Postal stack
docker compose -f infrastructure/docker/docker-compose.yml up -d postal

# Initialize Postal (first time only)
docker exec rawdrive-postal postal initialize

# Create an admin user
docker exec rawdrive-postal postal make-user
```

### 2. Get DKIM Record Value

After Postal is initialized, retrieve the default DKIM record:

```bash
docker exec rawdrive-postal postal default-dkim-record
```

This outputs a DNS TXT record value you will need in step 3.

### 3. Configure DNS Records

Replace `yourdomain.com` with your actual sending domain and `<SERVER_IP>` with your server's public IP.

#### SPF Record

Authorizes your server to send email on behalf of your domain.

| Type | Host               | Value                                                   |
|------|--------------------|---------------------------------------------------------|
| TXT  | `yourdomain.com`   | `v=spf1 ip4:<SERVER_IP> include:spf.postal.yourdomain.com ~all` |

#### DKIM Record

Cryptographic signature for email authentication. Use the value from step 2.

| Type | Host                                    | Value                              |
|------|-----------------------------------------|------------------------------------|
| TXT  | `postal._domainkey.yourdomain.com`      | *(output from `postal default-dkim-record`)* |

#### DMARC Record

Policy for handling emails that fail SPF/DKIM checks.

| Type | Host                     | Value                                                                  |
|------|--------------------------|------------------------------------------------------------------------|
| TXT  | `_dmarc.yourdomain.com`  | `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com; pct=100`    |

#### MX Record (Return Path Domain)

Required for Postal's return path / bounce handling.

| Type | Host                        | Value                          | Priority |
|------|-----------------------------|--------------------------------|----------|
| MX   | `rp.postal.yourdomain.com`  | `mx.postal.yourdomain.com`     | 10       |
| A    | `mx.postal.yourdomain.com`  | `<SERVER_IP>`                  | -        |

#### CNAME Records (Tracking and Routes)

| Type  | Host                            | Value                 |
|-------|---------------------------------|-----------------------|
| CNAME | `track.postal.yourdomain.com`   | `<SERVER_IP>` (A) or server hostname |
| CNAME | `routes.postal.yourdomain.com`  | `<SERVER_IP>` (A) or server hostname |

#### Reverse DNS (PTR Record)

Set the PTR record for your server's public IP to match the `smtp_server_hostname` in `postal.yml`. This is configured through your hosting provider's control panel, not your domain registrar.

| Type | IP              | Value                        |
|------|-----------------|------------------------------|
| PTR  | `<SERVER_IP>`   | `postal.yourdomain.com`      |

### 4. Wait for DNS Propagation

DNS changes typically take 24-48 hours to fully propagate. You can check propagation status using:

```bash
# Check SPF
dig TXT yourdomain.com +short

# Check DKIM
dig TXT postal._domainkey.yourdomain.com +short

# Check DMARC
dig TXT _dmarc.yourdomain.com +short

# Check MX
dig MX rp.postal.yourdomain.com +short
```

### 5. Verify DNS Configuration

Once records have propagated, verify them through Postal:

```bash
docker exec rawdrive-postal postal check-dns
```

This checks all required DNS records and reports any issues.

## Port 25 (SMTP) Requirements

Postal needs outbound port 25 to deliver email. Many cloud providers block this port by default.

### AWS (EC2 / Lightsail)

- Port 25 is restricted by default on new accounts
- Submit a request: AWS Console -> Support -> Create case -> "Service limit increase" -> SES Sending Limits
- Alternative: Use AWS SES as a relay instead of direct SMTP

### Google Cloud (GCP)

- Port 25 is blocked entirely on Compute Engine
- Use port 587 with a relay, or use an alternative sending method
- No unblock process available

### Microsoft Azure

- Port 25 is blocked on new deployments (after Nov 2017)
- Submit an unblock request through Azure Support
- Enterprise agreements may have different defaults

### DigitalOcean

- Port 25 is blocked by default on new accounts
- Submit a support ticket to request unblock
- Typically approved within 1 business day for legitimate use

### Hetzner

- Port 25 is open by default
- No additional configuration needed

### Self-hosted / Bare Metal

- Port 25 is typically open
- Verify with: `telnet smtp.google.com 25`

## Troubleshooting

### Emails going to spam

1. Verify all DNS records are correctly configured (`postal check-dns`)
2. Check that PTR record matches your SMTP hostname
3. Ensure your server IP is not on any blocklists (check at mxtoolbox.com)
4. Start with low volume and gradually increase (IP warming)

### Bounces or delivery failures

1. Check Postal web UI for delivery logs
2. Verify port 25 outbound is open: `telnet smtp.google.com 25`
3. Check Postal logs: `docker logs rawdrive-postal`

### DKIM verification failing

1. Ensure the DKIM TXT record value matches exactly (no truncation)
2. Some DNS providers split long TXT records -- ensure the full value is in a single record
3. Re-run `docker exec rawdrive-postal postal default-dkim-record` to confirm the expected value

## Configuration Reference

All Postal-related environment variables:

| Variable                      | Default        | Description                           |
|-------------------------------|----------------|---------------------------------------|
| `POSTAL_API_URL`              | `http://postal:5000` | Postal HTTP API base URL        |
| `POSTAL_API_KEY`              | *(none)*       | Server API key from Postal web UI     |
| `POSTAL_FROM_EMAIL`           | *(none)*       | Default sender email address          |
| `POSTAL_FROM_NAME`            | `RawDrive`     | Default sender display name           |
| `POSTAL_WEBHOOK_SECRET`       | *(none)*       | Secret for webhook callback validation|
| `POSTAL_MYSQL_ROOT_PASSWORD`  | `postal`       | MariaDB root password                 |
| `POSTAL_MYSQL_PASSWORD`       | `postal`       | MariaDB postal user password          |
| `POSTAL_RABBITMQ_USER`       | `postal`       | RabbitMQ username                     |
| `POSTAL_RABBITMQ_PASSWORD`   | `postal`       | RabbitMQ password                     |
| `PORT_POSTAL_WEB`             | `5000`         | Host port for Postal web UI/API       |
