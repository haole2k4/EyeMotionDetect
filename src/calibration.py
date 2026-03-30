import os
import sys
import json
import cv2
import numpy as np
import tkinter as tk
from tkinter import messagebox
from datetime import datetime

# DPI Awareness for Windows (must be called before any tk window)
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass

from src.gaze_estimator import GazeEstimator
import yaml


class CalibrationUI:
    # Round constants
    MIN_ROUNDS = 3   # Mandatory rounds
    MAX_ROUNDS = 5   # Hard cap

    def __init__(self, master, config):
        self.master = master
        self.config = config
        self._running = True  # Safe-exit flag

        self.screen_width = config.get('screen', {}).get('width', 1920)
        self.screen_height = config.get('screen', {}).get('height', 1080)

        self.master.geometry(f"{self.screen_width}x{self.screen_height}+0+0")
        self.master.attributes('-fullscreen', True)
        self.master.configure(bg='#e8e8e8')
        self.master.bind('<Escape>', self._on_escape)

        self.canvas = tk.Canvas(
            self.master,
            width=self.screen_width,
            height=self.screen_height,
            bg='#e8e8e8',
            highlightthickness=0,
        )
        self.canvas.pack()

        # Grid settings from config
        self.grid_cols = config.get('calibration', {}).get('grid_cols', 4)
        self.grid_rows = config.get('calibration', {}).get('grid_rows', 3)
        self.samples_per_point = config.get('calibration', {}).get('samples_per_point', 20)
        self.stable_wait_ms = config.get('calibration', {}).get('stable_wait_ms', 1200)

        # Grid points
        self.points = self._generate_grid_points()

        # State
        self.current_round = 0
        self.current_point_idx = 0

        self.collected_data = {
            "screen_resolution": [self.screen_width, self.screen_height],
            "timestamp": datetime.now().isoformat(),
            "samples": [],
        }

        # Dataset directories
        self.dataset_dir = os.path.join('calibration', 'dataset')
        self.images_dir = os.path.join(self.dataset_dir, 'images')
        os.makedirs(self.images_dir, exist_ok=True)

        # Camera
        cam_cfg = config.get('camera', {})
        self.cap = cv2.VideoCapture(cam_cfg.get('index', 0))
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, cam_cfg.get('width', 1280))
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, cam_cfg.get('height', 720))

        # Gaze estimator
        print("Loading Gaze Estimator...")
        self.estimator = GazeEstimator()

        # Show intro then start
        self._show_intro()

    # ------------------------------------------------------------------ grid
    def _generate_grid_points(self):
        points = []
        margin_x = self.screen_width * 0.1
        margin_y = self.screen_height * 0.1

        step_x = (self.screen_width - 2 * margin_x) / max(1, self.grid_cols - 1)
        step_y = (self.screen_height - 2 * margin_y) / max(1, self.grid_rows - 1)

        for r in range(self.grid_rows):
            for c in range(self.grid_cols):
                x = int(margin_x + c * step_x)
                y = int(margin_y + r * step_y)
                points.append((x, y))
        return points

    # ------------------------------------------------------------------ draw
    def _clear_canvas(self):
        self.canvas.delete("all")

    def _draw_target(self, x, y, color="red"):
        self.canvas.delete("target")
        r = 15
        self.canvas.create_oval(
            x - r, y - r, x + r, y + r,
            fill=color, outline=color, tags="target",
        )
        # Crosshair
        self.canvas.create_line(x - r - 5, y, x + r + 5, y, fill="white", width=2, tags="target")
        self.canvas.create_line(x, y - r - 5, x, y + r + 5, fill="white", width=2, tags="target")

    def _draw_text(self, text, font_size=28, color="gray30"):
        """Draw centred text on canvas."""
        self._clear_canvas()
        self.canvas.create_text(
            self.screen_width // 2,
            self.screen_height // 2,
            text=text,
            font=("Segoe UI", font_size),
            fill=color,
            justify="center",
            tags="info",
        )
        self.master.update()

    def _draw_round_info(self):
        """Small info label at top-left showing current round."""
        self.canvas.delete("round_info")
        total = self._decide_total_rounds()
        info = f"Vòng {self.current_round + 1}"
        self.canvas.create_text(
            20, 20,
            text=info,
            anchor="nw",
            font=("Segoe UI", 14),
            fill="gray50",
            tags="round_info",
        )

    # ------------------------------------------------------------------ intro
    def _show_intro(self):
        self._draw_text(
            "Calibration — Nhìn vào dấu thập đỏ\n"
            "Nhấn phím bất kỳ để bắt đầu  |  Escape để thoát",
            font_size=24,
        )
        self.master.bind('<Key>', self._start_after_key)

    def _start_after_key(self, event):
        if event.keysym == 'Escape':
            return
        self.master.unbind('<Key>')
        self._clear_canvas()
        self.master.after(500, self._next_point)

    # --------------------------------------------------- round flow logic
    def _decide_total_rounds(self):
        """Return how many rounds we will do so far (may grow)."""
        return max(self.MIN_ROUNDS, self.current_round + 1)

    def _on_round_finished(self):
        """Called after all points in a round are done."""
        completed = self.current_round + 1  # 1-based
        self.current_round += 1
        self.current_point_idx = 0

        if completed >= self.MAX_ROUNDS:
            # Hard cap reached → finish
            self._finish_calibration()
            return

        if completed >= self.MIN_ROUNDS:
            # Ask user whether to continue (round 4 or 5)
            self.master.attributes('-fullscreen', False)  # so messagebox is visible
            answer = messagebox.askyesno(
                "Tiếp tục?",
                f"Đã hoàn thành {completed}/{self.MAX_ROUNDS} vòng "
                f"({completed * len(self.points)} mẫu).\n\n"
                f"Bạn có muốn thu thêm vòng {completed + 1} không?\n"
                f"(Nhiều data hơn → model chính xác hơn)",
            )
            self.master.attributes('-fullscreen', True)
            if not answer:
                self._finish_calibration()
                return

        # Proceed to next round
        self._draw_text(
            f"Vòng {self.current_round + 1} / {self.MAX_ROUNDS}\n\n"
            "Chuẩn bị…",
            font_size=26,
        )
        self.master.after(1500, self._next_point)

    # ------------------------------------------------------------------ loop
    def _next_point(self):
        if not self._running:
            return

        if self.current_point_idx >= len(self.points):
            self._on_round_finished()
            return

        x, y = self.points[self.current_point_idx]
        self._clear_canvas()
        self._draw_round_info()
        self._draw_target(x, y, color="red")
        self.master.update()

        # Wait for gaze to stabilise, then collect
        self.master.after(self.stable_wait_ms, self._collect_samples, x, y)

    def _collect_samples(self, target_x, target_y):
        if not self._running:
            return

        self._draw_target(target_x, target_y, color="#22c55e")  # green
        self.master.update()

        yaws = []
        pitches = []
        valid = 0

        while valid < self.samples_per_point and self._running:
            ret, frame = self.cap.read()
            if not ret:
                continue

            yaw, pitch, bbox = self.estimator.estimate(frame)
            if yaw is None or pitch is None or bbox is None:
                continue

            yaws.append(yaw)
            pitches.append(pitch)
            valid += 1

            # Save face crop for future fine-tuning
            self._save_face_crop(frame, bbox)

            # Keep GUI responsive
            self.master.update_idletasks()
            self.master.update()

        if not self._running:
            return

        # Median of collected samples
        median_yaw = float(np.median(yaws))
        median_pitch = float(np.median(pitches))

        self.collected_data["samples"].append({
            "screen_x": target_x,
            "screen_y": target_y,
            "gaze_yaw": median_yaw,
            "gaze_pitch": median_pitch,
            "n_frames": valid,
            "round": self.current_round + 1,
            "saved_images_prefix": f"r{self.current_round}_p{self.current_point_idx}",
        })

        self.current_point_idx += 1
        self.master.after(200, self._next_point)

    # ---------------------------------------------------------- save helpers
    def _save_face_crop(self, frame, bbox):
        x_min, y_min, x_max, y_max = map(int, bbox)
        h, w = frame.shape[:2]
        pad = 20
        x1, y1 = max(0, x_min - pad), max(0, y_min - pad)
        x2, y2 = min(w, x_max + pad), min(h, y_max + pad)

        face_img = frame[y1:y2, x1:x2]
        if face_img.size == 0:
            return

        ts = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        name = f"r{self.current_round}_p{self.current_point_idx}_{ts}.jpg"
        cv2.imwrite(os.path.join(self.images_dir, name), face_img)

    # ---------------------------------------------------------- finish / exit
    def _finish_calibration(self):
        # Save JSON
        json_path = os.path.join(self.dataset_dir, 'calibration_data.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.collected_data, f, indent=4, ensure_ascii=False)

        total_samples = len(self.collected_data["samples"])
        total_images = sum(
            1 for _ in os.listdir(self.images_dir)
            if _.endswith('.jpg')
        ) if os.path.isdir(self.images_dir) else 0

        print(f"\n✅  Calibration hoàn tất!")
        print(f"   Tổng số mẫu: {total_samples}")
        print(f"   Tổng ảnh lưu: {total_images}")
        print(f"   File JSON   : {json_path}")

        # Show completion screen
        self._draw_text(
            f"✅  Thu thập dữ liệu hoàn tất!\n\n"
            f"Số vòng: {self.current_round}\n"
            f"Tổng mẫu: {total_samples}\n"
            f"Tổng ảnh: {total_images}\n\n"
            f"Dữ liệu đã lưu tại:\n{json_path}\n\n"
            f"Cửa sổ sẽ đóng sau 5 giây…",
            font_size=22,
            color="gray20",
        )

        self.master.after(5000, self._exit_app)

    def _on_escape(self, event=None):
        """Escape pressed — stop collection gracefully, then save & exit."""
        self._running = False
        # If we already have data, save it before quitting
        if self.collected_data["samples"]:
            self._finish_calibration()
        else:
            self._exit_app()

    def _exit_app(self, event=None):
        self._running = False
        try:
            if self.cap.isOpened():
                self.cap.release()
        except Exception:
            pass
        try:
            self.master.destroy()
        except Exception:
            pass


if __name__ == "__main__":
    config_path = os.path.join("config", "settings.yaml")
    config = {}
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            config = yaml.safe_load(f)

    root = tk.Tk()
    root.title("Gaze Calibration")
    app = CalibrationUI(root, config)
    root.mainloop()
