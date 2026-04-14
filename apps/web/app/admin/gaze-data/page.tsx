"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, AlertCircle, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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

function GazeDataTable() {
  const [page, setPage] = useState(1);
  const [searchValue, setSearchValue] = useState("");
  const [showOnlyUncalibrated, setShowOnlyUncalibrated] = useState(false);
  const limit = 20;
  const queryClient = useQueryClient();

  const { data, isLoading, isError, error } = useQuery<PaginatedResponse>({
    queryKey: ["adminGazeData", page],
    queryFn: async () => {
      const res = await api.get(`/admin/gaze-data?page=${page}&limit=${limit}`);
      return res.data;
    },
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
                <th className="px-6 py-4 font-semibold">Points</th>
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
                            <span className="text-emerald-400 font-medium">{record.lastMaePixels.toFixed(2)}</span>
                          ) : record.lastMaePixels < 90 ? (
                            <span className="text-amber-400 font-medium">{record.lastMaePixels.toFixed(2)}</span>
                          ) : (
                            <span className="text-red-400 font-medium">{record.lastMaePixels.toFixed(2)}</span>
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
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Quản lý Dữ liệu mắt</h1>
        <p className="mt-1 text-sm text-muted-foreground">Theo dõi và reset dữ liệu calibration của người dùng khi cần hỗ trợ.</p>
      </div>

      <ErrorBoundary FallbackComponent={ErrorFallback}>
        <GazeDataTable />
      </ErrorBoundary>
    </motion.div>
  );
}