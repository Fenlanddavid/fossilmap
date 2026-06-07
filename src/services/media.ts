import { db } from "../db";
import type { Media } from "../db";

export async function getFirstSpecimenMedia(specimenId: string): Promise<Media | null> {
  const items = await db.media.where("specimenId").equals(specimenId).sortBy("createdAt");
  return items[0] ?? null;
}

export async function getFirstLocalityMedia(localityId: string): Promise<Media | null> {
  const items = await db.media.where("localityId").equals(localityId).sortBy("createdAt");
  return items[0] ?? null;
}
