'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { resetCalibrationLocally } from '@/lib/gaze/storage';
import { useGaze } from '@/components/gaze/GazeProvider';
import { useRouter } from 'next/navigation';
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


export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [profile, setProfile] = useState({ username: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [gazeData, setGazeData] = useState<any>(null);
  const router = useRouter();

  const { setModel } = useGaze();

  const loadProfileAndGaze = async () => {
    try {
      const res = await api.get('/users/me');
      setProfile({ username: res.data.username || '', email: res.data.email || '' });
      const gazeRes = await api.get('/weights/me');
      setGazeData(gazeRes.data);
    } catch (error) {
      console.error('Failed to load profile', error);
    }
  };

  useEffect(() => {
    loadProfileAndGaze();
  }, []);

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
    <div className="max-w-2xl space-y-6">
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

      <Card className="shadow-sm border border-neutral-800 bg-black/20 mt-6">
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
                    {gazeData.calibrationPoints >= 50 ? (
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