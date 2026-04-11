'use client';

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Loader2, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

interface DashboardUser {
  id: string;
  username: string;
  email: string;
  role: string;
  calibrated: boolean;
  createdAt: string;
}

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
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'Không thể tạo người dùng mới'));
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
      const updatePayload: {
        username: string;
        email: string;
        role: 'admin' | 'user';
        password?: string;
      } = {
        username: payload.username,
        email: payload.email,
        role: payload.role,
      };

      const trimmedPassword = payload.password.trim();
      if (trimmedPassword) {
        updatePayload.password = trimmedPassword;
      }

      const response = await api.put(`/users/${id}`, updatePayload);
      return response.data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      setEditingUser(null);
      editForm.reset({
        username: '',
        email: '',
        password: '',
        role: 'user',
      });
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'Không thể cập nhật người dùng'));
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
      setErrorMessage(null);
    },
    onError: (error: unknown) => {
      setErrorMessage(getErrorMessage(error, 'Không thể xóa người dùng'));
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

  const openEditDialog = (user: DashboardUser) => {
    setErrorMessage(null);
    setEditingUser(user);
    editForm.reset({
      username: user.username,
      email: user.email,
      password: '',
      role: user.role === 'admin' ? 'admin' : 'user',
    });
  };

  const handleCreateUser = (values: CreateUserFormValues) => {
    setErrorMessage(null);
    createUserMutation.mutate(values);
  };

  const handleUpdateUser = (values: EditUserFormValues) => {
    if (!editingUser) {
      return;
    }

    setErrorMessage(null);
    updateUserMutation.mutate({
      id: editingUser.id,
      payload: values,
    });
  };

  const handleDeleteUser = () => {
    if (!deletingUser) {
      return;
    }

    setErrorMessage(null);
    deleteUserMutation.mutate(deletingUser.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Quản lý người dùng</h1>
          <p className="mt-1 text-sm text-gray-500">Thêm, chỉnh sửa, xóa và tìm kiếm tài khoản người dùng.</p>
        </div>

        <Button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setIsCreateDialogOpen(true);
          }}
          className="h-10 rounded-xl bg-blue-600 px-4 text-white hover:bg-blue-700"
        >
          <Plus className="size-4" />
          Thêm người dùng
        </Button>
      </div>

      {errorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {errorMessage}
        </div>
      ) : null}

      {queryErrorMessage ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
          {queryErrorMessage}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Tìm theo tên đăng nhập hoặc email"
            className="h-10 rounded-xl border-gray-200 pl-9"
          />
        </div>

        <p className="text-sm font-medium text-gray-500">
          Hiển thị {filteredUsers.length}/{totalUsers} người dùng
        </p>
      </div>

      <Card className="rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50/60 text-gray-500">
              <tr>
                <th className="px-6 py-4 font-semibold">Email</th>
                <th className="px-6 py-4 font-semibold">Tên đăng nhập</th>
                <th className="px-6 py-4 font-semibold">Vai trò</th>
                <th className="px-6 py-4 font-semibold">Hiệu chuẩn</th>
                <th className="px-6 py-4 font-semibold">Ngày tham gia</th>
                <th className="px-6 py-4 font-semibold">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {usersQuery.isPending ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="size-4 animate-spin" />
                      Đang tải danh sách người dùng...
                    </span>
                  </td>
                </tr>
              ) : null}

              {usersQuery.isError ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-rose-600">
                    Không thể tải dữ liệu từ server.
                  </td>
                </tr>
              ) : null}

              {usersQuery.isSuccess && filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-sm text-gray-500">
                    Không tìm thấy người dùng phù hợp.
                  </td>
                </tr>
              ) : null}

              {usersQuery.isSuccess
                ? filteredUsers.map((user, index) => (
                    <motion.tr
                      key={user.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.04 }}
                      className="hover:bg-blue-50/30"
                    >
                      <td className="px-6 py-4 font-semibold text-gray-800">{user.email}</td>
                      <td className="px-6 py-4 text-gray-700">{user.username}</td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${
                            user.role === 'admin'
                              ? 'bg-purple-100 text-purple-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {user.role === 'admin' ? 'Quản trị viên' : 'Học viên'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`rounded-md border px-3 py-1 text-xs font-semibold ${
                            user.calibrated
                              ? 'border-emerald-200 bg-emerald-100 text-emerald-700'
                              : 'border-rose-200 bg-rose-100 text-rose-700'
                          }`}
                        >
                          {user.calibrated ? 'Đã thiết lập' : 'Chưa thiết lập'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-gray-500">
                        {new Date(user.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => openEditDialog(user)}
                            disabled={updateUserMutation.isPending}
                            className="rounded-lg"
                          >
                            <Pencil className="size-3.5" />
                            Sửa
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            onClick={() => {
                              setErrorMessage(null);
                              setDeletingUser(user);
                            }}
                            disabled={deleteUserMutation.isPending}
                            className="rounded-lg"
                          >
                            <Trash2 className="size-3.5" />
                            Xóa
                          </Button>
                        </div>
                      </td>
                    </motion.tr>
                  ))
                : null}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thêm người dùng mới</DialogTitle>
            <DialogDescription>
              Tạo tài khoản để học viên bắt đầu sử dụng hệ thống theo dõi mắt.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={createForm.handleSubmit(handleCreateUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="create-user-username">Tên đăng nhập</Label>
              <Input
                id="create-user-username"
                type="text"
                placeholder="vd: test_user_01"
                {...createForm.register('username')}
                className={createForm.formState.errors.username ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {createForm.formState.errors.username ? (
                <p className="text-sm font-medium text-rose-600">
                  {createForm.formState.errors.username.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                type="email"
                placeholder="user@example.com"
                {...createForm.register('email')}
                className={createForm.formState.errors.email ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {createForm.formState.errors.email ? (
                <p className="text-sm font-medium text-rose-600">
                  {createForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-password">Mật khẩu</Label>
              <Input
                id="create-user-password"
                type="password"
                placeholder="Tối thiểu 6 ký tự"
                {...createForm.register('password')}
                className={createForm.formState.errors.password ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {createForm.formState.errors.password ? (
                <p className="text-sm font-medium text-rose-600">
                  {createForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-role">Vai trò</Label>
              <select
                id="create-user-role"
                {...createForm.register('role')}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-500/20"
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
              <Button type="submit" disabled={createUserMutation.isPending}>
                {createUserMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
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

      <Dialog
        open={Boolean(editingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setEditingUser(null);
            editForm.reset({
              username: '',
              email: '',
              password: '',
              role: 'user',
            });
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Chỉnh sửa người dùng</DialogTitle>
            <DialogDescription>
              Cập nhật email, vai trò hoặc mật khẩu mới cho tài khoản đã chọn.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={editForm.handleSubmit(handleUpdateUser)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-username">Tên đăng nhập</Label>
              <Input
                id="edit-user-username"
                type="text"
                {...editForm.register('username')}
                className={editForm.formState.errors.username ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {editForm.formState.errors.username ? (
                <p className="text-sm font-medium text-rose-600">
                  {editForm.formState.errors.username.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input
                id="edit-user-email"
                type="email"
                {...editForm.register('email')}
                className={editForm.formState.errors.email ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {editForm.formState.errors.email ? (
                <p className="text-sm font-medium text-rose-600">
                  {editForm.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-password">Mật khẩu mới (tùy chọn)</Label>
              <Input
                id="edit-user-password"
                type="password"
                placeholder="Để trống nếu không đổi"
                {...editForm.register('password')}
                className={editForm.formState.errors.password ? 'border-rose-400 focus-visible:ring-rose-400/30' : ''}
              />
              {editForm.formState.errors.password ? (
                <p className="text-sm font-medium text-rose-600">
                  {editForm.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-role">Vai trò</Label>
              <select
                id="edit-user-role"
                {...editForm.register('role')}
                className="h-8 w-full rounded-lg border border-gray-200 bg-white px-2.5 text-sm outline-none transition focus:border-blue-500 focus:ring-3 focus:ring-blue-500/20"
              >
                <option value="user">Học viên</option>
                <option value="admin">Quản trị viên</option>
              </select>
            </div>

            <DialogFooter className="mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditingUser(null)}
              >
                Hủy
              </Button>
              <Button type="submit" disabled={updateUserMutation.isPending}>
                {updateUserMutation.isPending ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
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

      <Dialog
        open={Boolean(deletingUser)}
        onOpenChange={(open) => {
          if (!open) {
            setDeletingUser(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Xóa người dùng</DialogTitle>
            <DialogDescription>
              Bạn có chắc muốn xóa tài khoản {deletingUser?.email}? Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeletingUser(null)}
            >
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteUser}
              disabled={deleteUserMutation.isPending}
            >
              {deleteUserMutation.isPending ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Đang xóa...
                </>
              ) : (
                'Xác nhận xóa'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </motion.div>
  );
}