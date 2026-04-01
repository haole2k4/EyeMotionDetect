// apps/web/lib/gaze/mouse-controller.ts

export class WebCursorController {
  private cursorEl: HTMLElement | null = null;

  constructor() {
    if (typeof document !== 'undefined') {
      this.cursorEl = document.createElement('div');
      this.cursorEl.id = 'gaze-cursor';
      this.cursorEl.style.cssText = `
        position: fixed; width: 20px; height: 20px;
        border-radius: 50%; background: rgba(255,100,100,0.7);
        pointer-events: none; z-index: 99999;
        transform: translate(-50%, -50%);
        transition: opacity 0.1s;
      `;
      document.body.appendChild(this.cursorEl);
    }
  }

  moveTo(x: number, y: number): void {
    if (this.cursorEl) {
      this.cursorEl.style.left = `${x}px`;
      this.cursorEl.style.top  = `${y}px`;
    }
  }

  destroy(): void {
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl);
    }
  }
}