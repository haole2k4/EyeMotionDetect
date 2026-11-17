'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Pencil, Plus, Search, Trash2, Accessibility, Eye, SlidersHorizontal, Volume2 } from 'lucide-react';
import { toast } from 'sonner';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export interface AccessibilityProfile {
  dominantEye: 'both' | 'left' | 'right';
  triggerMode: 'blink' | 'dwell';
  dwellTimeMs: number;
  blinkDurationMs: number;
  ttsEnabled: boolean;
  magneticStrength: number;
}

interface DashboardUser {
  id: string;
  username: string;
  email: string;
  role: string;
  calibrated: boolean;
  createdAt: string;
  accessibilityProfile?: AccessibilityProfile | null;
}

const defaultAccessibility: AccessibilityProfile = {
  dominantEye: 'both',
  triggerMode: 'dwell',
  dwellTimeMs: 1000,
  blinkDurationMs: 350,
  ttsEnabled: true,
  magneticStrength: 0.7,
};

const createUserSchema = z.object({
  username: z.string().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(50, 'Tên đăng nhập tối đa 50 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu tối thiểu 6 ký tự'),
  role: z.enum(['admin', 'user']),
});

const editUserSchema = z.object({
  username: z.string().min(3, 'Tên đăng nhập tối thiểu 3 ký tự').max(50, 'Tên đăng nhập tối đa 50 ký tự'),
  email: z.string().email('Email không hợp lệ'),
  password: z.string().min(6, 'Mật khẩu mới tối thiểu 6 ký tự').or(z.literal('')),
  role: z.enum(['admin', 'user']),
  dominantEye: z.enum(['both', 'left', 'right']),
  triggerMode: z.enum(['blink', 'dwell']),
  dwellTimeMs: z.coerce.number().min(500).max(3000),
  blinkDurationMs: z.coerce.number().min(200).max(1000),
  ttsEnabled: z.boolean(),
  magneticStrength: z.coerce.number().min(0).max(1),
});

type CreateUserFormValues = z.infer<typeof createUserSchema>;
type EditUserFormValues = z.infer<typeof editUserSchema>;

type ApiErrorShape = {
  response?: {
    data?: {
      message?: string | string[];
    };
  };
  message?: string;
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== 'object') {
    return fallback;
  }

  const maybeApiError = error as ApiErrorShape;
  const message = maybeApiError.response?.data?.message;

  if (Array.isArray(message)) {
    return message[0] ?? fallback;
  }

  if (typeof message === 'string' && message.trim()) {
    return message;
  }

  if (typeof maybeApiError.message === 'string' && maybeApiError.message.trim()) {
    return maybeApiError.message;
  }

  return fallback;
};

export default function UsersManagement() {
  const token = useAuthStore((state) => state.token);
  const queryClient = useQueryClient();

  const [searchValue, setSearchValue] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<DashboardUser | null>(null);
  const [deletingUser, setDeletingUser] = useState<DashboardUser | null>(null);

  const createForm = useForm<CreateUserFormValues>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      role: 'user',
    },
  });

  const editForm = useForm<EditUserFormValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      username: '',
      email: '',
      password: '',
      role: 'user',
      dominantEye: 'both',
      triggerMode: 'dwell',
      dwellTimeMs: 1000,
      blinkDurationMs: 350,
      ttsEnabled: true,
      magneticStrength: 0.7,
    },
  });

  const usersQuery = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await api.get<DashboardUser[]>('/users');
      return response.data;
    },
    enabled: Boolean(token),
  });

  const queryErrorMessage = usersQuery.isError
    ? getErrorMessage(usersQuery.error, 'Không thể tải danh sách người dùng. Kiểm tra backend và kết nối API.')
    : null;

  const createUserMutation = useMutation({
    mutationFn: async (payload: CreateUserFormValues) => {
      const response = await api.post('/users', payload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setIsCreateDialogOpen(false);
      createForm.reset({
        username: '',
        email: '',
        password: '',
        role: 'user',
      });
      toast.success('Đã tạo tài khoản người dùng mới.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Không thể tạo người dùng mới'));
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: EditUserFormValues;
    }) => {
      const accessibilityProfile: AccessibilityProfile = {
        dominantEye: payload.dominantEye,
        triggerMode: payload.triggerMode,
        dwellTimeMs: payload.dwellTimeMs,
        blinkDurationMs: payload.blinkDurationMs,
        ttsEnabled: payload.ttsEnabled,
        magneticStrength: payload.magneticStrength,
      };

      const updatePayload: {
        username: string;
        email: string;
        role: 'admin' | 'user';
        password?: string;
        accessibilityProfile: AccessibilityProfile;
      } = {
        username: payload.username,
        email: payload.email,
        role: payload.role,
        accessibilityProfile,
      };

      const trimmedPassword = payload.password.trim();
      if (trimmedPassword) {
        updatePayload.password = trimmedPassword;
      }

      const response = await api.put(`/users/${id}`, updatePayload);

      try {
        await api.put(`/users/${id}/accessibility`, accessibilityProfile);
      } catch (err) {
        console.warn('Direct accessibility endpoint warning:', err);
      }

      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingUser(null);
      editForm.reset();
      toast.success('Đã cập nhật thông tin và hồ sơ trợ năng.');
    },
    onError: (error: unknown) => {
      toast.error(getErrorMessage(error, 'Không thể cập nhật người dùng'));
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/users/${id}`);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setDeletingUser(null);
      toast.success('Đã xóa tài khoản người dùng.');
    },
    onError: (error: unknown) => {
      setDeletingUser(null);
      toast.error(getErrorMessage(error, 'Không thể xóa người dùng'));
    },
  });

  const filteredUsers = useMemo(() => {
    const users = usersQuery.data ?? [];
    const normalizedKeyword = searchValue.trim().toLowerCase();
    if (!normalizedKeyword) {
      return users;
    }

    return users.filter((user) => {
      const byEmail = user.email.toLowerCase().includes(normalizedKeyword);
      const byUsername = user.username.toLowerCase().includes(normalizedKeyword);
      return byEmail || byUsername;
    });
  }, [usersQuery.data, searchValue]);

  const totalUsers = usersQuery.data?.length ?? 0;

  const openEditDialog = async (user: DashboardUser) => {
    setEditingUser(user);

    let profile = user.accessibilityProfile || defaultAccessibility;
    try {
      const res = await api.get<AccessibilityProfile>(`/users/${user.id}/accessibility`);
      if (res.data) {
        profile = res.data;
      }
    } catch {
      // Use fallback profile
    }

    editForm.reset({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role === 'admin' ? 'admin' : 'user',
      dominantEye: profile.dominantEye || 'both',
      triggerMode: profile.triggerMode || 'dwell',
      dwellTimeMs: profile.dwellTimeMs || 1000,
      blinkDurationMs: profile.blinkDurationMs || 350,
      ttsEnabled: profile.ttsEnabled ?? true,
      magneticStrength: profile.magneticStrength ?? 0.7,
    });
  };

  const handleCreateUser = (values: CreateUserFormValues) => {
    createUserMutation.mutate(values);
  };

  const handleUpdateUser = (values: EditUserFormValues) => {
    if (!editingUser) {
      return;
    }

    updateUserMutation.mutate({
      id: editingUser.id,
      payload: values,
    });
  };

  const handleDeleteUser = () => {
    if (!deletingUser) {
      return;
    }

    deleteUserMutation.mutate(deletingUser.id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-[#1D1D1F]">
            Quản lý người dùng
          </h1>
          <p className="mt-1 text-sm text-[#515154]">
            Quản lý tài khoản, phân quyền và cấu hình hồ sơ trợ năng cho học viên.
          </p>
        </div>

        <Button
          type="button"
          onClick={() => setIsCreateDialogOpen(true)}
          className="h-10 px-4"
        >
          <Plus className="size-4 mr-1.5" />
          Thêm người dùng
        </Button>
      </div>

      {queryErrorMessage ? (
        <div className="rounded-2xl border border-[#FFB8B5] bg-[#FFECEB] px-4 py-3 text-sm font-medium text-[#D70015]">
          {queryErrorMessage}
        </div>
      ) : null}

      {/* Acrylic Filter Bar */}
      <div className="apple-glass flex flex-col gap-3 rounded-2xl p-4 md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#515154]" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Tìm theo tên đăng nhập hoặc email"
            className="h-10 bg-white pl-9"
          />
        </div>

        <p className="text-sm font-medium text-[#515154] tabular-nums">
          Hiển thị {filteredUsers.length}/{totalUsers} người dùng
        </p>
      </div>

      {/* Apple Grouped Table */}
      <div className="rounded-[20px] border border-black/[0.08] bg-white/95 overflow-hidden shadow-[0_2px_12px_-2px_rgba(0,0,0,0.05),0_1px_2px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.95)]">
        <Table className="w-full table-fixed">
          <TableHeader className="bg-[#F5F5F7]/80">
            <TableRow className="border-b border-black/[0.07] hover:bg-transparent">
              <TableHead className="w-[17%] px-3.5 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Email
              </TableHead>
              <TableHead className="w-[11%] px-3 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Tên đăng nhập
              </TableHead>
              <TableHead className="w-[13%] px-3 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Vai trò
              </TableHead>
              <TableHead className="w-[20%] px-3 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Cấu hình trợ năng
              </TableHead>
              <TableHead className="w-[13%] px-3 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Hiệu chuẩn
              </TableHead>
              <TableHead className="w-[10%] px-3 py-3 text-[13px] font-semibold text-[#3C3C43]">
                Ngày tham gia
              </TableHead>
              <TableHead className="w-[16%] px-3 py-3 text-right text-[13px] font-semibold text-[#3C3C43]">
                Thao tác
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usersQuery.isPending
              ? Array.from({ length: 6 }).map((_, idx) => (
                  <TableRow key={idx} className="border-b border-black/[0.06] last:border-b-0">
                    <TableCell className="px-3.5 py-3.5">
                      <Skeleton className="h-4 w-4/5" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-6 w-20 rounded-full" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <div className="space-y-1.5">
                        <Skeleton className="h-3.5 w-36" />
                        <Skeleton className="h-3.5 w-32" />
                      </div>
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-6 w-24 rounded-full" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5">
                      <Skeleton className="h-4 w-20" />
                    </TableCell>
                    <TableCell className="px-3 py-3.5 text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <Skeleton className="h-8 w-14 rounded-[10px]" />
                        <Skeleton className="h-8 w-14 rounded-[10px]" />
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              : null}

            {usersQuery.isError ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10 text-center text-sm text-[#D70015]">
                  Không thể tải dữ liệu từ máy chủ.
                </TableCell>
              </TableRow>
            ) : null}

            {usersQuery.isSuccess && filteredUsers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="px-4 py-10 text-center text-sm text-[#515154]">
                  Không tìm thấy người dùng phù hợp.
                </TableCell>
              </TableRow>
            ) : null}

            {usersQuery.isSuccess
              ? filteredUsers.map((user) => {
                  const prof = user.accessibilityProfile;
                  const triggerLabel =
                    prof?.triggerMode === 'blink'
                      ? `Nhắm mắt (${prof.blinkDurationMs || 350} ms)`
                      : `Nhìn giữ Dwell (${prof?.dwellTimeMs || 1000} ms)`;
                  const assistiveLabel = `Hút từ tính: ${Math.round((prof?.magneticStrength ?? 0.7) * 100)}% | TTS: ${prof?.ttsEnabled !== false ? 'Bật' : 'Tắt'}`;

                  return (
                    <TableRow
                      key={user.id}
                      className="border-b border-black/[0.06] last:border-b-0 hover:bg-[#F5F5F7]/65 transition-colors"
                    >
                      <TableCell className="px-3.5 py-3.5 font-medium text-[#1D1D1F]">
                        <div className="truncate" title={user.email}>
                          {user.email}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-[#3C3C43]">
                        <div className="truncate" title={user.username}>
                          {user.username}
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${
                            user.role === 'admin'
                              ? 'bg-[#E8F2FF] text-[#0066CC] border-[#BFDBFE]'
                              : 'bg-[#F2F2F7] text-[#3C3C43] border-black/[0.08]'
                          }`}
                        >
                          {user.role === 'admin' ? 'Quản trị viên' : 'Học viên'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <div className="min-w-0 flex flex-col gap-0.5 text-[13px]">
                          <div
                            className="flex items-center gap-1.5 font-medium text-[#1D1D1F] tabular-nums min-w-0"
                            title={triggerLabel}
                          >
                            <Eye className="size-3.5 shrink-0 text-[#0066CC]" />
                            <span className="truncate">{triggerLabel}</span>
                          </div>
                          <div
                            className="flex items-center gap-1.5 text-[#515154] tabular-nums min-w-0"
                            title={assistiveLabel}
                          >
                            <SlidersHorizontal className="size-3.5 shrink-0 text-[#515154]" />
                            <span className="truncate">{assistiveLabel}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="px-3 py-3.5">
                        <span
                          className={`inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold shadow-[inset_0_1px_0_rgba(255,255,255,0.65)] ${
                            user.calibrated
                              ? 'bg-[#ECFDF3] text-[#12783D] border-[#86EFAC]'
                              : 'bg-[#FFECEB] text-[#D70015] border-[#FFB8B5]'
                          }`}
                        >
                          {user.calibrated ? 'Đã thiết lập' : 'Chưa thiết lập'}
                        </span>
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-[13px] text-[#515154] tabular-nums whitespace-nowrap">
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </TableCell>
                      <TableCell className="px-3 py-3.5 text-right">
                        <div className="inline-flex items-center justify-end gap-1.5">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(user)}
                            disabled={updateUserMutation.isPending}
                            className="h-8 px-2.5"
                          >
                            <Pencil className="size-3.5 mr-1" />
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => setDeletingUser(user)}
                            disabled={deleteUserMutation.isPending}
                            className="h-8 px-2.5"
                          >
                            <Trash2 className="size-3.5 mr-1" />
                            Xóa
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              : null}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Tạo người dùng */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[#1D1D1F]">
              Thêm người dùng mới
            </DialogTitle>
            <DialogDescription className="text-sm text-[#515154]">
              Tạo tài khoản để học viên bắt đầu sử dụng hệ thống theo dõi ánh mắt.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-user-username" className="text-sm font-medium text-[#1D1D1F]">
                Tên đăng nhập
              </Label>
              <Input
                id="create-user-username"
                type="text"
                placeholder="vd: hocvien_01"
                {...createForm.register('username')}
                className={`bg-white ${
                  createForm.formState.errors.username ? 'border-[#D70015]' : ''
                }`}
              />
              {createForm.formState.errors.username ? (
                <p className="text-sm font-medium text-[#D70015]">
                  {createForm.formState.errors.username.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-email" className="text-sm font-medium text-[#1D1D1F]">
                Email
              </Label>
              <Input
                id="create-user-email"
                type="email"
                placeholder="hocvien@eyemotion.edu.vn"
                {...createForm.register('email')}
                className={`bg-white ${
                  createForm.formState.errors.email ? 'border-[#D70015]' : ''
                }`}
              />
              {createForm.formState.errors.email ? (
                <p className="text-sm font-medium text-[#D70015]">
                  {createForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-password" className="text-sm font-medium text-[#1D1D1F]">
                Mật khẩu
              </Label>
              <Input
                id="create-user-password"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                {...createForm.register('password')}
                className={`bg-white ${
                  createForm.formState.errors.password ? 'border-[#D70015]' : ''
                }`}
              />
              {createForm.formState.errors.password ? (
                <p className="text-sm font-medium text-[#D70015]">
                  {createForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-role" className="text-sm font-medium text-[#1D1D1F]">
                Vai trò
              </Label>
              <select
                id="create-user-role"
                {...createForm.register('role')}
                className="h-10 w-full rounded-xl border border-black/[0.12] bg-white px-3 text-sm text-[#1D1D1F] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-colors focus:border-[#0066CC] focus:ring-3 focus:ring-[#0066CC]/20"
              >
                <option value="user">Học viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsCreateDialogOpen(false)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={createUserMutation.isPending}
              >
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    Đang tạo...
                  </>
                ) : (
                  'Tạo người dùng'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Chỉnh sửa người dùng & Hồ sơ Trợ năng WCAG */}
      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
            editForm.reset();
          }
        }}
      >
        <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-[#1D1D1F]">
              <Accessibility className="size-5 text-[#0066CC]" />
              Chỉnh sửa người dùng & Hồ sơ trợ năng
            </DialogTitle>
            <DialogDescription className="text-sm text-[#515154]">
              Cấu hình tài khoản và thiết lập tương tác bằng cử chỉ mắt cá nhân hóa cho học viên.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(handleUpdateUser)} className="space-y-5">
            {/* Account Details */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-username" className="text-sm font-medium text-[#1D1D1F]">
                  Tên đăng nhập
                </Label>
                <Input
                  id="edit-user-username"
                  type="text"
                  {...editForm.register('username')}
                  className={`bg-white ${
                    editForm.formState.errors.username ? 'border-[#D70015]' : ''
                  }`}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-user-email" className="text-sm font-medium text-[#1D1D1F]">
                  Email
                </Label>
                <Input
                  id="edit-user-email"
                  type="email"
                  {...editForm.register('email')}
                  className={`bg-white ${
                    editForm.formState.errors.email ? 'border-[#D70015]' : ''
                  }`}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-user-password" className="text-sm font-medium text-[#1D1D1F]">
                  Mật khẩu mới (tùy chọn)
                </Label>
                <Input
                  id="edit-user-password"
                  type="password"
                  placeholder="Để trống nếu không đổi"
                  {...editForm.register('password')}
                  className="bg-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-user-role" className="text-sm font-medium text-[#1D1D1F]">
                  Vai trò
                </Label>
                <select
                  id="edit-user-role"
                  {...editForm.register('role')}
                  className="h-10 w-full rounded-xl border border-black/[0.12] bg-white px-3 text-sm text-[#1D1D1F] shadow-[inset_0_1px_2px_rgba(0,0,0,0.03)] outline-none transition-colors focus:border-[#0066CC] focus:ring-3 focus:ring-[#0066CC]/20"
                >
                  <option value="user">Học viên</option>
                  <option value="admin">Quản trị viên</option>
                </select>
              </div>
            </div>

            {/* Accessibility Profile Section */}
            <div className="rounded-2xl border border-black/[0.08] bg-[#F5F5F7]/75 p-4 space-y-4">
              <h3 className="text-sm font-semibold text-[#1D1D1F] flex items-center gap-2">
                <SlidersHorizontal className="size-4 text-[#0066CC]" />
                Cấu hình hồ sơ trợ năng (Accessibility Profile)
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-user-dominantEye"
                    className="text-xs font-semibold text-[#3C3C43]"
                  >
                    Mắt chủ đạo
                  </Label>
                  <select
                    id="edit-user-dominantEye"
                    {...editForm.register('dominantEye')}
                    className="h-10 w-full rounded-xl border border-black/[0.12] bg-white px-3 text-sm text-[#1D1D1F] outline-none focus:border-[#0066CC]"
                  >
                    <option value="both">Cả hai mắt</option>
                    <option value="left">Chỉ mắt trái</option>
                    <option value="right">Chỉ mắt phải</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <Label
                    htmlFor="edit-user-triggerMode"
                    className="text-xs font-semibold text-[#3C3C43]"
                  >
                    Phương thức kích hoạt
                  </Label>
                  <select
                    id="edit-user-triggerMode"
                    {...editForm.register('triggerMode')}
                    className="h-10 w-full rounded-xl border border-black/[0.12] bg-white px-3 text-sm text-[#1D1D1F] outline-none focus:border-[#0066CC]"
                  >
                    <option value="dwell">Nhìn giữ Dwell-time</option>
                    <option value="blink">Nhắm mắt chủ đích</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <Label
                      htmlFor="edit-user-dwellTimeMs"
                      className="font-semibold text-[#3C3C43]"
                    >
                      Thời gian nhìn giữ
                    </Label>
                    <span className="font-semibold tabular-nums text-[#0066CC]">
                      {editForm.watch('dwellTimeMs')} ms
                    </span>
                  </div>
                  <Input
                    id="edit-user-dwellTimeMs"
                    type="range"
                    min="500"
                    max="2000"
                    step="50"
                    {...editForm.register('dwellTimeMs')}
                    className="h-2 cursor-pointer bg-[#E5E5EA] accent-[#0066CC]"
                  />
                  <p className="text-xs text-[#515154] tabular-nums">
                    Khuyến nghị: 800 ms – 1500 ms
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <Label
                      htmlFor="edit-user-blinkDurationMs"
                      className="font-semibold text-[#3C3C43]"
                    >
                      Thời gian nhắm mắt
                    </Label>
                    <span className="font-semibold tabular-nums text-[#0066CC]">
                      {editForm.watch('blinkDurationMs')} ms
                    </span>
                  </div>
                  <Input
                    id="edit-user-blinkDurationMs"
                    type="range"
                    min="200"
                    max="800"
                    step="25"
                    {...editForm.register('blinkDurationMs')}
                    className="h-2 cursor-pointer bg-[#E5E5EA] accent-[#0066CC]"
                  />
                  <p className="text-xs text-[#515154] tabular-nums">
                    Khuyến nghị: 250 ms – 450 ms
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <Label
                      htmlFor="edit-user-magneticStrength"
                      className="font-semibold text-[#3C3C43]"
                    >
                      Lực hút con trỏ từ tính
                    </Label>
                    <span className="font-semibold tabular-nums text-[#0066CC]">
                      {Math.round(editForm.watch('magneticStrength') * 100)}%
                    </span>
                  </div>
                  <Input
                    id="edit-user-magneticStrength"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    {...editForm.register('magneticStrength')}
                    className="h-2 cursor-pointer bg-[#E5E5EA] accent-[#0066CC]"
                  />
                </div>

                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-black/[0.08] bg-white">
                  <div className="flex items-center gap-2.5">
                    <Volume2 className="size-4 text-[#0066CC]" />
                    <div>
                      <Label
                        htmlFor="edit-user-ttsEnabled"
                        className="text-xs font-semibold text-[#1D1D1F] cursor-pointer"
                      >
                        Đọc đề tự động (TTS)
                      </Label>
                      <p className="text-xs text-[#515154]">Phát âm câu hỏi vi-VN</p>
                    </div>
                  </div>
                  <input
                    id="edit-user-ttsEnabled"
                    type="checkbox"
                    {...editForm.register('ttsEnabled')}
                    className="size-4 rounded border-black/[0.2] accent-[#0066CC] cursor-pointer"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
              >
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={updateUserMutation.isPending}
              >
                {updateUserMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 mr-1.5 animate-spin" />
                    Đang lưu...
                  </>
                ) : (
                  'Lưu thay đổi'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog Xóa người dùng */}
      <AlertDialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => {
          if (!open) setDeletingUser(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#1D1D1F]">
              Xóa người dùng?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-[#515154]">
              Bạn có chắc chắn muốn xóa tài khoản{' '}
              <strong className="text-[#1D1D1F]">{deletingUser?.email}</strong>? Hành động này
              không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <AlertDialogFooter>
            <AlertDialogCancel>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteUser}
              disabled={deleteUserMutation.isPending}
              className="bg-none bg-[#D70015] text-white shadow-[0_2px_6px_rgba(215,0,21,0.28)] hover:bg-[#B80012]"
            >
              {deleteUserMutation.isPending ? 'Đang xóa...' : 'Xác nhận xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
