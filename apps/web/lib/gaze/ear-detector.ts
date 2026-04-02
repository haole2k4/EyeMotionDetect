// Hiện thực mới đo lường thời gian ms thay vì frames để hỗ trợ chuột

export type BlinkAction = 'none' | 'left_click' | 'right_click' | 'drag_toggle';

export class AdaptiveEARDetector {
  private baselineEAR = 0.28;
  private readonly RATIO = 0.6;
  private history: number[] = [];
  private readonly WINDOW = 90;

  // Thời điểm bắt đầu nhắm mắt
  private leftClosedSince: number | null = null;
  private rightClosedSince: number | null = null;
  private lastActionTime = 0;

  // Hằng số tính theo ms
  private readonly CLICK_MIN = 80;
  private readonly CLICK_MAX = 500;
  private readonly DRAG_MIN = 450;
  private readonly COOLDOWN_MS = 700;
  private readonly BOTH_EYE_SYNC_WINDOW = 180;

  update(earLeft: number, earRight: number, timestamp: number): BlinkAction {
    const ear = (earLeft + earRight) / 2;

    if (ear > this.baselineEAR * 0.9) {
      this.history.push(ear);
      if (this.history.length > this.WINDOW) this.history.shift();
      this.baselineEAR = Math.max(...this.history.slice(-30));
    }

    const threshold = this.baselineEAR * this.RATIO;
    const isLeftClosed = earLeft < threshold;
    const isRightClosed = earRight < threshold;

    let action: BlinkAction = 'none';

    // Track thời điểm bắt đầu nhắm từng mắt
    if (isLeftClosed && this.leftClosedSince === null) {
      this.leftClosedSince = timestamp;
    }
    if (isRightClosed && this.rightClosedSince === null) {
      this.rightClosedSince = timestamp;
    }

    // Ưu tiên drag nếu cả 2 mắt nhắm đồng bộ
    if (
      isLeftClosed &&
      isRightClosed &&
      this.leftClosedSince !== null &&
      this.rightClosedSince !== null
    ) {
      const timeDiff = Math.abs(this.leftClosedSince - this.rightClosedSince);
      const bothDuration = timestamp - Math.max(this.leftClosedSince, this.rightClosedSince);

      if (timeDiff <= this.BOTH_EYE_SYNC_WINDOW && bothDuration >= this.DRAG_MIN) {
        action = 'drag_toggle';
        this.leftClosedSince = null;
        this.rightClosedSince = null;
      }
    }

    // Chỉ xét click trái khi mắt phải đang mở
    if (!isLeftClosed && this.leftClosedSince !== null) {
      const durationLeft = timestamp - this.leftClosedSince;
      const wasRightOpen = this.rightClosedSince === null;

      if (wasRightOpen && durationLeft >= this.CLICK_MIN && durationLeft <= this.CLICK_MAX) {
        action = 'left_click';
      }
      this.leftClosedSince = null;
    }

    // Chỉ xét click phải khi mắt trái đang mở
    if (!isRightClosed && this.rightClosedSince !== null) {
      const durationRight = timestamp - this.rightClosedSince;
      const wasLeftOpen = this.leftClosedSince === null;

      if (wasLeftOpen && durationRight >= this.CLICK_MIN && durationRight <= this.CLICK_MAX) {
        action = 'right_click';
      }
      this.rightClosedSince = null;
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

  get currentThreshold(): number {
    return this.baselineEAR * this.RATIO;
  }
}
