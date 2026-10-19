"""In-memory sliding-window limiter for failed login attempts.

Per-process counters: adequate for the single-instance MVP deployment and
cleared on restart. Keyed by client IP so one account cannot lock out
everyone while a distributed attacker still pays per-IP cost here.
"""

import time
from collections import deque

from app.core.config import get_settings
from app.utils.errors import RateLimitedError


class SlidingWindowLimiter:
    def __init__(self, max_hits: int, window_seconds: float) -> None:
        self.max_hits = max_hits
        self.window = window_seconds
        self._hits: dict[str, deque[float]] = {}

    def _prune(self, key: str, now: float) -> deque[float]:
        hits = self._hits.get(key)
        if hits is None:
            hits = deque()
            self._hits[key] = hits
        cutoff = now - self.window
        while hits and hits[0] <= cutoff:
            hits.popleft()
        return hits

    def check(self, key: str) -> None:
        """Raise RateLimitedError when the key has exhausted its budget."""
        hits = self._prune(key, time.monotonic())
        if len(hits) >= self.max_hits:
            raise RateLimitedError(
                "Too many failed login attempts. "
                f"Try again in {int(self.window)} seconds."
            )

    def record_failure(self, key: str) -> None:
        now = time.monotonic()
        self._prune(key, now).append(now)

    def clear(self, key: str) -> None:
        self._hits.pop(key, None)

    def reset(self) -> None:
        self._hits.clear()


_settings = get_settings()
login_limiter = SlidingWindowLimiter(
    _settings.login_rate_limit, _settings.login_rate_limit_window_seconds
)
