'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, AlertCircle, Search, Flame, Eye } from 'lucide-react';
import { ErrorBoundary, FallbackProps } from 'react-error-boundary';
import { toast } from 'sonner';
import { api } from '@/lib/api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // 1. Apple Light 16:9 exam room canvas
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#F5F5F7';
    ctx.fillRect(0, 0, w, h);

    // 2. Draw MCQ wireframe layout (#FFFFFF cards with Apple separator and #1D1D1F ink)
    ctx.strokeStyle = '#D1D1D6';
    ctx.lineWidth = 1.5;

    const qW = w * 0.38;
    const qH = h * 0.44;
    const qX = (w - qW) / 2;
    const qY = (h - qH) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(qX, qY, qW, qH);
    ctx.strokeRect(qX, qY, qW, qH);

    ctx.fillStyle = '#1D1D1F';
    ctx.font = '600 13px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Vùng câu hỏi trung tâm', w / 2, h / 2);

    const cardW = w * 0.26;
    const cardH = h * 0.28;
    const pad = 24;

    const corners = [
      { x: pad, y: pad, label: 'Đáp án A (Trên-trái)' },
      { x: w - pad - cardW, y: pad, label: 'Đáp án B (Trên-phải)' },
      { x: pad, y: h - pad - cardH, label: 'Đáp án C (Dưới-trái)' },
      { x: w - pad - cardW, y: h - pad - cardH, label: 'Đáp án D (Dưới-phải)' },
    ];

    corners.forEach((c) => {
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(c.x, c.y, cardW, cardH);
      ctx.strokeRect(c.x, c.y, cardW, cardH);
      ctx.fillStyle = '#1D1D1F';
      ctx.font = '600 12px sans-serif';
      ctx.fillText(c.label, c.x + cardW / 2, c.y + cardH / 2);
    });

    // 3. Render high-contrast thermal heatmap on light ground
    if (points.length === 0) {
      ctx.fillStyle = '#515154';
      ctx.font = '400 13px sans-serif';
      ctx.fillText('Chưa có đủ điểm ánh nhìn cho phiên thi này.', w / 2, h / 2 + 26);
      return;
    }

    ctx.globalCompositeOperation = 'multiply';

    points.forEach((p) => {
      const cx = p.x * w;
      const cy = p.y * h;
      const radius = 38;

      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      gradient.addColorStop(0, 'rgba(215, 0, 21, 0.72)');
      gradient.addColorStop(0.3, 'rgba(234, 88, 12, 0.5)');
      gradient.addColorStop(0.6, 'rgba(234, 179, 8, 0.34)');
      gradient.addColorStop(0.85, 'rgba(0, 102, 204, 0.16)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
  }, [points]);

  return (
    <div className="space-y-4">
      <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-black/[0.08] bg-[#F5F5F7]">
        <canvas
          ref={canvasRef}
          width={960}
          height={540}
          className="h-full w-full object-cover"
        />
      </div>

      <div className="rounded-2xl border border-black/[0.08] bg-white/95 grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-black/[0.07]">
        <div className="px-4 py-3.5 text-center">
          <p className="text-xs font-medium text-[#515154]">Tổng điểm ánh nhìn</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#1D1D1F]">
            {points.length.toLocaleString('vi-VN')}
          </p>
        </div>
        <div className="px-4 py-3.5 text-center">
          <p className="text-xs font-medium text-[#515154]">Tạm dừng do mất mặt</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#1D1D1F]">
            {faceLossPauseCount} lần
          </p>
        </div>
        <div className="px-4 py-3.5 text-center">
          <p className="text-xs font-medium text-[#515154]">Tần số quét dữ liệu</p>
          <p className="mt-1 text-xl font-semibold tabular-nums text-[#1D1D1F]">
            4 Hz (250 ms)
          </p>
        </div>
      </div>
    </div>
  );
}

function GazeDataTable() {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState('');
  const [showOnlyUncalibrated, setShowOnlyUncalibrated] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionInput, setSessionInput] = useState('');
  const [deletingRecord, setDeletingRecord] = useState<GazeDataRecord | null>(null);

  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<PaginatedResponse>({
    queryKey: ['adminGazeData', page],
    queryFn: async () => {
      const res = await api.get(`/admin/gaze-data?page=${page}&limit=${limit}`);
      return res.data;
    },
  });

  const heatmapQuery = useQuery<SessionHeatmapResponse>({
    queryKey: ['sessionHeatmap', selectedSessionId],
    queryFn: async () => {
      if (!selectedSessionId) throw new Error('No session ID');
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
      queryClient.invalidateQueries({ queryKey: ['adminGazeData'] });
      setDeletingRecord(null);
      toast.success('Đã xóa dữ liệu hiệu chuẩn thành công.');
    },
    onError: (err) => {
      console.error(err);
      setDeletingRecord(null);
      toast.error('Lỗi khi xóa dữ liệu hiệu chuẩn. Vui lòng thử lại.');
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

  const handleOpenHeatmap = () => {
    const trimmed = sessionInput.trim();
    if (!trimmed) {
      toast.error('Vui lòng nhập mã phiên thi (Session ID).');
      return;
    }
    setSelectedSessionId(trimmed);
  };

  return (
    <div className="space-y-6">
      {/* Quick Heatmap Inspector */}
      <div className="apple-glass rounded-2xl p-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-[#1D1D1F] flex items-center gap-2">
              <Flame className="size-4 text-[#0066CC]" />
              Tra cứu bản đồ nhiệt ánh mắt
            </h2>
            <p className="text-xs text-[#515154]">
              Nhập mã phiên thi (Session ID) để xem mật độ tập trung ánh nhìn 16:9 của thí sinh.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={sessionInput}
              onChange={(e) => setSessionInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleOpenHeatmap();
                }
              }}
              placeholder="Nhập mã phiên thi (Session ID)..."
              className="h-10 w-64 md:w-80 bg-white"
            />
            <Button
              type="button"
              onClick={handleOpenHeatmap}
              className="h-10 px-4 gap-1.5"
            >
              <Eye className="size-4" />
              Xem Heatmap
            </Button>
          </div>
        </div>
      </div>

      {/* Acrylic Filter Bar */}
      <div className="apple-glass flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#515154]" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Tìm theo email người dùng"
            className="h-10 bg-white pl-9"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant={showOnlyUncalibrated ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowOnlyUncalibrated((prev) => !prev)}
          >
            {showOnlyUncalibrated ? 'Đang lọc: Chưa hiệu chỉnh' : 'Lọc: Chưa hiệu chỉnh'}
          </Button>
          <p className="text-sm font-medium text-[#515154] tabular-nums">
            Hiển thị {filteredRecords.length}/{records.length} bản ghi
          </p>
        </div>
      </div>

      {/* Apple Grouped Table */}
      <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
        <Table className="w-full table-fixed">
          <TableHeader className="bg-[#F5F5F7]/80">
            <TableRow className="border-b border-black/[0.07] hover:bg-transparent">
              <TableHead className="w-[22%] px-3.5 py-3 text-xs font-semibold text-[#3C3C43]">
                Email
              </TableHead>
              <TableHead className="w-[15%] px-3 py-3 text-xs font-semibold text-[#3C3C43]">
                Trạng thái
              </TableHead>
              <TableHead className="w-[12%] px-3 py-3 text-xs font-semibold text-[#3C3C43]">
                Điểm hiệu chuẩn
              </TableHead>
              <TableHead className="w-[12%] px-3 py-3 text-xs font-semibold text-[#3C3C43]">
                MAE (px)
              </TableHead>
              <TableHead className="w-[11%] px-3 py-3 text-xs font-semibold text-[#3C3C43]">
                EAR ngưỡng
              </TableHead>
              <TableHead className="w-[16%] px-3 py-3 text-xs font-semibold text-[#3C3C43]">
                Cập nhật cuối
              </TableHead>
              <TableHead className="w-[12%] px-3 py-3 text-right text-xs font-semibold text-[#3C3C43]">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-black/[0.06] last:border-b-0">
                    <TableCell className="px-3.5 py-3.5">
                      <Skeleton className="h-4 w-4/5" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-10" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-16" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-14" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-28" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5 text-right">
                      <Skeleton className="ml-auto h-8 w-16 rounded-[10px]" />
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {!isLoading && filteredRecords.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10 text-center text-sm text-[#515154]">
                  Không có dữ liệu phù hợp.
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading
              ? filteredRecords.map((record) => {
                  const formattedUpdatedAt = new Date(record.updatedAt).toLocaleDateString('vi-VN', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <TableRow
                      key={record.id}
                      className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                    >
                      <TableCell className="px-3.5 py-3.5 font-medium text-[#1D1D1F]">
                        <div className="truncate" title={record.userEmail}>
                          {record.userEmail}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        {record.calibrationPoints > 0 ? (
                          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[#86EFAC] bg-[#ECFDF3] px-2.5 py-0.5 text-xs font-semibold text-[#12783D] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                            Đã hiệu chỉnh
                          </span>
                        ) : (
                          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-black/[0.08] bg-[#F2F2F7] px-2.5 py-0.5 text-xs font-semibold text-[#3C3C43] shadow-[inset_0_1px_0_rgba(255,255,255,0.65)]">
                            Chưa hiệu chỉnh
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-sm text-[#1D1D1F] tabular-nums">
                        {record.calibrationPoints}
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-sm tabular-nums whitespace-nowrap">
                        {record.lastMaePixels !== null ? (
                          record.lastMaePixels < 60 ? (
                            <span className="font-semibold text-[#12783D]">
                              {record.lastMaePixels.toFixed(2)} px
                            </span>
                          ) : record.lastMaePixels < 90 ? (
                            <span className="font-semibold text-[#9A4600]">
                              {record.lastMaePixels.toFixed(2)} px
                            </span>
                          ) : (
                            <span className="font-semibold text-[#D70015]">
                              {record.lastMaePixels.toFixed(2)} px
                            </span>
                          )
                        ) : (
                          <span className="text-[#515154]">-</span>
                        )}
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-sm text-[#3C3C43] tabular-nums">
                        {record.earThreshold.toFixed(3)}
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-sm text-[#515154] tabular-nums">
                        <div className="truncate" title={formattedUpdatedAt}>
                          {formattedUpdatedAt}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-right">
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          disabled={deleteMutation.isPending}
                          onClick={() => setDeletingRecord(record)}
                          className="h-8 px-2.5"
                        >
                          <Trash2 className="size-3.5 mr-1" />
                          Reset
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>

      {/* Delete / Reset Confirmation AlertDialog */}
      <AlertDialog
        open={Boolean(deletingRecord)}
        onOpenChange={(open) => {
          if (!open) setDeletingRecord(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1D1D1F]">
              Xóa dữ liệu hiệu chỉnh?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#515154]">
              Bạn có chắc chắn muốn xóa toàn bộ dữ liệu điều khiển mắt của người dùng{' '}
              <strong className="text-[#1D1D1F]">{deletingRecord?.userEmail}</strong>? Hành động
              này không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deletingRecord) deleteMutation.mutate(deletingRecord.userId);
              }}
              disabled={deleteMutation.isPending}
              className="bg-none bg-[#D70015] text-white shadow-[0_2px_6px_rgba(215,0,21,0.28)] hover:bg-[#B80012]"
            >
              {deleteMutation.isPending ? 'Đang xóa...' : 'Xóa ngay'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Heatmap Viewer Dialog */}
      <Dialog
        open={Boolean(selectedSessionId)}
        onOpenChange={(open) => !open && setSelectedSessionId(null)}
      >
        <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#1D1D1F]">
              <Flame className="size-5 text-[#0066CC]" />
              Phân tích bản đồ nhiệt ánh mắt
            </DialogTitle>
            <DialogDescription className="text-sm text-[#515154] tabular-nums">
              Phiên thi: <strong className="text-[#1D1D1F]">{selectedSessionId}</strong>
              {heatmapQuery.data
                ? ` | ${heatmapQuery.data.examTitle} (${heatmapQuery.data.userEmail})`
                : ''}
            </DialogDescription>
          </DialogHeader>

          {heatmapQuery.isLoading ? (
            <div className="space-y-4">
              <Skeleton className="aspect-video w-full rounded-2xl" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 rounded-2xl border border-black/[0.08] p-4">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            </div>
          ) : heatmapQuery.isError ? (
            <div className="rounded-2xl border border-[#FFB8B5] bg-[#FFECEB] p-6 text-center text-sm font-medium text-[#D70015]">
              Không thể tải dữ liệu Heatmap cho phiên thi này hoặc phiên thi chưa có dữ liệu.
            </div>
          ) : heatmapQuery.data ? (
            <GazeHeatmapCanvas
              points={heatmapQuery.data.gazeHeatmap || []}
              faceLossPauseCount={heatmapQuery.data.faceLossPauseCount || 0}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      {data && data.totalPages > 1 ? (
        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            Trước
          </Button>
          <span className="text-sm text-[#515154] tabular-nums px-2">
            Trang {page} / {data.totalPages}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
          >
            Sau
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ErrorFallback({ error, resetErrorBoundary }: FallbackProps) {
  return (
    <div className="rounded-2xl border border-[#FFB8B5] bg-[#FFECEB] px-5 py-6 text-center">
      <AlertCircle className="mx-auto mb-2.5 size-6 text-[#D70015]" />
      <h2 className="text-base font-semibold text-[#D70015]">Lỗi tải dữ liệu</h2>
      <p className="mt-1 mb-4 text-sm text-[#D70015]">
        {error instanceof Error ? error.message : String(error)}
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={resetErrorBoundary}
        className="border-[#FFB8B5] bg-white text-[#D70015] hover:bg-[#FFDAD8]"
      >
        Thử lại
      </Button>
    </div>
  );
}

export default function GazeData() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
          Dữ liệu ánh mắt & Bản đồ nhiệt
        </h1>
        <p className="mt-1 text-sm text-[#515154]">
          Theo dõi độ chính xác MAE, quản lý dữ liệu hiệu chuẩn và phân tích Heatmap của thí sinh.
        </p>
      </div>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GazeDataTable />
      </ErrorBoundary>
    </div>
  );
}
