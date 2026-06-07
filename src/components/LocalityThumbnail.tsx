import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { Camera, MapPin } from "lucide-react";
import { ScaledImage } from "./ScaledImage";
import { getFirstLocalityMedia } from "../services/media";

export function LocalityThumbnail({ localityId, className, imgClassName, onHasMedia }: {
  localityId: string;
  className?: string;
  imgClassName?: string;
  onHasMedia?: (has: boolean) => void;
}) {
  const media = useLiveQuery(async () => {
    const firstMedia = await getFirstLocalityMedia(localityId);
    const hasMedia = firstMedia != null;
    if (onHasMedia) onHasMedia(hasMedia);
    return firstMedia;
  }, [localityId]);

  // Still loading
  if (media === undefined) return null;

  // No photo — show placeholder
  if (media === null) {
    return (
      <div className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-emerald-50 via-sky-50 to-slate-100 dark:from-slate-900 dark:via-slate-950 dark:to-emerald-950/35 ${className ?? ""}`}>
        <MapPin className="absolute -right-3 -top-3 h-16 w-16 text-emerald-500/10 dark:text-emerald-300/10" />
        <div className="grid h-11 w-11 place-items-center rounded-xl border border-white/60 bg-white/75 text-emerald-700 shadow-sm backdrop-blur dark:border-slate-700 dark:bg-slate-900/75 dark:text-emerald-300">
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
