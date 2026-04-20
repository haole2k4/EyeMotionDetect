"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CalibrationPanel } from "@/components/gaze/CalibrationPanel";
import { useGaze } from "@/components/gaze/GazeProvider";
import { api } from "@/lib/api";
import { decodeBinaryPayloadToArrayBuffer } from "@/lib/gaze/server-weights";

interface ServerWeightsResponse {
  polyCoeffsX: number[] | null;
  polyCoeffsY: number[] | null;
  mlpWeightsJson: string | null;
  mlpWeightsBin: unknown;
  earThreshold?: number;
  calibrationPoints?: number;
}

function isFiniteNumberArray(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.every((item) => typeof item === "number" && Number.isFinite(item))
  );
}

function toPolyline(points: [number, number][]): string {
  return points.map(([x, y]) => `${(x * 100).toFixed(2)},${(y * 100).toFixed(2)}`).join(" ");
}

export default function GazePage() {
  const router = useRouter();
  const { stats, startPipeline, stopPipeline, setModel } = useGaze();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("Chưa bắt đầu");
  const [activeMode, setActiveMode] = useState<"fallback" | "polynomial" | "mlp">("fallback");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const loadSavedModel = async () => {
      try {
        const { data } = await api.get<ServerWeightsResponse>("/weights");
        const mlpWeights = decodeBinaryPayloadToArrayBuffer(data.mlpWeightsBin);
        if (typeof data.mlpWeightsJson === "string" && mlpWeights) {
          await setModel("mlp", { json: data.mlpWeightsJson, weights: mlpWeights });
          setActiveMode("mlp");
          return;
        }

        if (isFiniteNumberArray(data.polyCoeffsX) && isFiniteNumberArray(data.polyCoeffsY)) {
          const poly = { coeffsX: data.polyCoeffsX, coeffsY: data.polyCoeffsY };
          await setModel("polynomial", poly);
          setActiveMode("polynomial");
          return;
        }

        await setModel("none");
        setActiveMode("fallback");
        return;
      } catch (error) {
        console.warn("Failed to load gaze model from server", error);
      }

      await setModel("none");
      setActiveMode("fallback");
    };

    void loadSavedModel();
  }, [setModel]);

  const startCamera = useCallback(async () => {
    if (!videoRef.current) return;

    try {
      setStatus("Đang xin quyền camera...");
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
      setStatus("Đang chạy eye tracking");
      setCameraReady(true);
    } catch {
      setStatus("Không mở được camera. Hãy cấp quyền webcam cho localhost:3000");
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
    setStatus("Đã dừng");
  }, [stopPipeline]);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  return (
    <main className="min-h-screen bg-neutral-950 p-6 text-neutral-100 md:p-10">
      {/* Navbar Overlays */}
      <div className="absolute top-4 left-4 z-50">
        <button 
          onClick={() => router.back()} 
          className="flex items-center gap-2 px-4 py-2 bg-neutral-800 text-white rounded-full hover:bg-neutral-700 transition"
        >
          <ArrowLeft size={18} />
          <span>Quay lại</span>
        </button>
      </div>

      <section className="mx-auto max-w-4xl space-y-6 mt-12">
        <h1 className="text-3xl font-semibold md:text-4xl">EyeMotionDetect Phase 6</h1>
        <p className="text-neutral-300">
          Mode hiện tại: <strong>{activeMode}</strong>. Bấm Start để bật camera và điều khiển con trỏ gaze.
        </p>
        <p className="text-sm text-neutral-400">Trạng thái: {status}</p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => void startCamera()}
            className="rounded-md bg-emerald-500 px-4 py-2 font-medium text-black hover:bg-emerald-400"
          >
            Start Eye Control
          </button>
          <button
            onClick={stopCamera}
            className="rounded-md border border-neutral-700 bg-neutral-800 px-4 py-2 hover:bg-neutral-700"
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
              ? `Chỉ chấp nhận đúng 1 khuôn mặt (hiện tại: ${stats.faceCount}). Đã tạm khóa điều khiển chuột.`
              : "Đang khóa 1 khuôn mặt. Eye contour đã được bật."}
          </p>
        </div>

        <p className="text-sm text-neutral-500">Gọi Debug Overlay bằng phím Ctrl+Shift+D.</p>
      </section>
    </main>
  );
}
