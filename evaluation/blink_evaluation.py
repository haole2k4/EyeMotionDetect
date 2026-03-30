"""
evaluation/blink_evaluation.py
Phase 1.3 — Evaluation cho Blink Detector

Test cases (từ Plan.md §1.3):
  TC-1  False positive rate         : Ngồi bình thường 1 phút    → < 2 click ngoài ý muốn
  TC-2  Chớp tự nhiên không trigger : Chớp tự nhiên (tự động)    → 0 click
  TC-3  Short blink reliability     : Cố ý chớp 20 lần           → ≥ 18/20
  TC-4  Long  blink reliability     : Cố ý nhắm 2s, 10 lần       → ≥ 9/10
  TC-5  Phân biệt short/long        : 10 short + 10 long          → không nhầm loại

Chạy:
    python evaluation/blink_evaluation.py [--tc {1,2,3,4,5,all}]
"""

import os

import sys
import argparse
import time
import json
import datetime
import cv2 as cv
import mediapipe as mp

# ── thêm root vào sys.path để import src ──────────────────────────────────────
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from src.blink_detector import (
    BlinkDetector, BlinkType, compute_avg_ear,
    LEFT_EYE_EAR_IDX, RIGHT_EYE_EAR_IDX,
)

# ── MediaPipe setup ────────────────────────────────────────────────────────────
BaseOptions           = mp.tasks.BaseOptions
FaceLandmarker        = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
FaceLandmarkerResult  = mp.tasks.vision.FaceLandmarkerResult
VisionRunningMode     = mp.tasks.vision.RunningMode

MODEL_PATH = os.path.join(ROOT, "face_landmarker.task")

latest_result: FaceLandmarkerResult = None


def result_callback(result: FaceLandmarkerResult,
                    output_image: mp.Image,
                    timestamp_ms: int):
    global latest_result
    latest_result = result


# ── Helpers ────────────────────────────────────────────────────────────────────

PASS_COLOR = (50, 220, 50)
FAIL_COLOR = (50, 50, 220)
WARN_COLOR = (0, 200, 255)
DARK       = (20, 20, 20)
WHITE      = (240, 240, 240)
FONT       = cv.FONT_HERSHEY_SIMPLEX


def put(img, text, pos, scale=0.55, color=WHITE, thick=1):
    cv.putText(img, text, pos, FONT, scale, color, thick, cv.LINE_AA)


def draw_hud(frame, tc_name: str, instruction: str,
             ear: float, short_c: int, long_c: int,
             status: str, time_left: float):
    h, w = frame.shape[:2]
    panel_h = 160
    overlay = frame.copy()
    cv.rectangle(overlay, (0, 0), (w, panel_h), DARK, -1)
    cv.addWeighted(overlay, 0.6, frame, 0.4, 0, frame)

    put(frame, f"[{tc_name}]  {instruction}", (10, 22), 0.55, WARN_COLOR, 1)
    put(frame, f"EAR: {ear:.3f}", (10, 50))
    put(frame, f"SHORT: {short_c}   LONG: {long_c}", (10, 78))
    put(frame, f"Time left: {max(0, time_left):.1f}s", (10, 106))
    put(frame, status, (10, 134), 0.6, PASS_COLOR)

    put(frame, "Press 'q' to abort", (w - 200, h - 10), 0.42, (140, 140, 140))


def _should_quit(key_char) -> bool:
    """Return True if user pressed ESC/q or closed the window with the X button."""
    if key_char in ('q', '\x1b'):   # 'q' or ESC
        return True
    # Check if every window has been destroyed (user clicked X)
    try:
        if cv.getWindowProperty("", cv.WND_PROP_VISIBLE) < 0:
            return True
    except Exception:
        pass
    return False


def wait_key(ms=1) -> str | None:
    k = cv.waitKey(ms) & 0xFF
    return chr(k) if k < 128 else None


def countdown_overlay(cap, landmarker_ref, detector, win_name,
                      seconds: int, msg: str):
    """Show a countdown before a test starts, updating EAR while waiting."""
    t_end = time.monotonic() + seconds
    while time.monotonic() < t_end:
        ret, frame = cap.read()
        if not ret:
            break
        frame = cv.flip(frame, 1)
        h, w  = frame.shape[:2]
        left  = int(t_end - time.monotonic()) + 1
        overlay = frame.copy()
        cv.rectangle(overlay, (0, 0), (w, 80), DARK, -1)
        cv.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)
        put(frame, msg, (10, 30), 0.65, WARN_COLOR, 2)
        put(frame, f"Starting in {left}s …", (10, 62), 0.6, WHITE, 1)
        cv.imshow(win_name, frame)
        key = wait_key()
        if _should_quit(key):
            return False
        # Also check if window was closed via X button
        try:
            if cv.getWindowProperty(win_name, cv.WND_PROP_VISIBLE) < 1:
                return False
        except Exception:
            return False
    return True


# ── Test Cases ─────────────────────────────────────────────────────────────────

def run_tc(tc_id: int, cap, win_name: str, detector: BlinkDetector,
           options: FaceLandmarkerOptions) -> dict:
    """Return result dict: {tc, passed, short, long, criterion, note}"""

    global latest_result
    latest_result = None

    configs = {
        1: {"name": "TC-1: False Positive Rate",
            "instr": "Ngoi binh thuong, KHONG co y nham mat",
            "duration": 60,
            "count_target": None},
        2: {"name": "TC-2: Chop TN khong trigger",
            "instr": "Chop mat binh thuong tu nhien",
            "duration": 60,
            "count_target": None},
        3: {"name": "TC-3: Short blink x20",
            "instr": "Co y CHOP NHANH 20 lan (< 250ms moi lan)",
            "duration": 120,
            "count_target": 20},
        4: {"name": "TC-4: Long blink x10",
            "instr": "Co y NHAM MAT ~2s, lam 10 lan",
            "duration": 120,
            "count_target": 10},
        5: {"name": "TC-5: Phan biet Short vs Long",
            "instr": "Lam 10 SHORT roi 10 LONG (theo thu tu)",
            "duration": 180,
            "count_target": 20},
    }

    cfg      = configs[tc_id]
    tc_name  = cfg["name"]
    instr    = cfg["instr"]
    duration = cfg["duration"]

    # 3-second countdown
    ok = countdown_overlay(cap, None, detector, win_name, 3,
                           f"Chuan bi: {tc_name}")
    if not ok:
        return {"tc": tc_id, "passed": None, "note": "Aborted"}

    short_count  = 0
    long_count   = 0
    # TC-5 tracking: first 10 events expected SHORT, next 10 LONG
    tc5_events   = []

    t_start = time.monotonic()

    with FaceLandmarker.create_from_options(options) as landmarker:
        while True:
            elapsed   = time.monotonic() - t_start
            time_left = duration - elapsed

            if time_left <= 0:
                break
            # TC-3/4: stop early when target count reached
            if tc_id == 3 and short_count >= 20:
                break
            if tc_id == 4 and long_count >= 10:
                break
            if tc_id == 5 and len(tc5_events) >= 20:
                break

            ret, frame = cap.read()
            if not ret:
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

            blink_event = detector.update(avg_ear)

            if blink_event == BlinkType.SHORT:
                short_count += 1
                if tc_id == 5:
                    tc5_events.append("SHORT")
            elif blink_event == BlinkType.LONG:
                long_count += 1
                if tc_id == 5:
                    tc5_events.append("LONG")

            # live status line
            if tc_id == 1:
                status = f"FP clicks so far: {short_count + long_count}  (limit: < 2)"
            elif tc_id == 2:
                status = f"Triggers so far: {short_count + long_count}  (must be 0)"
            elif tc_id == 3:
                status = f"Short detected: {short_count}/20  Need >= 18"
            elif tc_id == 4:
                status = f"Long  detected: {long_count}/10  Need >= 9"
            else:
                first10  = tc5_events[:10]
                second10 = tc5_events[10:]
                ok_first  = sum(1 for e in first10  if e == "SHORT")
                ok_second = sum(1 for e in second10 if e == "LONG")
                status = (f"SHORT phase: {ok_first}/10 correct  |  "
                          f"LONG phase: {ok_second}/{len(second10)} correct")

            draw_hud(frame, tc_name, instr, avg_ear,
                     short_count, long_count, status, time_left)
            cv.imshow(win_name, frame)
            key = wait_key()
            if _should_quit(key):
                return {"tc": tc_id, "passed": None, "note": "Aborted"}
            try:
                if cv.getWindowProperty(win_name, cv.WND_PROP_VISIBLE) < 1:
                    return {"tc": tc_id, "passed": None, "note": "Aborted"}
            except Exception:
                return {"tc": tc_id, "passed": None, "note": "Aborted"}

    # ── evaluate ──────────────────────────────────────────────────────────────
    total_events = short_count + long_count
    if tc_id == 1:
        passed    = total_events < 2
        criterion = "< 2 false clicks in 1 min"
        note      = f"Got {total_events} unintended clicks"
    elif tc_id == 2:
        passed    = total_events == 0
        criterion = "0 clicks from natural blinks"
        note      = f"Got {total_events} triggers"
    elif tc_id == 3:
        passed    = short_count >= 18
        criterion = ">= 18/20 short blinks detected"
        note      = f"Detected {short_count}/20"
    elif tc_id == 4:
        passed    = long_count >= 9
        criterion = ">= 9/10 long blinks detected"
        note      = f"Detected {long_count}/10"
    else:  # TC-5
        first10  = tc5_events[:10]
        second10 = tc5_events[10:]
        ok_first  = sum(1 for e in first10  if e == "SHORT")
        ok_second = sum(1 for e in second10 if e == "LONG")
        passed    = (ok_first >= 9) and (ok_second >= 9)
        criterion = ">= 9/10 correct in each phase"
        note      = (f"SHORT phase: {ok_first}/10 | LONG phase: {ok_second}/{len(second10)}")

    return {
        "tc"       : tc_id,
        "name"     : tc_name,
        "passed"   : passed,
        "criterion": criterion,
        "note"     : note,
        "short"    : short_count,
        "long"     : long_count,
    }


def show_result_screen(frame_shape, results: list[dict], win_name: str):
    h, w = frame_shape[:2]
    canvas = _make_summary_canvas(results, w, h)
    cv.imshow(win_name, canvas)
    print("\n" + "=" * 55)
    print(" PHASE 1.3 EVALUATION RESULTS")
    print("=" * 55)
    for r in results:
        status = "PASS ✓" if r.get("passed") else ("FAIL ✗" if r.get("passed") is False else "SKIP")
        tc_name_fallback = r.get('name') or f"TC-{r['tc']}"
        print(f"  [{status}] {tc_name_fallback}")
        print(f"           {r.get('note', '')}")
    print("=" * 55)
    cv.waitKey(0)


def _make_summary_canvas(results: list[dict], w: int, h: int):
    canvas = _make_dark_canvas(w, h)
    put(canvas, "PHASE 1.3 — BLINK DETECTOR EVALUATION", (20, 40), 0.75, WARN_COLOR, 2)
    put(canvas, datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"), (20, 68), 0.45, (130, 130, 130))

    y = 110
    for r in results:
        if r.get("passed") is True:
            col, mark = PASS_COLOR, "PASS"
        elif r.get("passed") is False:
            col, mark = FAIL_COLOR, "FAIL"
        else:
            col, mark = WARN_COLOR, "SKIP"
        tc_label = r.get('name') or f"TC-{r['tc']}"
        put(canvas, f"[{mark}] {tc_label}",
            (20, y), 0.6, col, 2)
        put(canvas, r.get("note", ""), (40, y + 24), 0.48, WHITE)
        put(canvas, f"Criterion: {r.get('criterion', '')}", (40, y + 44), 0.44, (160, 160, 160))
        y += 80

    put(canvas, "Press any key to close.", (20, h - 20), 0.5, (120, 120, 120))
    return canvas


def _make_dark_canvas(w, h):
    import numpy as np
    c = np.full((h, w, 3), 18, dtype="uint8")
    return c


# ── Main ───────────────────────────────────────────────────────────────────────

def parse_args():
    parser = argparse.ArgumentParser(
        description="Phase 1.3 — Blink Detector Evaluation")
    parser.add_argument(
        "--tc", default="all",
        help="Test case to run: 1 2 3 4 5 or 'all' (default: all)")
    return parser.parse_args()


def main():
    args   = parse_args()
    tc_arg = args.tc.strip().lower()

    if tc_arg == "all":
        tc_list = [1, 2, 3, 4, 5]
    else:
        tc_list = [int(x) for x in tc_arg.split()]

    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=VisionRunningMode.LIVE_STREAM,
        num_faces=1,
        result_callback=result_callback,
    )

    cap = cv.VideoCapture(0)
    if not cap.isOpened():
        print("ERROR: Cannot open webcam.")
        sys.exit(1)

    ret, frame = cap.read()
    if ret:
        frame_shape = frame.shape
        fh, fw = frame_shape[:2]
    else:
        fh, fw = 480, 640
        frame_shape = (fh, fw, 3)

    # Scale window to fit nicely — max 640px wide, keep aspect ratio
    MAX_W = 640
    scale = MAX_W / fw
    win_w = int(fw * scale)
    win_h = int(fh * scale)

    WIN = "Blink Evaluation - Phase 1.3"
    cv.namedWindow(WIN, cv.WINDOW_NORMAL | cv.WINDOW_KEEPRATIO)
    cv.resizeWindow(WIN, win_w, win_h)

    results = []
    for tc_id in tc_list:
        # fresh detector for each test case
        detector = BlinkDetector()
        r = run_tc(tc_id, cap, WIN, detector, options)
        results.append(r)

        # brief result display between tests
        if r.get("passed") is not None:
            ret2, f = cap.read()
            if ret2:
                f = cv.flip(f, 1)
                color = PASS_COLOR if r["passed"] else FAIL_COLOR
                mark  = "PASS" if r["passed"] else "FAIL"
                put(f, f"{mark}: {r.get('note', '')}", (10, 40), 0.7, color, 2)
                put(f, "Press ESC/q to quit  |  any key to continue",
                    (10, f.shape[0] - 12), 0.45, (130, 130, 130))
                cv.imshow(WIN, f)
                key = wait_key(1500)
                if _should_quit(key):
                    break

    cap.release()
    show_result_screen(frame_shape, results, WIN)
    cv.destroyAllWindows()

    # save JSON report
    report_path = os.path.join(
        ROOT, "evaluation",
        f"blink_eval_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
    with open(report_path, "w") as fp:
        json.dump(results, fp, indent=2, default=str)
    print(f"\nReport saved → {report_path}")


if __name__ == "__main__":
    main()
