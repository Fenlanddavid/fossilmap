import React from "react";

export function ScaleBar(props: { pxPerMm: number; className?: string }) {
  // We want to show a bar that is a "sensible" length, e.g. 1cm, 5cm, or 10cm.
  // Let's try to make it at least 50px wide if possible.
  
  let mm = 10; // start with 1cm
  if (mm * props.pxPerMm < 40) mm = 50; // if 1cm is too small, try 5cm
  if (mm * props.pxPerMm < 40) mm = 100; // if 5cm is too small, try 10cm
  
  const widthPx = mm * props.pxPerMm;
  const label = mm >= 10 ? `${mm/10}cm` : `${mm}mm`;

  return (
    <div className={`flex flex-col items-center ${props.className}`}>
      <div 
        className="h-1.5 border-x-2 border-b-2 border-white shadow-[0_0_2px_rgba(0,0,0,0.8)]"
        style={{ width: `${widthPx}px` }}
      />
      <div className="text-[10px] font-bold text-white drop-shadow-[0_1px_1px_rgba(0,0,0,1)] leading-none mt-0.5">
        {label}
      </div>
    </div>
  );
}
