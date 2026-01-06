# Traefik Configuration

RawDrive uses Traefik v3 as an API Gateway for routing, load balancing, and SSL/TLS termination.

## Configuration Files

### Production

- **`traefik.yaml`**: Production static configuration with HTTPS redirect and Let's Encrypt
- **`dynamic.yaml`**: Production dynamic configuration with SSL/TLS for `rawdrive.ai`

### Development (Local)

- **`traefik.dev.yaml`**: Development static configuration (HTTP only, no SSL redirect)
- **`dynamic.dev.yaml`**: Development dynamic configuration for `localhost`

## Local Development Setup

The Docker Compose file uses **development configuration** by default to avoid SSL certificate issues.

### What's Different in Dev Mode

1. **No HTTPS Redirect**: HTTP (port 80) works without forcing HTTPS
2. **No Let's Encrypt**: Skips certificate generation
3. **Relaxed CORS**: Allows `localhost:3000` and `localhost`
4. **Debug Logging**: More verbose logs for troubleshooting

### Accessing Services

| Service | URL | Description |
|---------|-----|-------------|
| Frontend | http://localhost | React app via Traefik |
| Backend API | http://localhost/api | FastAPI via Traefik |
| Backend Direct | http://localhost:8000 | FastAPI direct (bypass Traefik) |
| Traefik Dashboard | http://localhost:8080 | Traefik admin UI |
| Grafana | http://localhost/grafana | Monitoring dashboards |
| Prometheus | http://localhost:9090 | Metrics |

## Switching to Production Config

To use production configuration (HTTPS with Let's Encrypt):

1. Update `docker-compose.yml` to use production configs:
   ```yaml
   volumes:
     - ./traefik/traefik.yaml:/etc/traefik/traefik.yaml:ro
     - ./traefik/dynamic.yaml:/etc/traefik/dynamic.yaml:ro
   ```

2. Set your domain and ACME email in `.env`:
   ```bash
   ACME_EMAIL=admin@rawdrive.ai
   # Optional: Cloudflare for wildcard certs
   CF_API_EMAIL=your-email@example.com
   CF_API_KEY=your-api-key
   ```

3. Restart Traefik:
   ```bash
   docker compose restart traefik
   ```

## Troubleshooting

### SSL Certificate Errors

If you see `ERR_CERT_AUTHORITY_INVALID`:
- Ensure you're using `traefik.dev.yaml` for local development
- Check that `VITE_API_URL=http://localhost` in `frontend/.env.development`
- Clear browser cache and restart containers

### Connection Refused

If you see `ERR_CONNECTION_REFUSED`:
- Check that Traefik is running: `docker ps | grep traefik`
- Verify port 80 is not in use: `netstat -ano | findstr :80`
- Check Traefik logs: `docker logs rawdrive-traefik`

### Routing Issues

If requests don't reach the backend:
- Check Traefik dashboard: http://localhost:8080
- Verify routers and services are configured
- Check container labels in `docker-compose.yml`

## Learn More

- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [RawDrive Architecture](../../../docs/ARCHITECTURE_QUICK_REFERENCE.md)
- [Infrastructure Skill](./.claude/skills/infrastructure/SKILL.md)
