"""Small shared helpers: atomic JSON file writes and a sliding-window rate limiter."""

import os
import tempfile
import threading
import time
from collections import defaultdict, deque
from pathlib import Path


def atomic_write(path: Path, text: str) -> None:
    """Write text so readers never see a half-written file (temp file + atomic replace)."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix=path.name + ".", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class RateLimiter:
    """Allow at most `limit` hits per `window` seconds for each key."""

    def __init__(self):
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str, limit: int, window: float = 60.0) -> bool:
        now = time.monotonic()
        with self._lock:
            q = self._hits[key]
            while q and q[0] <= now - window:
                q.popleft()
            if len(q) >= limit:
                return False
            q.append(now)
            if len(self._hits) > 5000:  # forget idle keys
                for k in [k for k, v in self._hits.items() if not v or v[-1] <= now - window]:
                    self._hits.pop(k, None)
            return True
