"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CalibrationPanel } from "../components/gaze/CalibrationPanel";
import { useGaze } from "../components/gaze/GazeProvider";
import { getCalibrationLocally } from "../lib/gaze/storage";

function toPolyline(points: [number, number][]): string {
  return points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(" ");
}

export default function Home() {
  const { stats, startPipeline, stopPipeline, setModel } = useGaze();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("Chua bat dau");
  const [activeMode, setActiveMode] = useState<"fallback" | "polynomial" | "mlp">("fallback");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const loadSavedModel = async () => {
      const stored = await getCalibrationLocally();
      if (!stored) {
        setActiveMode("fallback");
        return;
      }

      if (stored.activeModel === "polynomial" && stored.polyCoeffs) {
        await setModel("polynomial", stored.polyCoeffs);
        setActiveMode("polynomial");
        return;
      }

      if (stored.activeModel === "mlp" && stored.mlpModel) {
        await setModel("mlp", stored.mlpModel);
        setActiveMode("mlp");
        return;
      }

      setActiveMode("fallback");
    };

    void loadSavedModel();
  }, [setModel]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      setStatus("Dang xin quyen camera...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();

      startPipeline(videoRef.current);
      setStatus("Dang chay eye tracking");
      setCameraReady(true);
    } catch {
      setStatus("Khong mo duoc camera. Hay cap quyen webcam cho localhost:3000");
      setCameraReady(false);
    }
  }, [startPipeline]);

  const stopCamera = useCallback(() => {
    stopPipeline();
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraReady(false);
    setStatus("Da dung");
  }, [stopPipeline]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10">
      <section className="mx-auto max-w-4xl space-y-6">
        <h1 className="text-3xl md:text-4xl font-semibold">EyeMotionDetect Phase 6</h1>
        <p className="text-neutral-300">
          Mode hien tai: <strong>{activeMode}</strong>. Bam Start de bat camera va dieu khien con tro gaze.
        </p>
        <p className="text-sm text-neutral-400">Trang thai: {status}</p>

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => void startCamera()}
            className="px-4 py-2 rounded-md bg-emerald-500 text-black font-medium hover:bg-emerald-400"
          >
            Start Eye Control
          </button>
          <button
            onClick={stopCamera}
            className="px-4 py-2 rounded-md bg-neutral-800 border border-neutral-700 hover:bg-neutral-700"
          >
            Stop
          </button>
        </div>

        <CalibrationPanel cameraReady={cameraReady} onModelApplied={setActiveMode} />

        <div className="w-full max-w-md space-y-2">
          <div className="relative">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full rounded-xl border border-neutral-800 bg-black"
            />
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
            >
              {stats?.eyeOverlay && (
                <>
                  <polyline
                    points={toPolyline(stats.eyeOverlay.leftEye)}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="0.65"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.rightEye)}
                    fill="none"
                    stroke="#38bdf8"
                    strokeWidth="0.65"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.leftIris)}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="0.6"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.rightIris)}
                    fill="none"
                    stroke="#22d3ee"
                    strokeWidth="0.6"
                  />
                </>
              )}
            </svg>
          </div>
          <p className={`text-sm ${stats?.singleFaceReady === false ? "text-amber-300" : "text-emerald-300"}`}>
            {stats?.singleFaceReady === false
              ? `Chi chap nhan dung 1 khuon mat (hien tai: ${stats.faceCount}). Da tam khoa dieu khien chuot.`
              : "Dang khoa 1 khuon mat. Eye contour da duoc bat."}
          </p>
        </div>

        <p className="text-sm text-neutral-500">
          Goi Debug Overlay bang phim Ctrl+Shift+D.
        </p>
      </section>
    </main>
  );
}
