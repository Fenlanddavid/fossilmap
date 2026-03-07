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
    return items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))[0];
  }, [localityId]);

  if (!media) return null;

  return (
    <ScaledImage 
      media={media} 
      className={className} 
      imgClassName={imgClassName}
    />
  );
}
