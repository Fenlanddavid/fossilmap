import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { ScaledImage } from "./ScaledImage";

export function LocalityThumbnail({ localityId, className, imgClassName }: { 
  localityId: string; 
  className?: string;
  imgClassName?: string;
}) {
  const media = useLiveQuery(async () => {
    const items = await db.media.where("localityId").equals(localityId).toArray();
    if (!items || items.length === 0) return null;
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
