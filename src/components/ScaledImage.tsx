import React, { useState, useEffect, useRef, useMemo } from "react";
import { Media } from "../db";
import { ScaleBar } from "./ScaleBar";

interface ScaledImageProps {
  media: Media;
  className?: string;
  imgClassName?: string;
  showScale?: boolean;
}

export function ScaledImage({ media, className, imgClassName, showScale = true }: ScaledImageProps) {
  const [url, setUrl] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [displayPxPerMm, setDisplayPxPerMm] = useState<number | null>(null);
  const [imgLayout, setImgLayout] = useState({ width: 0, height: 0, left: 0, top: 0 });

  useEffect(() => {
    const u = URL.createObjectURL(media.blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [media.blob]);

  const annotations = useMemo(() => {
    if (!media.annotations) return [];
    try {
      return JSON.parse(media.annotations);
    } catch (e) {
      return [];
    }
  }, [media.annotations]);

  const updateScale = () => {
    if (!imgRef.current) return;

    const { naturalWidth, naturalHeight, clientWidth, clientHeight, offsetLeft, offsetTop } = imgRef.current;
    setImgLayout({ width: clientWidth, height: clientHeight, left: offsetLeft, top: offsetTop });

    if (!media.pxPerMm) return;
    
    const style = window.getComputedStyle(imgRef.current);
    const objectFit = style.objectFit;

    let scale = clientWidth / naturalWidth;

    if (objectFit === "cover") {
      scale = Math.max(clientWidth / naturalWidth, clientHeight / naturalHeight);
    } else if (objectFit === "contain") {
      scale = Math.min(clientWidth / naturalWidth, clientHeight / naturalHeight);
    }

    setDisplayPxPerMm(media.pxPerMm * scale);
  };

  // Re-calculate on window resize
  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, [media.pxPerMm, annotations]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {url && (
        <img
          ref={imgRef}
          src={url}
          alt={media.filename}
          className={`w-full h-full ${imgClassName}`}
          onLoad={updateScale}
        />
      )}

      {/* SVG Annotations Overlay */}
      {imgLayout.width > 0 && annotations.length > 0 && (
        <svg
          className="absolute pointer-events-none"
          viewBox="0 0 1000 1000"
          preserveAspectRatio="none"
          style={{
            width: imgLayout.width,
            height: imgLayout.height,
            left: imgLayout.left,
            top: imgLayout.top,
          }}
        >
          {annotations.map((ann: any, i: number) => {
            const x1 = ann.start.x * 1000;
            const y1 = ann.start.y * 1000;
            const x2 = ann.end.x * 1000;
            const y2 = ann.end.y * 1000;

            if (ann.type === "arrow") {
              const headlen = 30;
              const angle = Math.atan2(y2 - y1, x2 - x1);
              return (
                <g key={i}>
                  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ann.color} strokeWidth="10" strokeLinecap="round" />
                  <path
                    d={`M ${x2} ${y2} L ${x2 - headlen * Math.cos(angle - Math.PI / 6)} ${y2 - headlen * Math.sin(angle - Math.PI / 6)} L ${x2 - headlen * Math.cos(angle + Math.PI / 6)} ${y2 - headlen * Math.sin(angle + Math.PI / 6)} Z`}
                    fill={ann.color}
                  />
                </g>
              );
            } else if (ann.type === "circle") {
              const radius = Math.sqrt(Math.pow(x2 - x1, 2) + Math.pow(y2 - y1, 2));
              return (
                <circle key={i} cx={x1} cy={y1} r={radius} stroke={ann.color} strokeWidth="10" fill="none" />
              );
            }
            return null;
          })}
        </svg>
      )}

      {showScale && displayPxPerMm && (
        <div className="absolute bottom-2 right-2 pointer-events-none">
          <ScaleBar pxPerMm={displayPxPerMm} />
        </div>
      )}
    </div>
  );
}
