import React, { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Locality, Media, Specimen } from "../db";
import { getCommunityUrl } from "../services/community";

export type SpecimenLabelData = {
  specimen: Specimen;
  locality: Locality | null;
  media?: Media | null;
};

function clean(value?: string | number | null): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function formatDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function formatMeasurement(value?: number | null, suffix = ""): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return `${Number(value.toFixed(2))}${suffix}`;
}

export function SpecimenLabel({ specimen, locality, media }: SpecimenLabelData) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const qrContent = specimen.isShared && specimen.hrid
    ? getCommunityUrl(specimen.hrid)
    : `FossilMap · ${specimen.specimenCode}`;

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrContent, {
      width: 148,
      margin: 1,
      color: { dark: "#13201c", light: "#ffffff" },
      errorCorrectionLevel: "M",
    })
      .then((url) => { if (active) setQrDataUrl(url); })
      .catch(() => { if (active) setQrDataUrl(null); });
    return () => { active = false; };
  }, [qrContent]);

  useEffect(() => {
    if (!media?.blob) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(media.blob);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [media]);

  const stratigraphy = useMemo(() => [
    clean(specimen.period) || clean(locality?.period),
    clean(specimen.stage) || clean(locality?.stage),
    clean(specimen.formation) || clean(locality?.formation),
  ].filter(Boolean).join(" / "), [locality, specimen]);

  const detailLine = [
    clean(specimen.element),
    specimen.preservation && specimen.preservation !== "body fossil" ? specimen.preservation : null,
  ].filter(Boolean).join(" · ");

  const measurements = [
    formatMeasurement(specimen.weightG, "g"),
    formatMeasurement(specimen.lengthMm, "mm"),
  ].filter(Boolean).join(" · ");

  const dateLabel = formatDate(specimen.dateCollected) || formatDate(specimen.createdAt);

  return (
    <div
      className="label-card"
      style={{
        width: "85mm",
        height: "54mm",
        border: "0.35mm solid #ccd8d3",
        borderRadius: "2mm",
        padding: "2.6mm",
        display: "grid",
        gridTemplateColumns: "19mm 1fr 19mm",
        gridTemplateRows: "auto 1fr auto",
        gap: "2mm",
        fontFamily: "Inter, Arial, Helvetica, sans-serif",
        background: "linear-gradient(180deg, #f7faf8 0%, #edf3f0 100%)",
        color: "#13201c",
        pageBreakInside: "avoid",
        breakInside: "avoid",
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      <div style={{ gridColumn: "1 / 4", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "0.25mm solid #ccd8d3", paddingBottom: "1.2mm", minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.6mm", minWidth: 0 }}>
          <div style={{ display: "grid", placeItems: "center", width: "7mm", height: "7mm", border: "0.25mm solid #b9d8cf", borderRadius: "1.4mm", background: "#ffffff", color: "#0f766e", fontWeight: 900, fontSize: "6pt" }}>FM</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#0f766e", fontSize: "5.2pt", fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase", lineHeight: 1 }}>FossilMap</div>
            <div style={{ color: "#66736f", fontSize: "4.5pt", fontWeight: 800, textTransform: "uppercase", lineHeight: 1.25 }}>Specimen label</div>
          </div>
        </div>
        <div style={{ color: "#0f766e", fontFamily: "monospace", fontSize: specimen.specimenCode.length > 16 ? "5pt" : "5.8pt", fontWeight: 900, lineHeight: 1, whiteSpace: "nowrap" }}>
          {specimen.specimenCode}
        </div>
      </div>

      <div style={{ minWidth: 0, overflow: "hidden" }}>
        <div style={{ width: "19mm", height: "19mm", overflow: "hidden", borderRadius: "1.4mm", border: "0.25mm solid #d7dfdc", background: "#ffffff" }}>
          {photoUrl ? (
            <img src={photoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          ) : (
            <div style={{ height: "100%", display: "grid", placeItems: "center", color: "#8a9893", fontSize: "4.5pt", fontWeight: 900, textAlign: "center", textTransform: "uppercase", padding: "1mm" }}>No image</div>
          )}
        </div>
        {measurements && (
          <div style={{ marginTop: "1.2mm", color: "#66736f", fontSize: "4.6pt", fontWeight: 800, lineHeight: 1.25 }}>
            {measurements}
          </div>
        )}
      </div>

      <div style={{ minWidth: 0, overflow: "hidden", display: "flex", flexDirection: "column", gap: "1mm" }}>
        <div style={{ color: "#13201c", fontSize: specimen.taxon.length > 34 ? "7pt" : "8pt", fontWeight: 900, lineHeight: 1.05, wordBreak: "break-word" }}>
          {specimen.taxon || "Unidentified fossil"}
        </div>
        {detailLine && (
          <div style={{ color: "#39534c", fontSize: "5.4pt", fontWeight: 800, lineHeight: 1.2, wordBreak: "break-word" }}>
            {detailLine}
          </div>
        )}
        {stratigraphy && (
          <div style={{ color: "#66736f", fontSize: "5pt", fontWeight: 700, lineHeight: 1.25, wordBreak: "break-word" }}>
            {stratigraphy}
          </div>
        )}
        {locality?.name && (
          <div style={{ color: "#66736f", fontSize: "4.8pt", fontWeight: 700, lineHeight: 1.2, wordBreak: "break-word" }}>
            {locality.name}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", gap: "0.9mm", overflow: "hidden" }}>
        <div style={{ width: "18mm", height: "18mm", padding: "0.8mm", borderRadius: "1.2mm", border: "0.25mm solid #d7dfdc", background: "#ffffff" }}>
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR code" style={{ width: "100%", height: "100%", imageRendering: "pixelated", display: "block" }} />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#edf2ef" }} />
          )}
        </div>
        <div style={{ color: "#66736f", fontSize: "4pt", fontWeight: 800, lineHeight: 1.15, textAlign: "center", wordBreak: "break-word" }}>
          {specimen.isShared && specimen.hrid ? "Full record" : "Local ref"}
        </div>
      </div>

      <div style={{ gridColumn: "1 / 4", display: "flex", justifyContent: "space-between", alignItems: "end", borderTop: "0.25mm solid #ccd8d3", paddingTop: "1mm", color: "#8a9893", fontSize: "4.3pt", fontWeight: 800, lineHeight: 1.2, minWidth: 0 }}>
        <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{[dateLabel, locality?.collector].filter(Boolean).join(" · ")}</span>
        <span style={{ marginLeft: "2mm", color: "#0f766e", whiteSpace: "nowrap" }}>{specimen.hrid || "Private record"}</span>
      </div>
    </div>
  );
}
