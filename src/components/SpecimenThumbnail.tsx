import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, Microscope } from "lucide-react";
import { ScaledImage } from "./ScaledImage";
import { getFirstSpecimenMedia } from "../services/media";

/**
 * A lightweight component to fetch and display the first thumbnail for a specimen
 * without loading all blobs for all specimens in a list into memory at once.
 */
export function SpecimenThumbnail({ specimenId, className, imgClassName }: { 
  specimenId: string; 
  className?: string;
  imgClassName?: string;
}) {
  const media = useLiveQuery(async () => {
    return getFirstSpecimenMedia(specimenId);
  }, [specimenId]);

  if (!media) {
    return (
      <div className={`${className ?? ""} relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-sky-50 to-emerald-50 dark:from-slate-900 dark:via-slate-950 dark:to-sky-950/35`}>
        <Microscope className="absolute -right-3 -top-3 h-16 w-16 text-sky-500/10 dark:text-sky-300/10" />
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/60 bg-white/75 text-slate-500 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/75 dark:text-slate-300">
          <Camera className="h-5 w-5" />
        </div>
      </div>
    );
  }

  return (
    <ScaledImage 
      media={media} 
      className={className} 
      imgClassName={imgClassName}
    />
  );
}
