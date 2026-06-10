import React, { useEffect, useRef, useState } from "react";
import html2canvas from "html2canvas";
import { Download, Printer, X } from "lucide-react";
import { SpecimenLabel, SpecimenLabelData } from "./SpecimenLabel";

export function SpecimenLabelSheet({
  labels,
  onClose,
}: {
  labels: SpecimenLabelData[];
  onClose: () => void;
}) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [savingImage, setSavingImage] = useState(false);

  useEffect(() => {
    document.body.classList.add("printing-labels");
    return () => document.body.classList.remove("printing-labels");
  }, []);

  async function saveAsImage() {
    if (!sheetRef.current || savingImage) return;
    setSavingImage(true);
    try {
      await document.fonts?.ready;
      const canvas = await html2canvas(sheetRef.current, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        logging: false,
      });
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const firstCode = labels[0]?.specimen.specimenCode?.replace(/[^a-z0-9_-]+/gi, "-") || "specimen";
      a.href = url;
      a.download = labels.length === 1 ? `${firstCode}-label.png` : "fossilmap-specimen-labels.png";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setSavingImage(false);
    }
  }

  return (
    <>
      <div className="no-print fixed inset-0 z-[70] flex flex-col items-stretch justify-start gap-4 overflow-y-auto bg-slate-950/70 p-3 backdrop-blur-sm sm:items-center sm:p-6">
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
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <X className="h-3.5 w-3.5" />
              Cancel
            </button>
            <button
              onClick={saveAsImage}
              disabled={savingImage}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100 disabled:opacity-60 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
            >
              <Download className="h-3.5 w-3.5" />
              {savingImage ? "Saving..." : "Save PNG"}
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-black text-white hover:bg-emerald-700"
            >
              <Printer className="h-3.5 w-3.5" />
              Print labels
            </button>
          </div>
        </div>

        <div className="label-sheet-preview w-full rounded-xl border border-slate-200 bg-white p-3 shadow-lg sm:w-auto sm:p-5">
          <div ref={sheetRef} className="label-sheet-grid bg-white">
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
