export class AdaptiveEARDetector {
  private baselineEAR = 0.28;
  private readonly RATIO = 0.75;
  private history: number[] = [];
  private readonly WINDOW = 90;
  private closedFrames = 0;
  private wasBelow = false;
  private readonly SHORT_MIN = 2;
  private readonly SHORT_MAX = 8;
  private readonly LONG_MIN = 15;

  update(earLeft: number, earRight: number): 'none' | 'short' | 'long' {
    const ear = (earLeft + earRight) / 2;

    if (ear > this.baselineEAR * 0.9) {
      this.history.push(ear);
      if (this.history.length > this.WINDOW) this.history.shift();
      this.baselineEAR = Math.max(...this.history.slice(-30));
    }

    const threshold = this.baselineEAR * this.RATIO;
    const isBelow = ear < threshold;

    if (isBelow) {
      this.closedFrames++;
      this.wasBelow = true;
      return 'none';
    }

    if (this.wasBelow) {
      const frames = this.closedFrames;
      this.closedFrames = 0;
      this.wasBelow = false;

      if (frames >= this.LONG_MIN) return 'long';
      if (frames >= this.SHORT_MIN && frames <= this.SHORT_MAX) return 'short';
    }

    return 'none';
  }

  get currentThreshold(): number {
    return this.baselineEAR * this.RATIO;
  }
}
