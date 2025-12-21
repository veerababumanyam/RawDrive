def rate_limit(requests_per_minute=60):
    def decorator(func):
        return func
    return decorator
