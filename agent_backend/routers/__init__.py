"""Routers module for agent backend."""

# Lazy exports — importing tasks/telemetry at package init pulls in server.py
# and causes a circular import when server mounts these routers.

def __getattr__(name):
    if name == "tasks_router":
        from .tasks import router as tasks_router
        return tasks_router
    if name == "telemetry_router":
        from .telemetry import router as telemetry_router
        return telemetry_router
    raise AttributeError(name)


__all__ = ["tasks_router", "telemetry_router"]
