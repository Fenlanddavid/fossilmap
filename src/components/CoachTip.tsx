import React, { useState } from "react";
import { Lightbulb, X } from "lucide-react";

export function CoachTip(props: {
  storageKey: string;
  title: string;
  children: React.ReactNode;
  tone?: "emerald" | "sky" | "amber";
}) {
  const [visible, setVisible] = useState(() => {
    try {
      return localStorage.getItem(props.storageKey) !== "1";
    } catch {
      return true;
    }
  });

  if (!visible) return null;

  const tone = props.tone ?? "emerald";
  const classes = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/25 dark:text-emerald-100",
    sky: "border-sky-200 bg-sky-50 text-sky-950 dark:border-sky-900 dark:bg-sky-950/25 dark:text-sky-100",
    amber: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/25 dark:text-amber-100",
  };

  function dismiss() {
    try {
      localStorage.setItem(props.storageKey, "1");
    } catch {}
    setVisible(false);
  }

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm shadow-sm ${classes[tone]}`}>
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-black">{props.title}</p>
        <div className="mt-0.5 text-xs leading-relaxed opacity-80">{props.children}</div>
      </div>
      <button
        type="button"
        onClick={dismiss}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-md opacity-60 transition hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/10"
        aria-label="Dismiss tip"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
