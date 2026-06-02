import React, { useCallback, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Modal } from "./Modal";

type Tone = "info" | "success" | "warning" | "danger";

type ConfirmOptions = {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: Tone;
  danger?: boolean;
};

type NoticeOptions = {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: Tone;
};

type PendingDialog =
  | (ConfirmOptions & { mode: "confirm"; resolve: (confirmed: boolean) => void })
  | (NoticeOptions & { mode: "notice"; resolve: () => void });

export function useConfirmDialog() {
  const [pending, setPending] = useState<PendingDialog | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => (
    new Promise<boolean>((resolve) => {
      setPending({ ...options, mode: "confirm", resolve });
    })
  ), []);

  const notify = useCallback((options: NoticeOptions) => (
    new Promise<void>((resolve) => {
      setPending({ ...options, mode: "notice", resolve });
    })
  ), []);

  const close = useCallback((confirmed = false) => {
    setPending((current) => {
      if (!current) return null;
      if (current.mode === "confirm") {
        current.resolve(confirmed);
      } else {
        current.resolve();
      }
      return null;
    });
  }, []);

  const tone = pending?.mode === "confirm" && pending.danger ? "danger" : pending?.tone ?? "info";
  const toneClasses = {
    info: "bg-sky-50 text-sky-700 ring-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:ring-sky-900/60",
    success: "bg-emerald-50 text-emerald-700 ring-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-200 dark:ring-emerald-900/60",
    warning: "bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/40 dark:text-amber-200 dark:ring-amber-900/60",
    danger: "bg-red-50 text-red-700 ring-red-100 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900/60",
  } satisfies Record<Tone, string>;

  const ToneIcon = tone === "danger"
    ? XCircle
    : tone === "warning"
      ? AlertTriangle
      : tone === "success"
        ? CheckCircle2
        : Info;

  const dialog = pending ? (
    <Modal title={pending.title} onClose={() => close(false)}>
      <div className="grid gap-5">
        <div className="flex gap-3">
          <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ring-1 ${toneClasses[tone]}`}>
            <ToneIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0 pt-0.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {typeof pending.message === "string" ? (
              <p className="whitespace-pre-line">{pending.message}</p>
            ) : (
              pending.message
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          {pending.mode === "confirm" && (
            <button
              type="button"
              onClick={() => close(false)}
              className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-600 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {pending.cancelLabel ?? "Cancel"}
            </button>
          )}
          <button
            type="button"
            onClick={() => close(true)}
            className={`min-h-11 rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest text-white transition-colors ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : tone === "warning"
                  ? "bg-amber-600 hover:bg-amber-700"
                  : tone === "success"
                    ? "bg-emerald-600 hover:bg-emerald-700"
                    : "bg-sky-600 hover:bg-sky-700"
            }`}
          >
            {pending.confirmLabel ?? (pending.mode === "notice" ? "OK" : "Confirm")}
          </button>
        </div>
      </div>
    </Modal>
  ) : null;

  return { confirm, notify, dialog };
}
