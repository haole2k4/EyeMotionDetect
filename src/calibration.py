import os
import sys
import time
import json
import cv2
import numpy as np
import tkinter as tk
from datetime import datetime

# DPI Awareness for Windows
try:
    import ctypes
    ctypes.windll.shcore.SetProcessDpiAwareness(1)
except Exception:
    pass

from src.gaze_estimator import GazeEstimator
import yaml

class CalibrationUI:
    def __init__(self, master, config):
        self.master = master
        self.config = config
        
        self.screen_width = config.get('screen', {}).get('width', 1920)
        self.screen_height = config.get('screen', {}).get('height', 1080)
        
        self.master.geometry(f"{self.screen_width}x{self.screen_height}+0+0")
        self.master.attributes('-fullscreen', True)
        self.master.configure(bg='gray90')
        self.master.bind('<Escape>', self.exit_app)
        
        self.canvas = tk.Canvas(self.master, width=self.screen_width, height=self.screen_height, bg='gray90', highlightthickness=0)
        self.canvas.pack()
        
        # Grid settings
        self.grid_cols = config.get('calibration', {}).get('grid_cols', 4)
        self.grid_rows = config.get('calibration', {}).get('grid_rows', 3)
        self.samples_per_point = config.get('calibration', {}).get('samples_per_point', 20)
        self.stable_wait_ms = config.get('calibration', {}).get('stable_wait_ms', 1200)
        
        # Calculate grid points
        self.points = self._generate_grid_points()
        
        self.total_rounds = 3 # Go through grid 3 times
        self.current_round = 0
        self.current_point_idx = 0
        
        self.collected_data = {
            "screen_resolution": [self.screen_width, self.screen_height],
            "timestamp": datetime.now().isoformat(),
            "samples": []
        }
        
        self.dataset_dir = os.path.join('calibration', 'dataset')
        self.images_dir = os.path.join(self.dataset_dir, 'images')
        os.makedirs(self.images_dir, exist_ok=True)
        
        # Initialize Camera & Gaze Estimator
        self.cap = cv2.VideoCapture(config.get('camera', {}).get('index', 0))
        self.cap.set(cv2.CAP_PROP_FRAME_WIDTH, config.get('camera', {}).get('width', 1280))
        self.cap.set(cv2.CAP_PROP_FRAME_HEIGHT, config.get('camera', {}).get('height', 720))
        
        print("Loading Gaze Estimator...")
        self.estimator = GazeEstimator()
        
        self.is_collecting = False
        
        # Start the loop
        self.master.after(1000, self.next_point)
        
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

    def draw_target(self, x, y, color="red"):
        self.canvas.delete("target")
        r = 15
        self.canvas.create_oval(x - r, y - r, x + r, y + r, fill=color, outline=color, tags="target")
        self.canvas.create_line(x - r - 5, y, x + r + 5, y, fill="white", width=2, tags="target")
        self.canvas.create_line(x, y - r - 5, x, y + r + 5, fill="white", width=2, tags="target")

    def next_point(self):
        if self.current_point_idx >= len(self.points):
            self.current_point_idx = 0
            self.current_round += 1
            
            if self.current_round >= self.total_rounds:
                self.finish_calibration()
                return
                
        x, y = self.points[self.current_point_idx]
        self.draw_target(x, y, color="red")
        
        self.master.update()
        
        # Wait for user to stabilize gaze
        self.master.after(self.stable_wait_ms, self.collect_samples, x, y)

    def collect_samples(self, target_x, target_y):
        self.draw_target(target_x, target_y, color="green")
        self.master.update()
        
        yaws = []
        pitches = []
        valid_frames_count = 0
        
        while valid_frames_count < self.samples_per_point:
            ret, frame = self.cap.read()
            if not ret:
                continue
                
            yaw, pitch, bbox = self.estimator.estimate(frame)
            if yaw is not None and pitch is not None and bbox is not None:
                yaws.append(yaw)
                pitches.append(pitch)
                valid_frames_count += 1
                
                # Save crop image securely for finetuning
                x_min, y_min, x_max, y_max = map(int, bbox)
                # Expand box slightly
                h, w = frame.shape[:2]
                pad = 20
                x1 = max(0, x_min - pad)
                y1 = max(0, y_min - pad)
                x2 = min(w, x_max + pad)
                y2 = min(h, y_max + pad)
                
                face_img = frame[y1:y2, x1:x2]
                
                timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
                img_name = f"r{self.current_round}_p{self.current_point_idx}_{timestamp_str}.jpg"
                img_path = os.path.join(self.images_dir, img_name)
                
                if face_img.size > 0:
                    cv2.imwrite(img_path, face_img)
                    
            # Allow GUI updates
            self.master.update_idletasks()
            self.master.update()
            
        # Store median values
        median_yaw = float(np.median(yaws))
        median_pitch = float(np.median(pitches))
        
        self.collected_data["samples"].append({
            "screen_x": target_x,
            "screen_y": target_y,
            "gaze_yaw": median_yaw,
            "gaze_pitch": median_pitch,
            "n_frames": valid_frames_count,
            "round": self.current_round + 1,
            "saved_images_prefix": f"r{self.current_round}_p{self.current_point_idx}"
        })
        
        self.current_point_idx += 1
        self.master.after(200, self.next_point)

    def finish_calibration(self):
        json_path = os.path.join(self.dataset_dir, 'calibration_data.json')
        with open(json_path, 'w', encoding='utf-8') as f:
            json.dump(self.collected_data, f, indent=4)
            
        print(f"Calibration finished. Saved to {json_path}")
        self.exit_app()

    def exit_app(self, event=None):
        if self.cap.isOpened():
            self.cap.release()
        self.master.destroy()
        sys.exit(0)

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
