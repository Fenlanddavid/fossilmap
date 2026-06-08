import React from "react";

export function Modal(props: { title: string; onClose: () => void; children: React.ReactNode, headerActions?: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/45 grid place-items-center p-2 sm:p-4 z-50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) props.onClose();
      }}
    >
      <div className="w-[min(720px,100%)] max-h-[calc(100svh-1rem)] sm:max-h-[90vh] bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4 shadow-2xl animate-in fade-in zoom-in duration-200 flex flex-col overflow-hidden">
        <div className="flex justify-between gap-3 items-center mb-2 sm:mb-3 shrink-0">
          <div className="flex min-w-0 items-center gap-3">
              {props.headerActions}
              <h2 className="m-0 truncate text-base font-bold sm:text-xl">{props.title}</h2>
          </div>
          <button onClick={props.onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">✕</button>
        </div>
        <div className="mt-2 overflow-y-auto flex-1 pr-1 sm:mt-3">{props.children}</div>
      </div>
    </div>
  );
}
