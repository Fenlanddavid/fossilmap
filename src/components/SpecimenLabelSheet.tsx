import React, { useEffect } from "react";
import { Printer, X } from "lucide-react";
import { SpecimenLabel, SpecimenLabelData } from "./SpecimenLabel";

export function SpecimenLabelSheet({
  labels,
  onClose,
}: {
  labels: SpecimenLabelData[];
  onClose: () => void;
}) {
  useEffect(() => {
    document.body.classList.add("printing-labels");
    return () => document.body.classList.remove("printing-labels");
  }, []);

  return (
    <>
      <div className="no-print fixed inset-0 z-[70] flex flex-col items-center justify-start gap-4 overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6">
        <div className="flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-lg dark:border-slate-700 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-white">
              {labels.length} specimen label{labels.length !== 1 ? "s" : ""}
            </p>
            <p className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">
              Print at actual size. Do not scale to fit.
            </p>
            <p className="mt-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">
              Printer dialog: A4 paper, 100% scale, no margins if available.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Print labels
            </button>
          </div>
        </div>

        <div className="label-sheet-preview rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 85mm)",
              gap: "5mm",
            }}
          >
            {labels.map((label) => (
              <SpecimenLabel key={label.specimen.id} {...label} />
            ))}
          </div>
        </div>
      </div>

      <div className="label-print-container">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 85mm)",
            gap: "5mm",
            padding: "10mm",
          }}
        >
          {labels.map((label) => (
            <SpecimenLabel key={label.specimen.id} {...label} />
          ))}
        </div>
      </div>
    </>
  );
}
