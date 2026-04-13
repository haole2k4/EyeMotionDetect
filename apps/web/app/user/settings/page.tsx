'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

export default function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({ username: '', email: '' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    async function loadProfile() {
      try {
        const res = await api.get('/users/me');
        setProfile({ username: res.data.username || '', email: res.data.email || '' });
      } catch (error) {
        console.error('Failed to load profile', error);
      }
    }
    loadProfile();
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

  return (
    <div className="max-w-2xl">
      <Card className="shadow-sm border border-slate-200">
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
    </div>
  );
}