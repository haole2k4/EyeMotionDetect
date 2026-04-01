// apps/web/lib/gaze/smoother.ts

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export class GazeSmoother {
  private prevX: number | null = null;
  private prevY: number | null = null;
  private readonly history: [number, number][] = [];
  private readonly WINDOW = 7;

  constructor(
    private alpha      = 0.25,   // EMA weight
    private deadZone   = 8,      // px — không di chuyển nếu delta nhỏ hơn
    private outlierThX = 250,    // px — reject nếu jump lớn hơn
    private outlierThY = 180,
  ) {}

  update(rawX: number, rawY: number): { x: number; y: number; moved: boolean } {
    // Outlier rejection
    if (this.history.length >= 3) {
      const mX = median(this.history.map(h => h[0]));
      const mY = median(this.history.map(h => h[1]));
      if (Math.abs(rawX - mX) > this.outlierThX || Math.abs(rawY - mY) > this.outlierThY) {
        return { x: this.prevX ?? rawX, y: this.prevY ?? rawY, moved: false };
      }
    }

    // Update history
    this.history.push([rawX, rawY]);
    if (this.history.length > this.WINDOW) this.history.shift();

    // EMA
    const smoothX = this.prevX === null ? rawX : this.alpha * rawX + (1 - this.alpha) * this.prevX;
    const smoothY = this.prevY === null ? rawY : this.alpha * rawY + (1 - this.alpha) * this.prevY;

    // Dead zone
    const dx = Math.abs(smoothX - (this.prevX ?? smoothX));
    const dy = Math.abs(smoothY - (this.prevY ?? smoothY));
    const moved = dx > this.deadZone || dy > this.deadZone;

    this.prevX = smoothX;
    this.prevY = smoothY;
    return { x: smoothX, y: smoothY, moved };
  }
}