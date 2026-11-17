'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Accessibility, Eye, Sparkles, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardDescription,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { resetCalibrationLocally } from '@/lib/gaze/storage';
import {
  GAZE_WEIGHTS_UPDATED_EVENT,
  getLastGazeWeightsUpdateAt,
} from '@/lib/gaze/weights-sync';
import { useGaze } from '@/components/gaze/GazeProvider';
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
} from '@/components/ui/alert-dialog';

export interface AccessibilityProfile {
  dominantEye: 'both' | 'left' | 'right';
  triggerMode: 'blink' | 'dwell';
  dwellTimeMs: number;
  blinkDurationMs: number;
  ttsEnabled: boolean;
  magneticStrength: number;
}

interface ExtendedGazeContext {
  setModel: (modelType: 'polynomial' | 'mlp' | 'none', weights?: unknown) => Promise<void>;
  setAccessibilityProfile?: (profile: Partial<AccessibilityProfile>) => void;
  accessibilityProfile?: AccessibilityProfile;
  [key: string]: unknown;
}

interface GazeWeightsData {
  calibrationPoints: number;
  lastMaePixels: number | null;
  earThreshold?: number | null;
}

const defaultAccessibility: AccessibilityProfile = {
  dominantEye: 'both',
  triggerMode: 'dwell',
  dwellTimeMs: 1000,
  blinkDurationMs: 350,
  ttsEnabled: true,
  magneticStrength: 0.7,
};

export default function SettingsPage() {
  const [initialLoading, setInitialLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState({ username: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const [accessProfile, setAccessProfile] = useState<AccessibilityProfile>(defaultAccessibility);
  const [gazeData, setGazeData] = useState<GazeWeightsData | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const router = useRouter();

  const rawGaze = useGaze();
  const gaze = rawGaze as unknown as ExtendedGazeContext;
  const setModel = gaze.setModel;
  const setAccessibilityProfileRef = useRef(gaze.setAccessibilityProfile);
  setAccessibilityProfileRef.current = gaze.setAccessibilityProfile;

  const loadProfileAndGaze = useCallback(async () => {
    setLoadError('');
    try {
      const res = await api.get('/users/me');
      setProfile({ username: res.data.username || '', email: res.data.email || '' });

      try {
        const accessRes = await api.get<AccessibilityProfile>('/users/me/accessibility');
        if (accessRes.data) {
          setAccessProfile(accessRes.data);
          setAccessibilityProfileRef.current?.(accessRes.data);
        }
      } catch {
        if (res.data.accessibilityProfile) {
          setAccessProfile(res.data.accessibilityProfile);
          setAccessibilityProfileRef.current?.(res.data.accessibilityProfile);
        }
      }

      const gazeRes = await api.get('/weights/me');
      setGazeData(gazeRes.data);
      setLastSyncedAt(Date.now());
    } catch (error) {
      console.error('Failed to load profile', error);
      setLoadError('Không thể tải dữ liệu cài đặt từ máy chủ. Vui lòng thử lại.');
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfileAndGaze();
  }, [loadProfileAndGaze]);

  useEffect(() => {
    const refresh = () => {
      void loadProfileAndGaze();
    };

    const refreshIfNewer = () => {
      const updatedAt = getLastGazeWeightsUpdateAt();
      if (updatedAt && updatedAt > lastSyncedAt) {
        void loadProfileAndGaze();
      }
    };

    window.addEventListener('focus', refreshIfNewer);
    window.addEventListener('pageshow', refreshIfNewer);
    window.addEventListener(GAZE_WEIGHTS_UPDATED_EVENT, refresh as EventListener);

    return () => {
      window.removeEventListener('focus', refreshIfNewer);
      window.removeEventListener('pageshow', refreshIfNewer);
      window.removeEventListener(GAZE_WEIGHTS_UPDATED_EVENT, refresh as EventListener);
    };
  }, [lastSyncedAt, loadProfileAndGaze]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError('');

    if (password && password !== confirmPassword) {
      const mismatchMsg = 'Mật khẩu xác nhận không khớp';
      setPasswordError(mismatchMsg);
      toast.error(mismatchMsg);
      return;
    }

    setLoading(true);
    try {
      const payload: { username: string; email: string; password?: string } = {
        username: profile.username,
        email: profile.email,
      };
      if (password) payload.password = password;
      await api.put('/users/me', payload);
      toast.success('Đã cập nhật thông tin tài khoản');
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error(error);
      toast.error('Cập nhật thông tin tài khoản thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccessibility = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessLoading(true);

    try {
      const res = await api.put<AccessibilityProfile>('/users/me/accessibility', accessProfile);
      toast.success('Đã lưu hồ sơ trợ năng thành công');
      setAccessibilityProfileRef.current?.(res.data || accessProfile);
    } catch (error) {
      console.error('Failed to save accessibility settings', error);
      toast.error('Không thể lưu hồ sơ trợ năng');
    } finally {
      setAccessLoading(false);
    }
  };

  const handleClearGazeData = async () => {
    setIsDeleting(true);
    try {
      await api.delete('/weights/me');
      await resetCalibrationLocally();
      await setModel('none');
      await loadProfileAndGaze();
      toast.success('Đã xóa dữ liệu hiệu chuẩn mắt thành công');
    } catch (err) {
      console.error('Failed to clear gaze data', err);
      toast.error('Có lỗi xảy ra khi xóa dữ liệu hiệu chuẩn');
    } finally {
      setIsDeleting(false);
    }
  };

  const selectClassName =
    'h-11 w-full rounded-xl border border-black/[0.12] bg-white px-3.5 text-base text-[#1D1D1F] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-[border-color,box-shadow] duration-150 focus-visible:border-[#0066CC] focus-visible:ring-3 focus-visible:ring-[#0066CC]/20';
  const inputClassName = 'h-11 bg-white';

  const cardShadowClassName = 'p-0 ring-0';

  return (
    <div className="w-full space-y-8">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
          Cài đặt
        </h1>
        <p className="text-base text-[#3C3C43]">
          Tùy chỉnh hồ sơ trợ năng điều khiển bằng mắt, dữ liệu hiệu chuẩn và thông tin tài khoản.
        </p>
      </header>

      {loadError && (
        <div
          role="alert"
          className="flex flex-col justify-between gap-4 rounded-[20px] border border-[#FFB8B5] bg-[#FFECEB] p-5 text-[#D70015] shadow-[0_2px_10px_rgba(0,0,0,0.04)] sm:flex-row sm:items-center"
        >
          <p className="text-sm font-medium">{loadError}</p>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setInitialLoading(true);
              void loadProfileAndGaze();
            }}
            className="min-h-11 shrink-0 border-[#FFB8B5] bg-white px-4 text-sm font-semibold text-[#D70015] hover:bg-[#FFDAD8]"
          >
            Thử lại
          </Button>
        </div>
      )}

      {/* 1. Hồ sơ trợ năng cá nhân */}
      <Card className={cardShadowClassName}>
        <CardHeader className="border-b border-black/[0.07] bg-[#F5F5F7]/50 px-6 py-5">
          <CardTitle className="flex items-center gap-2.5 text-lg font-semibold text-[#1D1D1F]">
            <Accessibility className="size-5 text-[#0066CC]" aria-hidden="true" />
            <span>Hồ sơ trợ năng cá nhân</span>
          </CardTitle>
          <CardDescription className="text-sm text-[#3C3C43]">
            Tùy biến mắt theo dõi, phương thức kích hoạt, độ nhạy con trỏ và giọng đọc đề thi.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {initialLoading ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">Đang tải cấu hình trợ năng...</span>
              <div className="divide-y divide-black/[0.07]">
                {[0, 1].map((row) => (
                  <div
                    key={row}
                    className="grid grid-cols-1 items-center gap-3 px-6 py-5 md:grid-cols-2 md:gap-6"
                  >
                    <div className="space-y-2">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-4 w-64" />
                    </div>
                    <Skeleton className="h-11 w-full rounded-xl" />
                  </div>
                ))}
                {[0, 1, 2].map((sliderRow) => (
                  <div key={sliderRow} className="space-y-3 px-6 py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-52" />
                        <Skeleton className="h-4 w-72" />
                      </div>
                      <Skeleton className="h-5 w-16" />
                    </div>
                    <Skeleton className="h-3 w-full rounded-full" />
                  </div>
                ))}
                <div className="flex items-center justify-between gap-4 px-6 py-5">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-52" />
                    <Skeleton className="h-4 w-64" />
                  </div>
                  <Skeleton className="h-8 w-14 shrink-0 rounded-full" />
                </div>
              </div>
              <div className="flex justify-end border-t border-black/[0.07] bg-[#F5F5F7]/60 px-6 py-4">
                <Skeleton className="h-11 w-full rounded-xl sm:w-52" />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSaveAccessibility}>
              <div className="divide-y divide-black/[0.07]">
              {/* Mắt chủ đạo */}
              <div className="grid grid-cols-1 items-center gap-3 px-6 py-5 md:grid-cols-2 md:gap-6">
                <div className="space-y-1">
                  <Label
                    htmlFor="settings-dominantEye"
                    className="flex items-center gap-2 text-base font-semibold text-[#1D1D1F]"
                  >
                    <Eye className="size-4 text-[#0066CC]" aria-hidden="true" />
                    <span>Mắt chủ đạo</span>
                  </Label>
                  <p className="text-sm text-[#515154]">
                    Chọn nguồn dữ liệu mắt dùng để tính điểm nhìn
                  </p>
                </div>
                <select
                  id="settings-dominantEye"
                  value={accessProfile.dominantEye}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      dominantEye: e.target.value as 'both' | 'left' | 'right',
                    })
                  }
                  className={selectClassName}
                >
                  <option value="both">Cả hai mắt (Khuyến nghị)</option>
                  <option value="left">Chỉ mắt trái</option>
                  <option value="right">Chỉ mắt phải</option>
                </select>
              </div>

              {/* Phương thức kích hoạt */}
              <div className="grid grid-cols-1 items-center gap-3 px-6 py-5 md:grid-cols-2 md:gap-6">
                <div className="space-y-1">
                  <Label
                    htmlFor="settings-triggerMode"
                    className="flex items-center gap-2 text-base font-semibold text-[#1D1D1F]"
                  >
                    <Sparkles className="size-4 text-[#0066CC]" aria-hidden="true" />
                    <span>Phương thức kích hoạt</span>
                  </Label>
                  <p className="text-sm text-[#515154]">
                    Cách xác nhận chọn đáp án hoặc nút bấm
                  </p>
                </div>
                <select
                  id="settings-triggerMode"
                  value={accessProfile.triggerMode}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      triggerMode: e.target.value as 'blink' | 'dwell',
                    })
                  }
                  className={selectClassName}
                >
                  <option value="dwell">Nhìn giữ (Dwell-time)</option>
                  <option value="blink">Nhắm mắt chủ đích</option>
                </select>
              </div>

              {/* Thời gian nhìn giữ */}
              <div className="space-y-3 px-6 py-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="settings-dwellTime"
                      className="text-base font-semibold text-[#1D1D1F]"
                    >
                      Thời gian nhìn giữ (Dwell Time)
                    </Label>
                    <p className="text-sm text-[#515154]">
                      Thời gian mắt tập trung vào nút để kích hoạt
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-[#0066CC]">
                    {accessProfile.dwellTimeMs} ms
                  </span>
                </div>
                <input
                  id="settings-dwellTime"
                  type="range"
                  min="600"
                  max="1800"
                  step="50"
                  value={accessProfile.dwellTimeMs}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      dwellTimeMs: Number(e.target.value),
                    })
                  }
                  className="h-3 w-full cursor-pointer accent-[#0066CC]"
                />
              </div>

              {/* Thời gian nhắm mắt */}
              <div className="space-y-3 px-6 py-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="settings-blinkDuration"
                      className="text-base font-semibold text-[#1D1D1F]"
                    >
                      Thời gian nhắm mắt (Blink Duration)
                    </Label>
                    <p className="text-sm text-[#515154]">
                      Khoảng thời gian nhắm mắt để phân biệt với nháy mắt tự nhiên
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-[#0066CC]">
                    {accessProfile.blinkDurationMs} ms
                  </span>
                </div>
                <input
                  id="settings-blinkDuration"
                  type="range"
                  min="250"
                  max="650"
                  step="25"
                  value={accessProfile.blinkDurationMs}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      blinkDurationMs: Number(e.target.value),
                    })
                  }
                  className="h-3 w-full cursor-pointer accent-[#0066CC]"
                />
              </div>

              {/* Lực hút con trỏ từ tính */}
              <div className="space-y-3 px-6 py-5">
                <div className="flex items-baseline justify-between gap-4">
                  <div className="space-y-0.5">
                    <Label
                      htmlFor="settings-magnetic"
                      className="text-base font-semibold text-[#1D1D1F]"
                    >
                      Lực hút con trỏ từ tính
                    </Label>
                    <p className="text-sm text-[#515154]">
                      Tự động kéo con trỏ vào ô đáp án hoặc nút gần nhất
                    </p>
                  </div>
                  <span className="shrink-0 text-base font-semibold tabular-nums text-[#0066CC]">
                    {Math.round(accessProfile.magneticStrength * 100)}%
                  </span>
                </div>
                <input
                  id="settings-magnetic"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={accessProfile.magneticStrength}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      magneticStrength: Number(e.target.value),
                    })
                  }
                  className="h-3 w-full cursor-pointer accent-[#0066CC]"
                />
              </div>

              {/* Đọc đề tự động */}
              <div className="flex items-center justify-between gap-4 px-6 py-5">
                <div className="flex items-start gap-3">
                  <Volume2 className="mt-0.5 size-5 shrink-0 text-[#0066CC]" aria-hidden="true" />
                  <div className="space-y-0.5">
                    <Label
                      id="settings-tts-label"
                      htmlFor="settings-tts"
                      className="cursor-pointer text-base font-semibold text-[#1D1D1F]"
                    >
                      Đọc đề tự động (TTS vi-VN)
                    </Label>
                    <p className="text-sm text-[#515154]">
                      Tự động phát âm nội dung câu hỏi khi chuyển câu
                    </p>
                  </div>
                </div>
                <button
                  id="settings-tts"
                  type="button"
                  role="switch"
                  aria-checked={accessProfile.ttsEnabled}
                  aria-labelledby="settings-tts-label"
                  onClick={() =>
                    setAccessProfile({
                      ...accessProfile,
                      ttsEnabled: !accessProfile.ttsEnabled,
                    })
                  }
                  className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-1 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0066CC] focus-visible:ring-offset-2 ${
                    accessProfile.ttsEnabled ? 'bg-[#0066CC]' : 'bg-[#767680]/25'
                  }`}
                >
                  <span
                    className={`inline-block size-6 rounded-full bg-[#FFFFFF] shadow-[0_2px_4px_rgba(0,0,0,0.2)] transition-transform duration-150 ease-out ${
                      accessProfile.ttsEnabled ? 'translate-x-6' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            <div className="flex justify-end border-t border-black/[0.07] bg-[#F5F5F7]/60 px-6 py-4">
              <Button
                type="submit"
                disabled={accessLoading}
                className="min-h-11 w-full rounded-xl px-6 text-base font-semibold sm:w-auto"
              >
                {accessLoading ? 'Đang lưu...' : 'Lưu cấu hình trợ năng'}
              </Button>
            </div>
          </form>
          )}
        </CardContent>
      </Card>

      {/* 2. Dữ liệu hiệu chuẩn mắt */}
      <Card className={cardShadowClassName}>
        <CardHeader className="border-b border-black/[0.07] bg-[#F5F5F7]/50 px-6 py-5">
          <CardTitle className="text-lg font-semibold text-[#1D1D1F]">
            Dữ liệu hiệu chuẩn mắt
          </CardTitle>
          <CardDescription className="text-sm text-[#3C3C43]">
            Quản lý thông số mô hình theo dõi mắt đã lưu cho tài khoản của bạn.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6 p-6">
          {initialLoading || !gazeData ? (
            <div role="status" aria-busy="true" className="space-y-6">
              <span className="sr-only">Đang tải thông tin hiệu chuẩn mắt...</span>
              <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/40 sm:grid-cols-2">
                <div className="space-y-2.5 border-b border-black/[0.07] p-5 sm:border-r">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-7 w-40 rounded-full" />
                </div>
                <div className="space-y-2.5 border-b border-black/[0.07] p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-7 w-24 rounded-full" />
                </div>
                <div className="space-y-2 border-b border-black/[0.07] p-5 sm:border-b-0 sm:border-r">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-8 w-16" />
                </div>
                <div className="space-y-2 p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-20" />
                </div>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row">
                <Skeleton className="h-11 flex-1 rounded-xl" />
                <Skeleton className="h-11 flex-1 rounded-xl" />
              </div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 overflow-hidden rounded-2xl border border-black/[0.07] bg-[#F5F5F7]/40 sm:grid-cols-2">
                <div className="space-y-2 border-b border-black/[0.07] p-5 sm:border-r">
                  <p className="text-sm font-medium text-[#515154]">Trạng thái mô hình</p>
                  <div>
                    {gazeData.calibrationPoints >= 45 ? (
                      <Badge className="border-[#86EFAC] bg-[#ECFDF3] px-3 py-1 text-sm font-semibold text-[#12783D]">
                        Cá nhân hóa đầy đủ
                      </Badge>
                    ) : gazeData.calibrationPoints > 0 ? (
                      <Badge className="border-[#BFDBFE] bg-[#E8F2FF] px-3 py-1 text-sm font-semibold text-[#0066CC]">
                        Hiệu chỉnh nhanh
                      </Badge>
                    ) : (
                      <Badge className="border-black/[0.08] bg-[#F2F2F7] px-3 py-1 text-sm font-semibold text-[#3C3C43]">
                        Chưa hiệu chỉnh
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="space-y-2 border-b border-black/[0.07] p-5">
                  <p className="text-sm font-medium text-[#515154]">Độ lệch MAE</p>
                  <div>
                    {typeof gazeData.lastMaePixels === 'number' ? (
                      <Badge
                        className={
                          gazeData.lastMaePixels < 60
                            ? 'border-[#86EFAC] bg-[#ECFDF3] px-3 py-1 text-sm font-semibold tabular-nums text-[#12783D]'
                            : gazeData.lastMaePixels < 90
                              ? 'border-[#FCD34D] bg-[#FFF8EB] px-3 py-1 text-sm font-semibold tabular-nums text-[#9A4600]'
                              : 'border-[#FFB8B5] bg-[#FFECEB] px-3 py-1 text-sm font-semibold tabular-nums text-[#D70015]'
                        }
                      >
                        {gazeData.lastMaePixels.toFixed(2)} px
                      </Badge>
                    ) : (
                      <span className="text-xl font-semibold text-[#3C3C43]">Chưa có</span>
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 border-b border-black/[0.07] p-5 sm:border-b-0 sm:border-r">
                  <p className="text-sm font-medium text-[#515154]">Điểm huấn luyện</p>
                  <p className="text-2xl font-semibold tabular-nums text-[#1D1D1F]">
                    {gazeData.calibrationPoints}
                  </p>
                </div>

                <div className="space-y-1.5 p-5">
                  <p className="text-sm font-medium text-[#515154]">Ngưỡng EAR</p>
                  <p className="text-2xl font-semibold tabular-nums text-[#1D1D1F]">
                    {typeof gazeData.earThreshold === 'number'
                      ? gazeData.earThreshold.toFixed(3)
                      : '—'}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button
                  type="button"
                  onClick={() => router.push('/user/calibration')}
                  className="min-h-11 flex-1 rounded-xl text-base font-semibold"
                >
                  Hiệu chỉnh lại
                </Button>

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="destructive"
                      disabled={isDeleting || gazeData.calibrationPoints === 0}
                      className="min-h-11 flex-1 rounded-xl text-base font-semibold"
                    >
                      Xóa dữ liệu
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-lg font-semibold text-[#1D1D1F]">
                        Xác nhận xóa dữ liệu hiệu chuẩn?
                      </AlertDialogTitle>
                      <AlertDialogDescription className="text-base text-[#3C3C43]">
                        Bạn sẽ mất cấu hình nhận diện mắt cá nhân hóa này và hệ thống sẽ quay về thiết lập mặc định. Bạn vẫn có thể hiệu chỉnh lại bất cứ lúc nào.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter className="gap-2">
                      <AlertDialogCancel className="min-h-11 text-base font-medium">
                        Hủy
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearGazeData}
                        className="min-h-11 bg-none bg-[#D70015] text-base font-semibold text-white shadow-[0_2px_6px_rgba(215,0,21,0.28)] hover:bg-[#B80012]"
                      >
                        Chắc chắn xóa
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 3. Thông tin tài khoản */}
      <Card className={cardShadowClassName}>
        <CardHeader className="border-b border-black/[0.07] bg-[#F5F5F7]/50 px-6 py-5">
          <CardTitle className="text-lg font-semibold text-[#1D1D1F]">
            Thông tin tài khoản
          </CardTitle>
          <CardDescription className="text-sm text-[#3C3C43]">
            Cập nhật họ tên, email đăng nhập và mật khẩu của bạn.
          </CardDescription>
        </CardHeader>

        <CardContent className="p-0">
          {initialLoading ? (
            <div role="status" aria-busy="true">
              <span className="sr-only">Đang tải thông tin tài khoản...</span>
              <div className="divide-y divide-black/[0.07]">
                {[0, 1, 2, 3].map((row) => (
                  <div
                    key={row}
                    className="grid grid-cols-1 items-center gap-2 px-6 py-4 md:grid-cols-3 md:gap-6"
                  >
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="h-11 w-full rounded-xl md:col-span-2" />
                  </div>
                ))}
              </div>
              <div className="flex justify-end border-t border-black/[0.07] bg-[#F5F5F7]/60 px-6 py-4">
                <Skeleton className="h-11 w-full rounded-xl sm:w-52" />
              </div>
            </div>
          ) : (
            <form onSubmit={handleSave}>
              <div className="divide-y divide-black/[0.07]">
                <div className="grid grid-cols-1 items-center gap-2 px-6 py-4 md:grid-cols-3 md:gap-6">
                  <Label htmlFor="username" className="text-base font-semibold text-[#1D1D1F]">
                    Họ và tên
                  </Label>
                  <div className="md:col-span-2">
                    <Input
                      id="username"
                      value={profile.username}
                      onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                      required
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-2 px-6 py-4 md:grid-cols-3 md:gap-6">
                  <Label htmlFor="email" className="text-base font-semibold text-[#1D1D1F]">
                    Email
                  </Label>
                  <div className="md:col-span-2">
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                      required
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-2 px-6 py-4 md:grid-cols-3 md:gap-6">
                  <Label htmlFor="password" className="text-base font-semibold text-[#1D1D1F]">
                    Đổi mật khẩu
                  </Label>
                  <div className="md:col-span-2">
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (passwordError) setPasswordError('');
                      }}
                      placeholder="Để trống nếu không đổi"
                      className={inputClassName}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 items-center gap-2 px-6 py-4 md:grid-cols-3 md:gap-6">
                  <Label
                    htmlFor="confirmPassword"
                    className="text-base font-semibold text-[#1D1D1F]"
                  >
                    Xác nhận mật khẩu
                  </Label>
                  <div className="space-y-1.5 md:col-span-2">
                    <Input
                      id="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      value={confirmPassword}
                      aria-invalid={Boolean(passwordError)}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        if (passwordError) setPasswordError('');
                      }}
                      placeholder="Nhập lại mật khẩu mới"
                      className={
                        passwordError
                          ? `${inputClassName} border-[#D70015] focus-visible:border-[#D70015]`
                          : inputClassName
                      }
                    />
                    {passwordError && (
                      <p role="alert" className="text-sm font-medium text-[#D70015]">
                        {passwordError}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-end border-t border-black/[0.07] bg-[#F5F5F7]/60 px-6 py-4">
                <Button
                  type="submit"
                  disabled={loading}
                  className="min-h-11 w-full rounded-xl px-6 text-base font-semibold sm:w-auto"
                >
                  {loading ? 'Đang lưu...' : 'Lưu thông tin tài khoản'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
