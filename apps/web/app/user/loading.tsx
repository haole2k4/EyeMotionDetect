export default function UserLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[16rem] w-full flex-col items-center justify-center gap-3 text-[#3F3F46]"
    >
      <div
        aria-hidden="true"
        className="size-8 animate-spin rounded-full border-2 border-[#E4E4E7] border-t-[#0052FF]"
      />
      <span className="text-sm font-medium">Đang tải nội dung...</span>
    </div>
  );
}
