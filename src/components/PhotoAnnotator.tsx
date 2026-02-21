import React, { useEffect, useRef, useState } from "react";
import { Media, db } from "../db";
import { Modal } from "./Modal";

type Point = { x: number; y: number }; // Normalized 0-1
type Annotation = {
  type: "arrow" | "circle";
  start: Point;
  end: Point;
  color: string;
};

export function PhotoAnnotator(props: { media: Media; url: string; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [currentAnnotation, setCurrentAnnotation] = useState<Annotation | null>(null);
  const [mode, setMode] = useState<"arrow" | "circle">("arrow");
  const [color, setColor] = useState("#ef4444"); // Tailwind red-500
  const [canvasDim, setCanvasDim] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (props.media.annotations) {
      try {
        setAnnotations(JSON.parse(props.media.annotations));
      } catch (e) {
        console.error("Failed to parse annotations", e);
      }
    }
  }, [props.media.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.src = props.url;
    img.onload = () => {
      const maxWidth = window.innerWidth * 0.9;
      const maxHeight = window.innerHeight * 0.6;
      let w = img.width;
      let h = img.height;

      const ratio = Math.min(maxWidth / w, maxHeight / h);
      w *= ratio;
      h *= ratio;

      setCanvasDim({ w, h });
      canvas.width = w;
      canvas.height = h;
      draw();
    };

    function draw() {
      if (!ctx || !canvas) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const all = [...annotations, ...(currentAnnotation ? [currentAnnotation] : [])];
      all.forEach((ann) => {
        ctx.strokeStyle = ann.color;
        ctx.fillStyle = ann.color;
        ctx.lineWidth = 3;

        const x1 = ann.start.x * canvas.width;
        const y1 = ann.start.y * canvas.height;
        const x2 = ann.end.x * canvas.width;
        const y2 = ann.end.y * canvas.height;

        if (ann.type === "arrow") {
          drawArrow(ctx, x1, y1, x2, y2);
        } else if (ann.type === "circle") {
          drawCircle(ctx, x1, y1, x2, y2);
        }
      });
    }

    function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
      const headlen = 15;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x2, y2);
      ctx.lineTo(x2 - headlen * Math.cos(angle - Math.PI / 6), y2 - headlen * Math.sin(angle - Math.PI / 6));
      ctx.lineTo(x2 - headlen * Math.cos(angle + Math.PI / 6), y2 - headlen * Math.sin(angle + Math.PI / 6));
      ctx.closePath();
      ctx.fill();
    }

    function drawCircle(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number) {
      const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
      ctx.beginPath();
      ctx.arc(x1, y1, radius, 0, 2 * Math.PI);
      ctx.stroke();
    }

    draw();
  }, [annotations, currentAnnotation, props.url]);

  function getNormalizedPos(e: React.MouseEvent | React.TouchEvent): Point {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) / canvas.width,
      y: (clientY - rect.top) / canvas.height,
    };
  }

  function handleStart(e: React.MouseEvent | React.TouchEvent) {
    const pos = getNormalizedPos(e);
    setCurrentAnnotation({ type: mode, start: pos, end: pos, color });
  }

  function handleMove(e: React.MouseEvent | React.TouchEvent) {
    if (!currentAnnotation) return;
    const pos = getNormalizedPos(e);
    setCurrentAnnotation({ ...currentAnnotation, end: pos });
  }

  function handleEnd() {
    if (currentAnnotation) {
      setAnnotations([...annotations, currentAnnotation]);
      setCurrentAnnotation(null);
    }
  }

  async function save() {
    await db.media.update(props.media.id, {
      annotations: JSON.stringify(annotations),
    });
    props.onClose();
  }

  return (
    <Modal onClose={props.onClose} title="Annotate Photo">
      <div className="flex flex-col gap-4 items-center max-h-[85vh] overflow-y-auto pr-1 pb-4">
        <div className="flex flex-wrap gap-2 justify-center w-full bg-gray-50 dark:bg-gray-900 p-3 rounded-xl border border-gray-100 dark:border-gray-800 shadow-inner sticky top-0 z-20">
          <button 
            onClick={() => setMode("arrow")} 
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'arrow' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}
          >
            ↗ Arrow
          </button>
          <button 
            onClick={() => setMode("circle")} 
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${mode === 'circle' ? 'bg-blue-600 text-white shadow-md' : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700'}`}
          >
            ◯ Circle
          </button>
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />
          {["#ef4444", "#3b82f6", "#22c55e", "#eab308", "#ffffff"].map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`w-8 h-8 rounded-full border-2 transition-transform active:scale-90 shadow-sm ${color === c ? 'border-blue-500 scale-110' : 'border-transparent'}`}
              style={{ backgroundColor: c }}
            />
          ))}
          <div className="w-px h-8 bg-gray-200 dark:bg-gray-700 mx-1" />
          <button onClick={() => setAnnotations(annotations.slice(0, -1))} className="px-3 py-2 rounded-lg text-xs font-bold bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700">↶ Undo</button>
          <button onClick={() => confirm("Clear all?") && setAnnotations([])} className="px-3 py-2 rounded-lg text-xs font-bold bg-red-50 text-red-600 border border-red-100">🗑️ Clear</button>
        </div>

        <div className="relative border-4 border-white dark:border-gray-800 shadow-2xl rounded-sm cursor-crosshair touch-none overflow-hidden bg-black flex items-center justify-center mx-auto">
          <canvas
            ref={canvasRef}
            onMouseDown={handleStart}
            onMouseMove={handleMove}
            onMouseUp={handleEnd}
            onMouseLeave={handleEnd}
            onTouchStart={handleStart}
            onTouchMove={handleMove}
            onTouchEnd={handleEnd}
            className="block max-w-full h-auto"
          />
          <div className="absolute top-2 left-2 bg-black/40 text-white text-[8px] font-bold px-2 py-1 rounded-full backdrop-blur-sm pointer-events-none uppercase tracking-widest">
            {mode} Mode
          </div>
        </div>

        <div className="flex gap-4 w-full pt-2">
          <button onClick={props.onClose} className="flex-1 px-6 py-3 rounded-xl font-bold bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 px-6 py-3 rounded-xl font-black bg-blue-600 text-white shadow-lg hover:bg-blue-700 transition-all active:scale-[0.98]">Save Annotations</button>
        </div>
      </div>
    </Modal>
  );
}
