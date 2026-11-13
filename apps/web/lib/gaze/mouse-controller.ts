// apps/web/lib/gaze/mouse-controller.ts

export class WebCursorController {
  private cursorEl: HTMLElement | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      const existing = document.getElementById('gaze-cursor');
      if (existing) {
        existing.remove();
      }

      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'gaze-cursor';
      this.cursorEl.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(56, 189, 248, 0.55) 0%, rgba(56, 189, 248, 0.15) 60%, transparent 100%);
        border: 2px solid rgba(56, 189, 248, 0.8);
        box-shadow: 0 0 16px rgba(56, 189, 248, 0.4);
        pointer-events: none;
        z-index: 99999;
        will-change: transform;
        transition: transform 0.04s cubic-bezier(0, 0, 0.2, 1), opacity 0.15s ease-out;
        opacity: 0;
        visibility: hidden;
        transform: translate3d(-100px, -100px, 0);
      `;
      document.body.appendChild(this.cursorEl);
    }
  }

  moveTo(x: number, y: number, isSnapped = false): void {
    if (this.cursorEl) {
      const scale = isSnapped ? 1.25 : 1.0;
      this.cursorEl.style.opacity = '1';
      this.cursorEl.style.visibility = 'visible';
      this.cursorEl.style.transform = `translate3d(${x - 18}px, ${y - 18}px, 0) scale(${scale})`;
      if (isSnapped) {
        this.cursorEl.style.borderColor = 'rgba(234, 179, 8, 0.95)';
        this.cursorEl.style.boxShadow = '0 0 20px rgba(234, 179, 8, 0.6)';
      } else {
        this.cursorEl.style.borderColor = 'rgba(56, 189, 248, 0.8)';
        this.cursorEl.style.boxShadow = '0 0 16px rgba(56, 189, 248, 0.4)';
      }
    }
  }

  flashClickEffect(): void {
    if (this.cursorEl) {
      this.cursorEl.style.background =
        'radial-gradient(circle, rgba(74, 222, 128, 0.85) 0%, rgba(74, 222, 128, 0.3) 70%, transparent 100%)';
      setTimeout(() => {
        if (this.cursorEl) {
          this.cursorEl.style.background =
            'radial-gradient(circle, rgba(56, 189, 248, 0.55) 0%, rgba(56, 189, 248, 0.15) 60%, transparent 100%)';
        }
      }, 140);
    }
  }

  hide(): void {
    if (this.cursorEl) {
      this.cursorEl.style.opacity = '0';
      this.cursorEl.style.visibility = 'hidden';
      this.cursorEl.style.transform = 'translate3d(-100px, -100px, 0)';
    }
  }

  destroy(): void {
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl);
      this.cursorEl = null;
    }
  }
}
