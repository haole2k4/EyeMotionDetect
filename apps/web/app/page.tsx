"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";

export default function Home() {
  const router = useRouter();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  useEffect(() => {
    if (!token || !user) {
      router.replace("/login");
      return;
    }

    if (user.role === "admin") {
      router.replace("/admin");
      return;
    }

    router.replace("/user/dashboard");
  }, [router, token, user]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#F7F7F5] px-6 text-[#0A0A0A]">
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-base font-semibold tracking-tight text-[#0A0A0A]">
          EyeMotionDetect
        </p>
        <p className="text-sm text-[#3F3F46]" role="status" aria-live="polite">
          Đang chuyển hướng...
        </p>
      </div>
    </main>
  );
}
