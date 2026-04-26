// apps/web/lib/gaze/smoother.ts
// one euro
class LowPassFilter {
  private y: number | null = null;
  private s: number | null = null;

  filter(value: number, alpha: number): number {
    if (this.y === null) {
      this.s = value;
    } else {
      this.s = alpha * value + (1 - alpha) * this.s!;
    }
    this.y = value;
    return this.s;
  }

  get last(): number | null {
    return this.y;
  }
}

export class GazeSmoother {
  private xFilter = new LowPassFilter();
  private dxFilter = new LowPassFilter();
  private yFilter = new LowPassFilter();
  private dyFilter = new LowPassFilter();

  private prevTime: number | null = null;
  private prevX: number | null = null;
  private prevY: number | null = null;

  constructor(
    private minCutoff = 1.0,
    private beta = 0.007,
    private dCutoff = 1.0,
    private deadZone = 5 // px — không di chuyển nếu delta nhỏ hơn
  ) {}

  private alpha(cutoff: number, dt: number): number {
    const tau = 1.0 / (2 * Math.PI * cutoff);
    return 1.0 / (1.0 + tau / dt);
  }

  update(rawX: number, rawY: number): { x: number; y: number; moved: boolean } {
    const t = performance.now();
    if (this.prevTime === null) {
      this.prevTime = t;
      this.prevX = this.xFilter.filter(rawX, 1.0);
      this.prevY = this.yFilter.filter(rawY, 1.0);
      return { x: this.prevX, y: this.prevY, moved: false };
    }

    const dt = (t - this.prevTime) / 1000.0;
    if (dt <= 0) {
      return { x: this.prevX!, y: this.prevY!, moved: false };
    }

    // Tốc độ (velocity) của raw values
    const dx = (rawX - this.xFilter.last!) / dt;
    const dy = (rawY - this.yFilter.last!) / dt;

    const alphaD = this.alpha(this.dCutoff, dt);
    const edx = this.dxFilter.filter(dx, alphaD);
    const edy = this.dyFilter.filter(dy, alphaD);

    const cutoffX = this.minCutoff + this.beta * Math.abs(edx);
    const cutoffY = this.minCutoff + this.beta * Math.abs(edy);

    const alphaX = this.alpha(cutoffX, dt);
    const alphaY = this.alpha(cutoffY, dt);

    const smoothX = this.xFilter.filter(rawX, alphaX);
    const smoothY = this.yFilter.filter(rawY, alphaY);

    const deltaX = Math.abs(smoothX - this.prevX!);
    const deltaY = Math.abs(smoothY - this.prevY!);
    const moved = deltaX > this.deadZone || deltaY > this.deadZone;

    this.prevTime = t;
    this.prevX = smoothX;
    this.prevY = smoothY;

    return { x: smoothX, y: smoothY, moved };
  }
}

