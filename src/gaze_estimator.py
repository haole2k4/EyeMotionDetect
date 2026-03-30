import os
import torch
from l2cs import Pipeline
import numpy as np

class GazeEstimator:
    def __init__(self, model_path="models/L2CSNet_gaze360.pkl", device=None):
        """
        Wrapper for L2CS-Net to estimate gaze (yaw, pitch).
        """
        if device is None:
            self.device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        else:
            self.device = torch.device(device)
            
        self.model_path = model_path
        self._ensure_model_exists()
        
        print(f"Initializing L2CS Pipeline on {self.device}...")
        self.pipeline = Pipeline(
            weights=self.model_path,
            arch='ResNet50',
            device=self.device
        )
        print("L2CS Pipeline initialized successfully.")

    def _ensure_model_exists(self):
        os.makedirs(os.path.dirname(self.model_path), exist_ok=True)
        if not os.path.exists(self.model_path):
            msg = (f"Model weights not found at {self.model_path}.\n"
                   f"Please download the L2CSNet_gaze360.pkl from the official L2CS-Net repository:\n"
                   f"https://github.com/Ahmednull/L2CS-Net\n"
                   f"and save it to {self.model_path}.")
            raise FileNotFoundError(msg)

    def estimate(self, frame):
        """
        Estimate gaze (yaw, pitch) from BGR frame.
        
        Args:
            frame: BGR image from OpenCV
            
        Returns:
            yaw (float): Yaw angle in degrees (negative = left, positive = right).
            pitch (float): Pitch angle in degrees (negative = up, positive = down).
            bbox (list): Face bounding box [x_min, y_min, x_max, y_max].
                         Returns (None, None, None) if no face is detected.
        """
        if frame is None:
            return None, None, None
            
        # step(frame) returns a Results object containing pitch, yaw, bboxes, landmarks.
        results = self.pipeline.step(frame)
        
        # Check if faces were detected
        if results is None or results.pitch is None or len(results.pitch) == 0:
            return None, None, None
            
        # Extract the first face (usually largest or most prominent)
        pitch = float(results.pitch[0]) * 180.0 / np.pi if isinstance(results.pitch[0], torch.Tensor) else float(results.pitch[0])
        yaw = float(results.yaw[0]) * 180.0 / np.pi if isinstance(results.yaw[0], torch.Tensor) else float(results.yaw[0])
        
        # L2CS results.pitch/yaw might already be in radians or degrees?
        # Actually in original l2cs they are float arrays representing degrees, not tensors of radians, but we cast to float just in case.
        # Original L2CS-Net returns tensors of angles, or numpy arrays.
        pitch = float(results.pitch[0])
        yaw = float(results.yaw[0])
        bbox = results.bboxes[0] # [x_min, y_min, x_max, y_max]
        
        return yaw, pitch, bbox
