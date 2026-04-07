package storage

// CheckHealth returns the health status of the given provider.
func CheckHealth(p Provider) HealthStatus {
	if p == nil {
		return HealthStatus{
			Status:  "unhealthy",
			Driver:  "unknown",
			Message: "provider is nil",
		}
	}
	return p.HealthCheck()
}
