import os
os.environ["QT_QPA_FONTDIR"] = "/usr/share/fonts"

import cv2 as cv
import mediapipe as mp
import time

from src.blink_detector import BlinkDetector, BlinkType, compute_avg_ear

BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
FaceLandmarkerResult  = mp.tasks.vision.FaceLandmarkerResult
VisionRunningMode     = mp.tasks.vision.RunningMode

MODEL_PATH = 'face_landmarker.task'

LEFT_EYE_CONTOUR  = [33, 246, 161, 160, 159, 158, 157, 173, 133,
                     155, 154, 153, 145, 144, 163, 7]
RIGHT_EYE_CONTOUR = [263, 466, 388, 387, 386, 385, 384, 398, 362,
                     382, 381, 380, 374, 373, 390, 249]

latest_result: FaceLandmarkerResult = None


def result_callback(result: FaceLandmarkerResult,
                    output_image: mp.Image,
                    timestamp_ms: int):
    global latest_result
    latest_result = result


def draw_eye_contour(frame, landmarks, contour_indices, color, h, w):
    pts = [(int(landmarks[i].x * w), int(landmarks[i].y * h))
           for i in contour_indices]
    for i in range(len(pts)):
        cv.line(frame, pts[i], pts[(i + 1) % len(pts)], color, 1, cv.LINE_AA)
    for pt in pts:
        cv.circle(frame, pt, 2, color, -1, cv.LINE_AA)


def draw_ear_points(frame, landmarks, ear_indices, h, w):
    from src.blink_detector import LEFT_EYE_EAR_IDX
    p1, p2, p3, p4, p5, p6 = [landmarks[i] for i in ear_indices]
    for p in (p1, p4):
        cv.circle(frame, (int(p.x*w), int(p.y*h)), 3, (0, 140, 255), -1, cv.LINE_AA)
    for p in (p2, p3):
        cv.circle(frame, (int(p.x*w), int(p.y*h)), 3, (255, 200, 0), -1, cv.LINE_AA)
    for p in (p5, p6):
        cv.circle(frame, (int(p.x*w), int(p.y*h)), 3, (0, 200, 255), -1, cv.LINE_AA)


def draw_ui_panel(frame, left_ear, right_ear, avg_ear,
                  blink_event: BlinkType, is_blinking: bool,
                  short_count: int, long_count: int):
    panel_w, panel_h = 300, 180
    overlay = frame.copy()
    cv.rectangle(overlay, (0, 0), (panel_w, panel_h), (20, 20, 20), -1)
    cv.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    def put(text, row, color=(220, 220, 220)):
        cv.putText(frame, text, (10, 22 + row * 26),
                   cv.FONT_HERSHEY_SIMPLEX, 0.55, color, 1, cv.LINE_AA)

    put(f"Left  EAR : {left_ear:.3f}", 0)
    put(f"Right EAR : {right_ear:.3f}", 1)
    put(f"Avg   EAR : {avg_ear:.3f}", 2)
    put(f"SHORT blink: {short_count}", 3)
    put(f"LONG  blink: {long_count}", 4)

    if is_blinking:
        label, badge_color = "CLOSING...", (0, 180, 100)
    elif blink_event == BlinkType.SHORT:
        label, badge_color = "SHORT BLINK (L-Click)", (0, 220, 255)
    elif blink_event == BlinkType.LONG:
        label, badge_color = "LONG BLINK (R-Click)", (60, 60, 220)
    elif blink_event == BlinkType.SUSTAINED:
        label, badge_color = "SUSTAINED (ignored)", (120, 120, 120)
    else:
        label, badge_color = "OPEN", (50, 200, 50)

    cv.rectangle(frame, (0, panel_h), (panel_w, panel_h + 36), badge_color, -1)
    cv.putText(frame, label, (10, panel_h + 25),
               cv.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2, cv.LINE_AA)


options = FaceLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=VisionRunningMode.LIVE_STREAM,
    num_faces=1,
    result_callback=result_callback
)

cap = cv.VideoCapture(0)
if not cap.isOpened():
    print("Error: Could not open webcam.")
    exit(1)

print("Blink detector started (Phase 1.2). Press 'q' to quit.")

detector    = BlinkDetector()
short_count = 0
long_count  = 0
display_event     = BlinkType.NONE
display_hold_frames = 0
DISPLAY_HOLD = 18

with FaceLandmarker.create_from_options(options) as landmarker:
    while True:
        ret, frame = cap.read()
        if not ret:
            print("Error: Failed to read frame.")
            break

        frame = cv.flip(frame, 1)
        h, w  = frame.shape[:2]

        rgb_frame    = cv.cvtColor(frame, cv.COLOR_BGR2RGB)
        mp_image     = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_frame)
        timestamp_ms = int(time.time() * 1000)
        landmarker.detect_async(mp_image, timestamp_ms)

        left_ear = right_ear = avg_ear = 0.0
        result = latest_result

        if result and result.face_landmarks:
            lm = result.face_landmarks[0]
            left_ear, right_ear, avg_ear = compute_avg_ear(lm)

            eye_color = (0, 255, 255) if not detector.is_blinking else (0, 60, 255)
            draw_eye_contour(frame, lm, LEFT_EYE_CONTOUR,  eye_color, h, w)
            draw_eye_contour(frame, lm, RIGHT_EYE_CONTOUR, eye_color, h, w)

            from src.blink_detector import LEFT_EYE_EAR_IDX, RIGHT_EYE_EAR_IDX
            draw_ear_points(frame, lm, LEFT_EYE_EAR_IDX,  h, w)
            draw_ear_points(frame, lm, RIGHT_EYE_EAR_IDX, h, w)

        blink_event = detector.update(avg_ear)

        if blink_event == BlinkType.SHORT:
            short_count += 1
            display_event = blink_event
            display_hold_frames = DISPLAY_HOLD
        elif blink_event == BlinkType.LONG:
            long_count += 1
            display_event = blink_event
            display_hold_frames = DISPLAY_HOLD
        elif blink_event == BlinkType.SUSTAINED:
            display_event = blink_event
            display_hold_frames = DISPLAY_HOLD

        if display_hold_frames > 0:
            display_hold_frames -= 1
        else:
            display_event = BlinkType.NONE

        draw_ui_panel(frame, left_ear, right_ear, avg_ear,
                      display_event, detector.is_blinking,
                      short_count, long_count)

        cv.putText(frame, "Press 'q' to quit", (w - 180, h - 10),
                   cv.FONT_HERSHEY_SIMPLEX, 0.45, (160, 160, 160), 1, cv.LINE_AA)

        cv.imshow("Blink Detector - Phase 1.2", frame)
        if cv.waitKey(1) & 0xFF == ord('q'):
            break

cap.release()
cv.destroyAllWindows()
