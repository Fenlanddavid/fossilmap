import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { ScaledImage } from "./ScaledImage";

export function LocalityThumbnail({ localityId, className, imgClassName, onHasMedia }: {
  localityId: string;
  className?: string;
  imgClassName?: string;
  onHasMedia?: (has: boolean) => void;
}) {
  const media = useLiveQuery(async () => {
    const items = await db.media.where("localityId").equals(localityId).toArray();
    const hasMedia = items && items.length > 0;
    if (onHasMedia) onHasMedia(hasMedia);
    if (!hasMedia) return null;
    return items.sort((a, b) => {
        const aDate = a?.createdAt || "";
        const bDate = b?.createdAt || "";
        return aDate.localeCompare(bDate);
    })[0];
  }, [localityId]);

  // Still loading
  if (media === undefined) return null;

  // No photo — show placeholder
  if (media === null) {
    return (
      <div className={`flex items-center justify-center ${className ?? ""}`}>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-600">Add photo</span>
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
