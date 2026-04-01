// Hiện thực mới đo lường thời gian ms thay vì frames để hỗ trợ chuột

export type BlinkAction = 'none' | 'left_click' | 'right_click' | 'drag_toggle';

export class AdaptiveEARDetector {
  private baselineEAR = 0.28;
  private readonly RATIO = 0.75;
  private history: number[] = [];
  private readonly WINDOW = 90;

  // Thời điểm bắt đầu nhắm mắt
  private leftClosedSince: number | null = null;
  private rightClosedSince: number | null = null;
  private lastActionTime = 0;

  // Hằng số tính theo ms
  private readonly CLICK_MIN = 200;
  private readonly CLICK_MAX = 500;
  private readonly DRAG_MIN = 500;
  private readonly COOLDOWN_MS = 600;

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

    // Xử lý góc trái
    if (isLeftClosed && this.leftClosedSince === null) {
      this.leftClosedSince = timestamp;
    }
    if (!isLeftClosed && this.leftClosedSince !== null) {
      const durationLeft = timestamp - this.leftClosedSince;
      this.leftClosedSince = null;
      // Nháy mắt trái đơn độc (mắt phải không nhắm)
      if (durationLeft >= this.CLICK_MIN && durationLeft <= this.CLICK_MAX && this.rightClosedSince === null) {
        action = 'left_click';
      }
    }

    // Xử lý góc phải
    if (isRightClosed && this.rightClosedSince === null) {
      this.rightClosedSince = timestamp;
    }
    if (!isRightClosed && this.rightClosedSince !== null) {
      const durationRight = timestamp - this.rightClosedSince;
      this.rightClosedSince = null;
      // Nháy mắt phải đơn độc (mắt trái không nhắm)
      if (durationRight >= this.CLICK_MIN && durationRight <= this.CLICK_MAX && this.leftClosedSince === null) {
        action = 'right_click';
      }
    }

    // Nhắm liên tục cả 2 mắt để kéo thả
    if (isLeftClosed && isRightClosed && this.leftClosedSince !== null && this.rightClosedSince !== null) {
      const bothDuration = Math.min(timestamp - this.leftClosedSince, timestamp - this.rightClosedSince);
      if (bothDuration >= this.DRAG_MIN) {
        action = 'drag_toggle';
        // Xóa dấu vết để không kích hoạt nhiều lần lúc vẫn đang nhắm
        this.leftClosedSince = null;
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

  get currentThreshold(): number {
    return this.baselineEAR * this.RATIO;
  }
}
