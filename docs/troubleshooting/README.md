# Troubleshooting Documentation

This directory contains troubleshooting guides and knowledge base articles for RawDrive production issues.

## Quick Links

| Guide | Description |
|-------|-------------|
| [Production Issues](./PRODUCTION_ISSUES.md) | General production troubleshooting, deployment, and common issues |
| [Face Detection Worker](./FACE_DETECTION_WORKER.md) | Face detection service, OOM issues, job processing |

## Emergency Contacts

- **Production Server:** `ssh rawdrive-vps`
- **Logs Location:** Docker container logs
- **Monitoring:** Grafana at internal port 3000

## Quick Diagnostic Commands

```bash
# SSH and check all services
ssh rawdrive-vps "docker ps && docker stats --no-stream"

# Check for errors in last hour
ssh rawdrive-vps "docker logs rawdrive-backend --since 1h 2>&1 | grep -i error | tail -20"

# Database health
ssh rawdrive-vps "docker exec rawdrive-postgres pg_isready -U rawdrive"
```

## Issue Categories

### High Priority (Immediate Action)
- All containers down
- Database connection failures
- Authentication broken
- File uploads completely failing

### Medium Priority (Same Day)
- Face detection not processing
- Slow API responses
- Individual feature failures

### Low Priority (Scheduled)
- Performance optimizations
- Log cleanup
- Non-critical errors

## Contributing

When you encounter and resolve a new issue:

1. Document the symptoms, root cause, and solution
2. Add to the appropriate guide or create a new one
3. Update the changelog in the guide
4. Commit with message: `docs: add troubleshooting for <issue>`

## Changelog

| Date | Change |
|------|--------|
| 2026-01-04 | Created initial troubleshooting documentation |
| 2026-01-04 | Added Face Detection Worker guide with OOM fixes |
| 2026-01-04 | Added Production Issues guide with common patterns |
