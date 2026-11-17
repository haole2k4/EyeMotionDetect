'use client';

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardHeader, CardContent, CardDescription } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const loginSchema = z.object({
  email: z.string().email('Địa chỉ email không hợp lệ'),
  password: z.string().min(1, 'Vui lòng nhập mật khẩu'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const setAuth = useAuthStore((state) => state.setAuth);
  const [error, setError] = useState('');

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormValues) => {
      const res = await api.post('/auth/login', data);
      return res.data;
    },
    onSuccess: (data) => {
      setAuth(data.access_token, data.user);
      toast.success('Đăng nhập thành công');
      if (data.user.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/user/dashboard');
      }
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'response' in err) {
        const axiosError = err as { response?: { data?: { message?: string } } };
        setError(
          axiosError.response?.data?.message ||
            'Đăng nhập thất bại. Vui lòng kiểm tra lại email và mật khẩu.',
        );
      } else {
        setError('Đăng nhập thất bại. Vui lòng thử lại.');
      }
    },
  });

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (data: LoginFormValues) => {
    setError('');
    loginMutation.mutate(data);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-transparent px-4 py-10 text-[#1D1D1F]">
      <Card className="apple-glass-modal w-full max-w-[440px] rounded-[24px] p-2 ring-0">
        <CardHeader className="space-y-3 px-6 pt-6 pb-2 text-left">
          <div className="flex items-center gap-2.5">
            <svg
              aria-hidden="true"
              viewBox="0 0 28 28"
              className="size-7 shrink-0 text-[#0066CC]"
              fill="none"
            >
              <circle cx="14" cy="14" r="12" stroke="currentColor" strokeWidth="2.25" />
              <circle cx="14" cy="14" r="4.5" fill="currentColor" />
            </svg>
            <span className="text-base font-semibold tracking-[-0.01em] text-[#1D1D1F]">
              EyeMotionDetect
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-[-0.02em] text-[#1D1D1F]">
            Đăng nhập EyeMotionDetect
          </h1>
          <CardDescription className="text-base leading-relaxed text-[#3C3C43]">
            Nhập tài khoản học viên hoặc quản trị để vào hệ thống thi điều khiển bằng mắt
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pt-4 pb-6">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5" noValidate>
            {error && (
              <div
                role="alert"
                className="rounded-xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015]"
              >
                {error}
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-semibold text-[#1D1D1F]">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="hocvien@eyemotion.edu.vn"
                aria-invalid={Boolean(errors.email)}
                {...register('email')}
                className={`h-12 rounded-xl px-4 text-base md:text-base ${
                  errors.email
                    ? 'border-[#D70015] focus-visible:border-[#D70015]'
                    : ''
                }`}
              />
              {errors.email && (
                <p role="alert" className="text-sm font-medium text-[#D70015]">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-sm font-semibold text-[#1D1D1F]">
                Mật khẩu
              </Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                aria-invalid={Boolean(errors.password)}
                {...register('password')}
                className={`h-12 rounded-xl px-4 text-base md:text-base ${
                  errors.password
                    ? 'border-[#D70015] focus-visible:border-[#D70015]'
                    : ''
                }`}
              />
              {errors.password && (
                <p role="alert" className="text-sm font-medium text-[#D70015]">
                  {errors.password.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              size="lg"
              className="mt-2 h-12 w-full rounded-[14px] text-base font-semibold"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
