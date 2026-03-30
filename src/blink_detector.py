import math
import time
from enum import Enum


LEFT_EYE_EAR_IDX  = [33,  160, 158, 133, 153, 144]
RIGHT_EYE_EAR_IDX = [263, 387, 385, 362, 380, 373]


class BlinkType(Enum):
    NONE       = "none"
    SHORT      = "short"   # < 250ms  → left click
    LONG       = "long"    # 500–2000ms → right click
    SUSTAINED  = "sustained"  # > 2000ms → ignored


def _dist(a, b) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)


def compute_ear(landmarks, indices: list[int]) -> float:
    p1, p2, p3, p4, p5, p6 = [landmarks[i] for i in indices]
    v1 = _dist(p2, p6)
    v2 = _dist(p3, p5)
    h  = _dist(p1, p4)
    if h == 0:
        return 0.0
    return (v1 + v2) / (2.0 * h)


def compute_avg_ear(landmarks) -> tuple[float, float, float]:
    left  = compute_ear(landmarks, LEFT_EYE_EAR_IDX)
    right = compute_ear(landmarks, RIGHT_EYE_EAR_IDX)
    return left, right, (left + right) / 2.0


class BlinkDetector:
    """
    Time-based blink classifier (Phase 1.2).

    Transitions:
        OPEN  ──(EAR < threshold)──►  CLOSING  (record start_time)
        CLOSING ──(EAR >= threshold)──► classify by duration:
            < short_max_ms        → SHORT  (left click)
            short_max_ms..long_min_ms → ignored (between thresholds)
            long_min_ms..long_max_ms  → LONG (right click)
            > long_max_ms             → SUSTAINED (ignored)
        After emit, cooldown period blocks further events.
    """

    def __init__(
        self,
        threshold: float     = 0.21,
        short_min_ms: int    = 120,   # bỏ qua blink ngắn hƠn mức này (chớp tự nhiên)
        short_max_ms: int    = 400,
        long_min_ms: int     = 600,
        long_max_ms: int     = 2000,
        cooldown_ms: int     = 600,
        consecutive: int     = 3,
    ):
        self.threshold    = threshold
        self.short_min_ms = short_min_ms
        self.short_max_ms = short_max_ms
        self.long_min_ms  = long_min_ms
        self.long_max_ms  = long_max_ms
        self.cooldown_ms  = cooldown_ms
        self.consecutive  = consecutive

        self._state            = "OPEN"   # "OPEN" | "CLOSING"
        self._close_start_ms   = 0.0
        self._consec_below     = 0
        self._last_event_ms    = 0.0
        self.is_blinking       = False    # True while EAR < threshold (cursor pause)
        self.last_blink_type   = BlinkType.NONE

    def _now_ms(self) -> float:
        return time.monotonic() * 1000

    def _in_cooldown(self, now: float) -> bool:
        return (now - self._last_event_ms) < self.cooldown_ms

    def update(self, avg_ear: float) -> BlinkType:
        now = self._now_ms()
        event = BlinkType.NONE

        if avg_ear < self.threshold:
            self._consec_below += 1
            if self._consec_below >= self.consecutive and self._state == "OPEN":
                self._state          = "CLOSING"
                self._close_start_ms = now
            self.is_blinking = self._state == "CLOSING"

        else:
            self._consec_below = 0
            self.is_blinking   = False

            if self._state == "CLOSING":
                self._state = "OPEN"
                duration_ms = now - self._close_start_ms

                if not self._in_cooldown(now):
                    if self.short_min_ms <= duration_ms < self.short_max_ms:
                        event = BlinkType.SHORT
                    elif self.long_min_ms <= duration_ms <= self.long_max_ms:
                        event = BlinkType.LONG
                    elif duration_ms > self.long_max_ms:
                        event = BlinkType.SUSTAINED
                    # duration_ms < short_min_ms  → bỏ qua (chớp tự nhiên)

                    if event in (BlinkType.SHORT, BlinkType.LONG):
                        self._last_event_ms = now

        self.last_blink_type = event
        return event
