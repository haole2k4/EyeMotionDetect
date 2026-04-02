// apps/web/lib/gaze/mouse-controller.ts

export class WebCursorController {
  private cursorEl: HTMLElement | null = null;
  private observer: MutationObserver | null = null;

  // Dwell-Time Click state
  private dwellStartX = -1;
  private dwellStartY = -1;
  private dwellStartTime = 0;
  private readonly DWELL_RADIUS = 15; // px
  private readonly DWELL_TIME_MS = 800; // ms
  private hasClickedInDwell = false;

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

      // Theo dõi thay đổi DOM lớn để chống lag
      this.observer = new MutationObserver(() => {
        // Reset timer nếu giao diện giật
        this.dwellStartTime = 0;
      });
      this.observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  private dispatchClickEvent(x: number, y: number) {
    const el = document.elementFromPoint(x, y);
    if (!el) return;
    const evt = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y
    });
    el.dispatchEvent(evt);
  }

  moveTo(x: number, y: number): void {
    if (this.cursorEl) {
      this.cursorEl.style.left = `${x}px`;
      this.cursorEl.style.top  = `${y}px`;
    }

    const t = performance.now();
    const dist = Math.hypot(x - this.dwellStartX, y - this.dwellStartY);

    if (dist > this.DWELL_RADIUS) {
      // Chuột di chuyển xa -> reset timer
      this.dwellStartX = x;
      this.dwellStartY = y;
      this.dwellStartTime = t;
      this.hasClickedInDwell = false;
      
      if (this.cursorEl) {
        this.cursorEl.style.background = 'rgba(255,100,100,0.7)';
      }
    } else {
      // Ổn định trong vùng dwell
      if (!this.hasClickedInDwell && (t - this.dwellStartTime) >= this.DWELL_TIME_MS) {
        this.dispatchClickEvent(x, y);
        this.hasClickedInDwell = true;
        
        if (this.cursorEl) {
          // Hiển thị effect chớp nháy khi click
          this.cursorEl.style.background = 'rgba(100,255,100,0.9)';
          setTimeout(() => {
            if (this.cursorEl) this.cursorEl.style.background = 'rgba(255,100,100,0.7)';
          }, 150);
        }
      }
    }
  }

  destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
    }
    if (this.cursorEl && this.cursorEl.parentNode) {
      this.cursorEl.parentNode.removeChild(this.cursorEl);
    }
  }
}