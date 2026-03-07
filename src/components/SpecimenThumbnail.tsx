import React from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../db";
import { ScaledImage } from "./ScaledImage";

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
    // Only fetch the FIRST media record for this specimen
    const items = await db.media.where("specimenId").equals(specimenId).toArray();
    if (!items || items.length === 0) return null;
    
    // Sort locally by createdAt to find the earliest one
    return items.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""))[0];
  }, [specimenId]);

  if (!media) {
    return (
      <div className={`${className} bg-gray-100 dark:bg-gray-900 flex items-center justify-center opacity-30 italic text-xs`}>
        No photo
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
