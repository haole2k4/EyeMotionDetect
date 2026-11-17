"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CalibrationPanel } from "@/components/gaze/CalibrationPanel";
import { useGaze } from "@/components/gaze/GazeProvider";
import { api } from "@/lib/api";

interface ServerWeightsResponse {
  polyCoeffsX: number[] | null;
  polyCoeffsY: number[] | null;
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

const VIDEO_POSTER_DATA_URI =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 1280 720'%3E%3Crect width='1280' height='720' fill='%23F4F4F5'/%3E%3C/svg%3E";

export default function GazePage() {
  const router = useRouter();
  const { stats, startPipeline, stopPipeline, setModel } = useGaze();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [status, setStatus] = useState("Chưa bắt đầu");
  const [activeMode, setActiveMode] = useState<"fallback" | "polynomial">("fallback");
  const [cameraReady, setCameraReady] = useState(false);

  useEffect(() => {
    const loadSavedModel = async () => {
      try {
        const { data } = await api.get<ServerWeightsResponse>("/weights");

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
    <main className="min-h-screen bg-[#F7F7F5] text-[#0A0A0A]">
      {/* Top Settings Header */}
      <header className="border-b border-[#E4E4E7] bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#D4D4D8] bg-white px-4 py-2 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F4F4F5]"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Quay lại</span>
          </button>

          <span className="rounded-full border border-[#D4D4D8] bg-[#F4F4F5] px-3 py-1 text-xs font-semibold text-[#0A0A0A]">
            Mode: {activeMode}
          </span>
        </div>
      </header>

      <section className="mx-auto max-w-4xl space-y-6 p-6 md:py-10">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-[-0.02em] text-[#0A0A0A] md:text-3xl">
            Kiểm thử & Hiệu chuẩn Ánh mắt
          </h1>
          <p className="text-base text-[#3F3F46]">
            Bật camera để kiểm tra đường viền mắt và hiệu chuẩn mô hình 18D Huber Ridge trước khi vào phòng thi.
          </p>
          <p className="text-sm font-medium text-[#52525B]">Trạng thái: {status}</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void startCamera()}
            className="min-h-11 rounded-lg bg-[#0052FF] px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#0040CC]"
          >
            Start Eye Control
          </button>
          <button
            type="button"
            onClick={stopCamera}
            className="min-h-11 rounded-lg border-2 border-[#D4D4D8] bg-white px-6 py-2.5 text-sm font-semibold text-[#0A0A0A] transition-colors hover:bg-[#F4F4F5]"
          >
            Stop
          </button>
        </div>

        <CalibrationPanel cameraReady={cameraReady} onModelApplied={setActiveMode} />

        <div className="w-full max-w-md space-y-3 rounded-2xl border-2 border-[#D4D4D8] bg-white p-4">
          <div className="relative overflow-hidden rounded-xl border border-[#D4D4D8] bg-[#F4F4F5]">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              poster={VIDEO_POSTER_DATA_URI}
              className="aspect-video w-full object-cover"
            />
            {!cameraReady && (
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1 bg-[#F4F4F5] px-4 text-center">
                <span className="text-sm font-semibold text-[#0A0A0A]">Camera đang tắt</span>
                <span className="text-xs text-[#52525B]">Nhấn Start Eye Control để bắt đầu</span>
              </div>
            )}
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
                    stroke="#0052FF"
                    strokeWidth="0.7"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.rightEye)}
                    fill="none"
                    stroke="#0052FF"
                    strokeWidth="0.7"
                    strokeLinejoin="round"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.leftIris)}
                    fill="none"
                    stroke="#0A0A0A"
                    strokeWidth="0.65"
                  />
                  <polyline
                    points={toPolyline(stats.eyeOverlay.rightIris)}
                    fill="none"
                    stroke="#0A0A0A"
                    strokeWidth="0.65"
                  />
                </>
              )}
            </svg>
          </div>
          <p
            className={`rounded-lg border px-3 py-2 text-sm font-medium ${
              !cameraReady
                ? "border-[#D4D4D8] bg-[#F7F7F5] text-[#3F3F46]"
                : stats?.singleFaceReady === true
                  ? "border-[#16A34A] bg-[#F0FDF4] text-[#14532D]"
                  : "border-[#DC2626] bg-[#FEF2F2] text-[#7F1D1D]"
            }`}
          >
            {!cameraReady
              ? "Chưa bật camera. Nhấn Start Eye Control để kiểm tra ánh mắt."
              : stats?.singleFaceReady === true
                ? "Đang khóa 1 khuôn mặt. Eye contour đã được bật."
                : `Chỉ chấp nhận đúng 1 khuôn mặt (hiện tại: ${stats?.faceCount ?? 0}). Đã tạm khóa điều khiển chuột.`}
          </p>
        </div>

        <p className="text-sm text-[#52525B]">Gọi Debug Overlay bằng phím Ctrl+Shift+D.</p>
      </section>
    </main>
  );
}
