// apps/web/lib/gaze/mouse-controller.ts

export class WebCursorController {
  private cursorEl: HTMLElement | null = null;
  private dotEl: HTMLElement | null = null;
  private isFlashing = false;
  private lastSnapped = false;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      const existing = document.getElementById('gaze-cursor');
      if (existing) {
        existing.remove();
      }

      const cursor = document.createElement('div');
      cursor.id = 'gaze-cursor';
      cursor.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 40px;
        height: 40px;
        box-sizing: border-box;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 82, 255, 0.12);
        border: 2.5px solid #0052FF;
        outline: 2px solid #FFFFFF;
        pointer-events: none;
        z-index: 99999;
        will-change: transform;
        transition: transform 0.04s cubic-bezier(0, 0, 0.2, 1), opacity 0.15s ease-out;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(-100px, -100px, 0);
      `;

      const dot = document.createElement('span');
      dot.style.cssText = `
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: #0052FF;
        pointer-events: none;
      `;

      cursor.appendChild(dot);
      document.body.appendChild(cursor);
      this.cursorEl = cursor;
      this.dotEl = dot;
    }
  }

  private applyRestAppearance(isSnapped: boolean): void {
    if (!this.cursorEl) return;

    if (isSnapped) {
      this.cursorEl.style.border = '3px solid #0A0A0A';
      this.cursorEl.style.background = 'rgba(0, 82, 255, 0.22)';
      if (this.dotEl) {
        this.dotEl.style.background = '#0A0A0A';
      }
    } else {
      this.cursorEl.style.border = '2.5px solid #0052FF';
      this.cursorEl.style.background = 'rgba(0, 82, 255, 0.12)';
      if (this.dotEl) {
        this.dotEl.style.background = '#0052FF';
      }
    }
  }

  moveTo(x: number, y: number, isSnapped = false): void {
    if (!this.cursorEl) return;

    this.lastSnapped = isSnapped;
    const scale = isSnapped ? 1.18 : 1.0;

    this.cursorEl.style.opacity = '1';
    this.cursorEl.style.visibility = 'visible';
    this.cursorEl.style.transform = `translate3d(${x - 20}px, ${y - 20}px, 0) scale(${scale})`;

    if (!this.isFlashing) {
      this.applyRestAppearance(isSnapped);
    }
  }

  flashClickEffect(): void {
    if (!this.cursorEl) return;

    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
    }

    this.isFlashing = true;
    this.cursorEl.style.background = 'rgba(21, 128, 61, 0.28)';
    this.cursorEl.style.border = '3px solid #15803D';
    if (this.dotEl) {
      this.dotEl.style.background = '#15803D';
    }

    this.flashTimer = setTimeout(() => {
      this.isFlashing = false;
      this.flashTimer = null;
      this.applyRestAppearance(this.lastSnapped);
    }, 140);
  }

  hide(): void {
    if (this.cursorEl) {
      this.cursorEl.style.opacity = '0';
      this.cursorEl.style.visibility = 'hidden';
      this.cursorEl.style.transform = 'translate3d(-100px, -100px, 0)';
    }
  }

  destroy(): void {
    if (this.flashTimer !== null) {
      clearTimeout(this.flashTimer);
      this.flashTimer = null;
    }
    this.isFlashing = false;

    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl);
      this.cursorEl = null;
      this.dotEl = null;
    }
  }
}
