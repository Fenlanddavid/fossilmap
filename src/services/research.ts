import { Specimen, Media } from "../db";
import { getFiniteCoords } from "./coords";

/**
 * Calculates a research quality score (0-100) based on data completeness.
 */
export function calculateQualityScore(specimen: Partial<Specimen>, media: Media[] = []): number {
  let score = 0;

  // Geographic precision (23 pts)
  if (getFiniteCoords(specimen.lat, specimen.lon)) {
    score += 15;
    if (typeof specimen.gpsAccuracyM === "number" && specimen.gpsAccuracyM < 10) score += 5;
    else if (typeof specimen.gpsAccuracyM === "number" && specimen.gpsAccuracyM < 30) score += 3;
  }

  // Stratigraphic detail (21 pts)
  if (specimen.period && specimen.period !== "Unknown") score += 8;
  if (specimen.stage && specimen.stage !== "Unknown") score += 8;
  if (specimen.formation?.trim()) score += 5;

  // Specimen detail (20 pts)
  if (specimen.element?.trim()) score += 7;
  if (specimen.preservation && specimen.preservation !== "body fossil") score += 3;
  if (specimen.findContext?.trim()) score += 5;
  if (specimen.taphonomy?.trim()) score += 5;

  // Measurements (15 pts)
  const hasMeasurement =
    specimen.weightG || specimen.lengthMm || specimen.widthMm || specimen.thicknessMm;
  if (hasMeasurement) score += 10;
  if (specimen.lengthMm && specimen.widthMm && specimen.thicknessMm) score += 5;

  // Visual documentation (21 pts)
  if (media.length > 0) {
    score += 8;
    if (media.length >= 2) score += 4;
    if (media.length >= 3) score += 5;
    if (media.some((m) => (m.pxPerMm ?? 0) > 0)) score += 4;
  }

  return Math.min(score, 100);
}

/**
 * Generates a permanent Human Readable ID for the registry.
 * Format: FM-YYYY-XXXX (FossilMap - Year - Random Hex)
 */
export function generateHRID(): string {
  const year = new Date().getFullYear();
  const random = randomHex(8);
  return `FM-${year}-${random}`;
}

function randomHex(length: number): string {
  const bytes = new Uint8Array(Math.ceil(length / 2));
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join("").slice(0, length);
}

export function getQualityColor(score: number): string {
  if (score >= 80) return "text-emerald-500";
  if (score >= 50) return "text-amber-500";
  return "text-red-500";
}

export function getQualityLabel(score: number): string {
  if (score >= 80) return "High (Research Grade)";
  if (score >= 50) return "Medium (Community Grade)";
  return "Low (Basic Record)";
}
