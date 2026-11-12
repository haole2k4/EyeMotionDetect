"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertCircle, Loader2, Search, Flame, Eye } from "lucide-react";
import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ErrorBoundary, FallbackProps } from "react-error-boundary";

interface GazeDataRecord {
  id: string;
  userId: string;
  userEmail: string;
  earThreshold: number;
  calibrationPoints: number;
  lastMaePixels: number | null;
  updatedAt: string;
}

interface PaginatedResponse {
  data: GazeDataRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

interface GazeHeatmapPoint {
  x: number;
  y: number;
  t: number;
  qIdx?: number;
}

interface SessionHeatmapResponse {
  sessionId: string;
  userEmail: string;
  examTitle: string;
  faceLossPauseCount: number;
  pointCount: number;
  gazeHeatmap: GazeHeatmapPoint[];
}

function GazeHeatmapCanvas({
  points,
  faceLossPauseCount,
}: {
  points: GazeHeatmapPoint[];
  faceLossPauseCount: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Draw base 16:9 dark room background
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#090d16";
    ctx.fillRect(0, 0, w, h);

    // 2. Draw MCQ 3x3 Mock Wireframe Layout
    ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
    ctx.lineWidth = 1.5;

    // Center Deadzone (Question Area)
    const qW = w * 0.38;
    const qH = h * 0.44;
    const qX = (w - qW) / 2;
    const qY = (h - qH) / 2;
    ctx.fillStyle = "rgba(15, 23, 42, 0.7)";
    ctx.fillRect(qX, qY, qW, qH);
    ctx.strokeRect(qX, qY, qW, qH);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "bold 13px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("VÙNG CÂU HỎI TRUNG TÂM", w / 2, h / 2);

    // 4 Corner Answer Cards (A, B, C, D)
    const cardW = w * 0.26;
    const cardH = h * 0.28;
    const pad = 24;

    const corners = [
      { key: "A", x: pad, y: pad, label: "ĐÁP ÁN A (Góc trên-trái)" },
      { key: "B", x: w - pad - cardW, y: pad, label: "ĐÁP ÁN B (Góc trên-phải)" },
      { key: "C", x: pad, y: h - pad - cardH, label: "ĐÁP ÁN C (Góc dưới-trái)" },
      { key: "D", x: w - pad - cardW, y: h - pad - cardH, label: "ĐÁP ÁN D (Góc dưới-phải)" },
    ];

    corners.forEach((c) => {
      ctx.fillStyle = "rgba(30, 41, 59, 0.5)";
      ctx.fillRect(c.x, c.y, cardW, cardH);
      ctx.strokeRect(c.x, c.y, cardW, cardH);
      ctx.fillStyle = "#cbd5e1";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(c.label, c.x + cardW / 2, c.y + cardH / 2);
    });

    // 3. Render Heatmap Gaussians
    if (points.length === 0) {
      // Mock demo heatmap data if session has no points yet
      ctx.fillStyle = "rgba(148, 163, 184, 0.6)";
      ctx.font = "italic 14px sans-serif";
      ctx.fillText("Chưa có đủ điểm ánh nhìn cho phiên thi này.", w / 2, h / 2 + 30);
      return;
    }

    ctx.globalCompositeOperation = "screen";

    points.forEach((p) => {
      const cx = p.x * w;
      const cy = p.y * h;
      const radius = 38;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, "rgba(239, 68, 68, 0.5)"); // Red hot center
      gradient.addColorStop(0.35, "rgba(245, 158, 11, 0.35)"); // Warm Amber
      gradient.addColorStop(0.7, "rgba(34, 197, 94, 0.2)"); // Green halo
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = "source-over";
  }, [points]);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border-2 border-slate-700 bg-[#090d16] shadow-2xl">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Tổng điểm ánh nhìn</p>
          <p className="text-xl font-black text-cyan-400">{points.length}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Tạm dừng do mất mặt</p>
          <p className="text-xl font-black text-rose-400">{faceLossPauseCount} lần</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 text-center">
          <p className="text-xs text-muted-foreground">Tần số quét dữ liệu</p>
          <p className="text-xl font-black text-emerald-400">4 Hz (250ms)</p>
        </div>
      </div>
    </div>
  );
}

function GazeDataTable() {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState("");
  const [showOnlyUncalibrated, setShowOnlyUncalibrated] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionInput, setSessionInput] = useState("");
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<PaginatedResponse>({
    queryKey: ["adminGazeData", page],
    queryFn: async () => {
      const res = await api.get(`/admin/gaze-data?page=${page}&limit=${limit}`);
      return res.data;
    },
  });

  const heatmapQuery = useQuery<SessionHeatmapResponse>({
    queryKey: ["sessionHeatmap", selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) throw new Error("No session ID");
      const res = await api.get(`/exams/sessions/${selectedSessionId}/heatmap`);
      return res.data;
    },
    enabled: Boolean(selectedSessionId),
  });

  const deleteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/admin/gaze-data/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adminGazeData"] });
      alert("Đã xóa dữ liệu thành công");
    },
    onError: (err) => {
      console.error(err);
      alert("Lỗi khi xóa dữ liệu");
    },
  });

  if (isError) {
    throw error;
  }

  const records = useMemo(() => data?.data ?? [], [data?.data]);
  const filteredRecords = useMemo(() => {
    const keyword = searchValue.trim().toLowerCase();

    return records.filter((record) => {
      const matchedSearch = !keyword || record.userEmail.toLowerCase().includes(keyword);
      const matchedCalibration = !showOnlyUncalibrated || record.calibrationPoints === 0;
      return matchedSearch && matchedCalibration;
    });
  }, [records, searchValue, showOnlyUncalibrated]);

  return (
    <div className="space-y-6">
      {/* Quick Heatmap Inspector Card */}
      <Card className="rounded-2xl border border-cyan-500/30 bg-cyan-950/15 p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-base font-bold text-foreground flex items-center gap-2">
              <Flame className="size-5 text-amber-500" />
              Tra cứu Bản đồ nhiệt Ánh mắt (Gaze Heatmap Viewer)
            </h3>
            <p className="text-xs text-muted-foreground">
              Nhập mã phiên thi (Session ID) để trực quan hóa mật độ tập trung ánh nhìn 16:9 của thí sinh.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Input
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              placeholder="Nhập mã phiên thi (Session ID)..."
              className="h-9 w-64 md:w-80 rounded-xl"
            />
            <Button
              size="sm"
              onClick={() => {
                const trimmed = sessionInput.trim();
                if (trimmed) setSelectedSessionId(trimmed);
              }}
              className="h-9 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white gap-1.5"
            >
              <Eye className="size-4" />
              Xem Heatmap
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Tìm theo email người dùng"
            className="h-10 rounded-xl border-gray-200 pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant={showOnlyUncalibrated ? "default" : "outline"}
            size="sm"
            onClick={() => setShowOnlyUncalibrated((prev) => !prev)}
            className="rounded-lg"
          >
            {showOnlyUncalibrated ? "Đang lọc: Chưa hiệu chỉnh" : "Lọc: Chưa hiệu chỉnh"}
          </Button>
          <p className="text-sm font-medium text-muted-foreground">
            Hiển thị {filteredRecords.length}/{records.length} bản ghi
          </p>
        </div>
      </div>

      <Card className="rounded-2xl border border-border bg-card shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-border bg-muted/30 text-muted-foreground">
              <tr>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Trạng thái</th>
                <th className="px-6 py-4 font-semibold">Điểm Calib</th>
                <th className="px-6 py-4 font-semibold">MAE (px)</th>
                <th className="px-6 py-4 font-semibold">EAR Ngưỡng</th>
                <th className="px-6 py-4 font-semibold">Cập nhật cuối</th>
                <th className="px-6 py-4 font-semibold">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Đang tải dữ liệu calibration...
                    </span>
                  </td>
                </tr>
              ) : null}

              {!isLoading && filteredRecords.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-sm text-gray-500">
                    Không có dữ liệu phù hợp.
                  </td>
                </tr>
              ) : null}

              {!isLoading
                ? filteredRecords.map((record) => (
                    <tr key={record.id} className="hover:bg-blue-50/30">
                      <td className="px-6 py-4 font-semibold text-foreground">{record.userEmail}</td>
                      <td className="px-6 py-4">
                        {record.calibrationPoints > 0 ? (
                          <Badge variant="success">Đã hiệu chỉnh</Badge>
                        ) : (
                          <Badge variant="secondary">Chưa hiệu chỉnh</Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 text-foreground">{record.calibrationPoints}</td>
                      <td className="px-6 py-4">
                        {record.lastMaePixels !== null ? (
                          record.lastMaePixels < 60 ? (
                            <span className="text-emerald-400 font-medium">{record.lastMaePixels.toFixed(2)} px</span>
                          ) : record.lastMaePixels < 90 ? (
                            <span className="text-amber-400 font-medium">{record.lastMaePixels.toFixed(2)} px</span>
                          ) : (
                            <span className="text-red-400 font-medium">{record.lastMaePixels.toFixed(2)} px</span>
                          )
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-foreground">{record.earThreshold.toFixed(3)}</td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {new Date(record.updatedAt).toLocaleDateString("vi-VN", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </td>
                      <td className="px-6 py-4">
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm" disabled={deleteMutation.isPending} className="rounded-lg">
                              <Trash2 className="size-3.5" />
                              Reset
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Xóa dữ liệu hiệu chỉnh?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Bạn có chắc chắn muốn xóa toàn bộ dữ liệu điều khiển mắt của user <strong>{record.userEmail}</strong>?
                                Hành động này không thể hoàn tác.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Hủy</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => deleteMutation.mutate(record.userId)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Xóa ngay
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </td>
                    </tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Heatmap Viewer Dialog */}
      <Dialog open={Boolean(selectedSessionId)} onOpenChange={(open) => !open && setSelectedSessionId(null)}>
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Flame className="size-5 text-rose-500" />
              Phân tích Bản đồ nhiệt Ánh mắt (Gaze Heatmap Viewer)
            </DialogTitle>
            <DialogDescription>
              Phiên thi: <strong>{selectedSessionId}</strong> {heatmapQuery.data ? `| ${heatmapQuery.data.examTitle} (${heatmapQuery.data.userEmail})` : ''}
            </DialogDescription>
          </DialogHeader>

          {heatmapQuery.isLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="size-8 animate-spin text-cyan-400" />
            </div>
          ) : heatmapQuery.isError ? (
            <div className="rounded-xl border border-rose-500/30 bg-rose-950/20 p-6 text-center text-rose-400">
              Không thể tải dữ liệu Heatmap cho phiên thi này hoặc phiên thi chưa có dữ liệu telemetry.
            </div>
          ) : heatmapQuery.data ? (
            <GazeHeatmapCanvas
              points={heatmapQuery.data.gazeHeatmap || []}
              faceLossPauseCount={heatmapQuery.data.faceLossPauseCount || 0}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Trước
          </Button>
          <span className="text-sm text-muted-foreground pointer-events-none">
            Trang {page} / {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
          >
            Sau
          </Button>
        </div>
      )}
    </div>
  );
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-6 text-center">
      <AlertCircle className="mx-auto mb-3 h-6 w-6 text-rose-600" />
      <h2 className="text-base font-semibold text-rose-700">Lỗi tải dữ liệu</h2>
      <p className="mt-1 text-sm text-rose-600">{error instanceof Error ? error.message : String(error)}</p>
      <Button variant="outline" onClick={resetErrorBoundary}>
        Thử lại
      </Button>
    </div>
  );
}

export default function GazeData() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Quản lý Dữ liệu mắt & Bản đồ nhiệt</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Theo dõi độ chính xác MAE, quản lý dữ liệu calibration và phân tích Heatmap quang trắc mắt của thí sinh.
        </p>
      </div>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GazeDataTable />
      </ErrorBoundary>
    </motion.div>
  );
}
