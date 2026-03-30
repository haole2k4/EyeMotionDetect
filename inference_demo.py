import torch
import cv2
import time
from l2cs import Pipeline, render

def main():
    print("Checking CUDA...")
    print(f"CUDA available: {torch.cuda.is_available()}")
    if torch.cuda.is_available():
        print(f"Device name: {torch.cuda.get_device_name(0)}")

    try:
        # Load a dummy image that's easily generated (black frame)
        frame = cv2.imread("demo.jpg")
        if frame is None:
            frame = torch.zeros((480, 640, 3), dtype=torch.uint8).numpy()
            
        print("Initializing L2CS-Net Pipeline...")
        # Note: adjust models/L2CSNet_gaze360.pkl path according to git clone
        gaze_pipeline = Pipeline(
            weights="models/L2CSNet_gaze360.pkl",
            arch="ResNet50",
            device=torch.device('cuda' if torch.cuda.is_available() else 'cpu')
        )
        
        print("Running inference demo...")
        start_time = time.perf_counter()
        results = gaze_pipeline.step(frame)
        end_time = time.perf_counter()
        
        print(f"Inference time: {(end_time - start_time) * 1000:.2f} ms")
        if results and results.pitch is not None:
            print(f"Successfully detected {len(results.pitch)} faces.")
            print("Yaw, Pitch shapes:", results.yaw.shape, results.pitch.shape)
        else:
            print("No faces detected in dummy image, but pipeline executed successfully.")
            
        print("Inference demo PASS.")
    except Exception as e:
        print(f"Inference demo FAILED: {e}")

if __name__ == "__main__":
    main()
