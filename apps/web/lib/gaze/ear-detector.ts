// apps/web/lib/gaze/ear-detector.ts

export type BlinkAction = 'none' | 'left_click' | 'right_click' | 'drag_toggle';

export class AdaptiveEARDetector {
  private baselineEAR = 0.28;
  private history: number[] = [];
  private readonly WINDOW = 90;

  // Thời điểm bắt đầu nhắm mắt
  private leftClosedSince: number | null = null;
  private rightClosedSince: number | null = null;
  private lastActionTime = 0;
  private hasTriggeredDrag = false;

  // Hằng số tính theo ms
  private readonly CLICK_MIN = 80;
  private readonly CLICK_MAX = 500;
  private readonly DRAG_MIN = 450;
  private readonly COOLDOWN_MS = 700;
  private readonly BOTH_EYE_SYNC_WINDOW = 180;

  getThreshold(yNorm = 0.5): number {
    const clampedY = Math.max(0, Math.min(1, yNorm));
    return this.baselineEAR * (0.6 - 0.12 * clampedY);
  }

  setBaselineEAR(baseline: number): void {
    if (baseline > 0.15 && baseline < 0.45) {
      this.baselineEAR = baseline;
    }
  }

  update(
    earLeft: number,
    earRight: number,
    timestamp: number,
    yNorm = 0.5,
    dominantEye: 'both' | 'left' | 'right' = 'both',
    customBlinkMs = 350
  ): BlinkAction {
    const ear = (earLeft + earRight) / 2;

    if (ear > this.baselineEAR * 0.9) {
      this.history.push(ear);
      if (this.history.length > this.WINDOW) this.history.shift();
      this.baselineEAR = Math.max(...this.history.slice(-30));
    }

    const threshold = this.getThreshold(yNorm);
    const isLeftClosed = earLeft < threshold;
    const isRightClosed = earRight < threshold;

    let action: BlinkAction = 'none';

    if (!isLeftClosed && !isRightClosed) {
      this.hasTriggeredDrag = false;
    }

    // Track thời điểm bắt đầu nhắm từng mắt
    if (isLeftClosed && this.leftClosedSince === null) {
      this.leftClosedSince = timestamp;
    }
    if (isRightClosed && this.rightClosedSince === null) {
      this.rightClosedSince = timestamp;
    }

    const clickMax = Math.max(this.CLICK_MAX, customBlinkMs + 100);

    // Xử lý dominant eye đơn
    if (dominantEye === 'left') {
      if (!isLeftClosed && this.leftClosedSince !== null) {
        const dur = timestamp - this.leftClosedSince;
        if (dur >= this.CLICK_MIN && dur <= clickMax) {
          action = 'left_click';
        }
        this.leftClosedSince = null;
      }
    } else if (dominantEye === 'right') {
      if (!isRightClosed && this.rightClosedSince !== null) {
        const dur = timestamp - this.rightClosedSince;
        if (dur >= this.CLICK_MIN && dur <= clickMax) {
          action = 'left_click';
        }
        this.rightClosedSince = null;
      }
    } else {
      // Both eyes mode
      // Ưu tiên drag nếu cả 2 mắt nhắm đồng bộ
      if (
        isLeftClosed &&
        isRightClosed &&
        this.leftClosedSince !== null &&
        this.rightClosedSince !== null &&
        !this.hasTriggeredDrag
      ) {
        const timeDiff = Math.abs(this.leftClosedSince - this.rightClosedSince);
        const bothDuration = timestamp - Math.max(this.leftClosedSince, this.rightClosedSince);

        if (timeDiff <= this.BOTH_EYE_SYNC_WINDOW && bothDuration >= this.DRAG_MIN) {
          action = 'drag_toggle';
          this.hasTriggeredDrag = true;
        }
      }

      // Chỉ xét click trái khi mắt phải đang mở
      if (!isLeftClosed && this.leftClosedSince !== null) {
        const durationLeft = timestamp - this.leftClosedSince;
        const wasRightOpen = this.rightClosedSince === null;
        if (wasRightOpen && durationLeft >= this.CLICK_MIN && durationLeft <= clickMax) {
          action = 'left_click';
        }
        this.leftClosedSince = null;
      }

      // Chỉ xét click phải khi mắt trái đang mở
      if (!isRightClosed && this.rightClosedSince !== null) {
        const durationRight = timestamp - this.rightClosedSince;
        const wasLeftOpen = this.leftClosedSince === null;

        if (wasLeftOpen && durationRight >= this.CLICK_MIN && durationRight <= clickMax) {
          action = 'right_click';
        }
        this.rightClosedSince = null;
      }
    }

    // Cooldown logic
    if (action !== 'none') {
      if (timestamp - this.lastActionTime > this.COOLDOWN_MS) {
        this.lastActionTime = timestamp;
        return action;
      }
    }

    return 'none';
  }
}
