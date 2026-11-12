'use client';

import { useState, useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { resetCalibrationLocally } from '@/lib/gaze/storage';
import { GAZE_WEIGHTS_UPDATED_EVENT, getLastGazeWeightsUpdateAt } from '@/lib/gaze/weights-sync';
import { useGaze } from '@/components/gaze/GazeProvider';
import { useRouter } from 'next/navigation';
import { Accessibility, Volume2, Sparkles, Eye } from 'lucide-react';
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

const defaultAccessibility: AccessibilityProfile = {
  dominantEye: 'both',
  triggerMode: 'dwell',
  dwellTimeMs: 1000,
  blinkDurationMs: 350,
  ttsEnabled: true,
  magneticStrength: 0.7,
};

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState({ username: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  const [accessMessage, setAccessMessage] = useState({ text: '', type: '' });

  // Accessibility profile state
  const [accessProfile, setAccessProfile] = useState<AccessibilityProfile>(defaultAccessibility);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gazeData, setGazeData] = useState<any>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number>(0);
  const router = useRouter();

  const rawGaze = useGaze();
  const gaze = rawGaze as unknown as ExtendedGazeContext;
  const { setModel } = gaze;

  const loadProfileAndGaze = useCallback(async () => {
    try {
      const res = await api.get('/users/me');
      setProfile({ username: res.data.username || '', email: res.data.email || '' });

      // Load accessibility profile
      try {
        const accessRes = await api.get<AccessibilityProfile>('/users/me/accessibility');
        if (accessRes.data) {
          setAccessProfile(accessRes.data);
          gaze.setAccessibilityProfile?.(accessRes.data);
        }
      } catch {
        if (res.data.accessibilityProfile) {
          setAccessProfile(res.data.accessibilityProfile);
          gaze.setAccessibilityProfile?.(res.data.accessibilityProfile);
        }
      }

      const gazeRes = await api.get('/weights/me');
      setGazeData(gazeRes.data);
      setLastSyncedAt(Date.now());
    } catch (error) {
      console.error('Failed to load profile', error);
    }
  }, [gaze]);

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
    setLoading(true);
    setMessage({ text: '', type: '' });

    if (password && password !== confirmPassword) {
      setMessage({ text: 'Mật khẩu xác nhận không khớp', type: 'error' });
      setLoading(false);
      return;
    }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = { username: profile.username, email: profile.email };
      if (password) payload.password = password;
      await api.put('/users/me', payload);
      setMessage({ text: 'Cập nhật thành công', type: 'success' });
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error(error);
      setMessage({ text: 'Cập nhật thất bại', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveAccessibility = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccessLoading(true);
    setAccessMessage({ text: '', type: '' });

    try {
      const res = await api.put<AccessibilityProfile>('/users/me/accessibility', accessProfile);
      setAccessMessage({ text: 'Đã lưu cấu hình trợ năng thành công', type: 'success' });
      gaze.setAccessibilityProfile?.(res.data || accessProfile);
    } catch (error) {
      console.error('Failed to save accessibility settings', error);
      setAccessMessage({ text: 'Không thể lưu cấu hình trợ năng', type: 'error' });
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
      setMessage({ text: 'Xóa dữ liệu mắt thành công', type: 'success' });
    } catch (err) {
      console.error('Failed to clear gaze data', err);
      setMessage({ text: 'Có lỗi xảy ra khi xóa dữ liệu mắt', type: 'error' });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Thông tin Cá Nhân */}
      <Card className="shadow-sm border border-neutral-800 bg-black/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Thông Tin Cá Nhân</CardTitle>
        </CardHeader>
        <CardContent>
          {message.text && (
            <div className={`p-3 mb-4 rounded-md text-sm ${message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {message.text}
            </div>
          )}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Họ và tên</Label>
              <Input 
                id="username" 
                value={profile.username} 
                onChange={(e) => setProfile({ ...profile, username: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                value={profile.email} 
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu mới (Để trống nếu không đổi)</Label>
              <Input 
                id="password" 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Xác nhận mật khẩu mới</Label>
              <Input 
                id="confirmPassword" 
                type="password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="********"
              />
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu Thay Đổi'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Cấu hình Trợ Năng Cá Nhân (Accessibility Profile) */}
      <Card className="shadow-sm border border-cyan-500/30 bg-cyan-950/10">
        <CardHeader>
          <CardTitle className="text-xl font-bold flex items-center gap-2 text-cyan-300">
            <Accessibility className="size-5 text-cyan-400" />
            Hồ Sơ Trợ Năng Cá Nhân (Accessibility Profile)
          </CardTitle>
          <CardDescription>
            Tùy biến phương thức điều khiển bằng cử chỉ mắt, thời gian nhìn giữ (Dwell), nhắm mắt và giọng đọc đề thi.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accessMessage.text && (
            <div className={`p-3 mb-4 rounded-md text-sm ${accessMessage.type === 'success' ? 'bg-emerald-950 border border-emerald-500 text-emerald-200' : 'bg-rose-950 border border-rose-500 text-rose-200'}`}>
              {accessMessage.text}
            </div>
          )}

          <form onSubmit={handleSaveAccessibility} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dominant Eye */}
              <div className="space-y-2">
                <Label htmlFor="settings-dominantEye" className="font-semibold flex items-center gap-1.5">
                  <Eye className="size-4 text-cyan-400" />
                  Mắt chủ đạo (Dominant Eye)
                </Label>
                <select
                  id="settings-dominantEye"
                  value={accessProfile.dominantEye}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      dominantEye: e.target.value as 'both' | 'left' | 'right',
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="both">Cả hai mắt (Khuyến nghị)</option>
                  <option value="left">Chỉ mắt trái (Left Eye Only)</option>
                  <option value="right">Chỉ mắt phải (Right Eye Only)</option>
                </select>
              </div>

              {/* Trigger Mode */}
              <div className="space-y-2">
                <Label htmlFor="settings-triggerMode" className="font-semibold flex items-center gap-1.5">
                  <Sparkles className="size-4 text-amber-400" />
                  Phương thức kích hoạt (Trigger Mode)
                </Label>
                <select
                  id="settings-triggerMode"
                  value={accessProfile.triggerMode}
                  onChange={(e) =>
                    setAccessProfile({
                      ...accessProfile,
                      triggerMode: e.target.value as 'blink' | 'dwell',
                    })
                  }
                  className="h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-cyan-500"
                >
                  <option value="dwell">Nhìn giữ Dwell-time (Tiêu chuẩn)</option>
                  <option value="blink">Nhắm mắt chủ đích (Intentional Blink)</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Dwell Time */}
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex justify-between items-center text-sm">
                  <Label htmlFor="settings-dwellTime" className="font-semibold">
                    Thời gian nhìn giữ (Dwell Time)
                  </Label>
                  <span className="font-mono font-bold text-cyan-400">
                    {accessProfile.dwellTimeMs} ms
                  </span>
                </div>
                <Input
                  id="settings-dwellTime"
                  type="range"
                  min="600"
                  max="1800"
                  step="50"
                  value={accessProfile.dwellTimeMs}
                  onChange={(e) =>
                    setAccessProfile({ ...accessProfile, dwellTimeMs: Number(e.target.value) })
                  }
                  className="h-2 cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">Thời gian mắt tập trung vào nút để kích hoạt</p>
              </div>

              {/* Blink Duration */}
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex justify-between items-center text-sm">
                  <Label htmlFor="settings-blinkDuration" className="font-semibold">
                    Thời gian nhắm mắt (Blink Duration)
                  </Label>
                  <span className="font-mono font-bold text-cyan-400">
                    {accessProfile.blinkDurationMs} ms
                  </span>
                </div>
                <Input
                  id="settings-blinkDuration"
                  type="range"
                  min="250"
                  max="650"
                  step="25"
                  value={accessProfile.blinkDurationMs}
                  onChange={(e) =>
                    setAccessProfile({ ...accessProfile, blinkDurationMs: Number(e.target.value) })
                  }
                  className="h-2 cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">Khoảng thời gian nhắm mắt để phân biệt nháy mắt tự nhiên</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Magnetic Strength */}
              <div className="space-y-2 rounded-xl border border-border bg-card p-3">
                <div className="flex justify-between items-center text-sm">
                  <Label htmlFor="settings-magnetic" className="font-semibold">
                    Lực hút con trỏ từ tính (Magnetic Snap)
                  </Label>
                  <span className="font-mono font-bold text-cyan-400">
                    {Math.round(accessProfile.magneticStrength * 100)}%
                  </span>
                </div>
                <Input
                  id="settings-magnetic"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={accessProfile.magneticStrength}
                  onChange={(e) =>
                    setAccessProfile({ ...accessProfile, magneticStrength: Number(e.target.value) })
                  }
                  className="h-2 cursor-pointer"
                />
                <p className="text-xs text-muted-foreground">Tự động kéo con trỏ vào ô đáp án gần nhất</p>
              </div>

              {/* TTS Toggle */}
              <div className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-3">
                  <Volume2 className="size-5 text-cyan-400" />
                  <div>
                    <Label htmlFor="settings-tts" className="font-semibold cursor-pointer">
                      Đọc đề tự động (TTS vi-VN)
                    </Label>
                    <p className="text-xs text-muted-foreground">Phát âm câu hỏi khi chuyển câu</p>
                  </div>
                </div>
                <input
                  id="settings-tts"
                  type="checkbox"
                  checked={accessProfile.ttsEnabled}
                  onChange={(e) =>
                    setAccessProfile({ ...accessProfile, ttsEnabled: e.target.checked })
                  }
                  className="size-5 rounded border-gray-300 text-cyan-500 focus:ring-cyan-400 cursor-pointer"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={accessLoading}
              className="bg-cyan-600 hover:bg-cyan-700 text-white"
            >
              {accessLoading ? 'Đang lưu...' : 'Lưu Cấu Hình Trợ Năng'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Dữ liệu Điều khiển mắt */}
      <Card className="shadow-sm border border-neutral-800 bg-black/20">
        <CardHeader>
          <CardTitle className="text-xl font-bold">Dữ liệu Điều khiển mắt</CardTitle>
          <CardDescription>
            Quản lý thông tin hiệu chỉnh calibration giúp mô hình AI theo dõi mắt chính xác hơn.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!gazeData ? (
            <div className="animate-pulse space-y-4">
              <div className="h-6 bg-neutral-800 rounded w-1/2"></div>
              <div className="h-6 bg-neutral-800 rounded w-1/3"></div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-neutral-800 bg-neutral-900/30 rounded-lg space-y-1">
                  <p className="text-sm text-neutral-400">Trạng thái mô hình</p>
                  <div className="text-lg font-semibold flex items-center gap-2">
                    {gazeData.calibrationPoints >= 45 ? (
                      <Badge variant="success">MLP Personalized Mode</Badge>
                    ) : gazeData.calibrationPoints > 0 ? (
                      <Badge variant="secondary">Polynomial Quick Mode</Badge>
                    ) : (
                      <Badge variant="outline">Chưa hiệu chỉnh</Badge>
                    )}
                  </div>
                </div>
                <div className="p-4 border border-neutral-800 bg-neutral-900/30 rounded-lg space-y-1">
                  <p className="text-sm text-neutral-400">Độ lệch (MAE)</p>
                  <div className="text-lg font-semibold flex items-center gap-2">
                    {gazeData.lastMaePixels !== null ? (
                      gazeData.lastMaePixels < 60 ? (
                        <Badge variant="success">{gazeData.lastMaePixels.toFixed(2)} px</Badge>
                      ) : gazeData.lastMaePixels < 90 ? (
                        <Badge variant="warning">{gazeData.lastMaePixels.toFixed(2)} px</Badge>
                      ) : (
                        <Badge variant="destructive">{gazeData.lastMaePixels.toFixed(2)} px</Badge>
                      )
                    ) : (
                      "Chưa có"
                    )}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 border border-neutral-800 bg-neutral-900/30 rounded-lg space-y-1">
                  <p className="text-sm text-neutral-400">Điểm huấn luyện</p>
                  <p className="text-lg font-semibold">{gazeData.calibrationPoints}</p>
                </div>
                <div className="p-4 border border-neutral-800 bg-neutral-900/30 rounded-lg space-y-1">
                  <p className="text-sm text-neutral-400">Ngưỡng EAR (Nháy mắt)</p>
                  <p className="text-lg font-semibold">{gazeData.earThreshold.toFixed(3)}</p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-4 pt-4">
                <Button onClick={() => router.push('/user/calibration')} className="flex-1">
                  Hiệu chỉnh lại (Recalibrate)
                </Button>
                
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex-1" disabled={isDeleting || gazeData.calibrationPoints === 0}>
                      Xóa dữ liệu (Clear Data)
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Xác nhận xóa dữ liệu hiệu chỉnh?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Bạn sẽ mất cấu hình nhận diện mắt cá nhân hóa này và hệ thống sẽ quay về thiết lập gốc.
                        Hành động này không thể hoàn tác nhưng bạn có thể chạy hiệu chỉnh mới sau này.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Hủy</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={handleClearGazeData}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Chắc chắn xóa
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
