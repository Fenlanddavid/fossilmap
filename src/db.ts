import Dexie, { Table } from "dexie";

export type Project = {
  id: string;
  name: string;
  region: "England" | "Wales" | "Scotland" | "Northern Ireland" | "UK";
  createdAt: string;
};

export type Locality = {
  id: string;
  projectId: string;
  type: "location" | "trip";

  name: string;
  lat: number | null;
  lon: number | null;
  gpsAccuracyM: number | null;
  observedAt: string; // ISO datetime
  collector: string;

  exposureType:
    | "beach shingle"
    | "foreshore platform"
    | "cliff fall / landslip debris"
    | "in situ cliff/face"
    | "quarry face"
    | "quarry spoil"
    | "mine tip/spoil heap"
    | "stream bed"
    | "ploughed field"
    | "building stone / walling"
    | "other";

  sssi: boolean;
  permissionGranted: boolean;

  formation: string;
  member: string;
  bed: string;

  lithologyPrimary:
    | "mudstone"
    | "shale"
    | "siltstone"
    | "sandstone"
    | "limestone"
    | "chalk"
    | "clay"
    | "Oxford Clay"
    | "London Clay"
    | "Kimmeridge Clay"
    | "Gault Clay"
    | "marl"
    | "conglomerate"
    | "ironstone"
    | "coal"
    | "chert/flint"
    | "phosphatic nodule"
    | "other";

  notes: string;

  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  projectId: string;
  localityId: string; // Links to Locality.id (Location)

  startTime: string; // ISO
  endTime: string | null; // ISO
  notes: string;
  isFinished: boolean;

  createdAt: string;
  updatedAt: string;
};

export type Specimen = {
  id: string;
  projectId: string;
  localityId: string;
  sessionId: string | null;

  specimenCode: string;
  taxon: string;
  taxonConfidence: "high" | "med" | "low";

  lat: number | null;
  lon: number | null;
  gpsAccuracyM: number | null;

  element: string;

  preservation:
    | "body fossil"
    | "trace fossil"
    | "mould"
    | "cast"
    | "impression/compression"
    | "permineralised"
    | "replacement"
    | "carbonised"
    | "subfossil"
    | "other";

  taphonomy: string;
  findContext: string;

  weightG: number | null;
  lengthMm: number | null;
  widthMm: number | null;
  thicknessMm: number | null;

  bagBoxId: string;
  storageLocation: string;
  notes: string;

  createdAt: string;
  updatedAt: string;
};

export type Media = {
  id: string;
  projectId: string;
  specimenId: string;

  type: "photo";
  photoType?: "in-situ" | "laboratory" | "other";
  filename: string;
  mime: string;
  blob: Blob;
  caption: string;
  scalePresent: boolean;
  pxPerMm?: number;

  createdAt: string;
};

export type Setting = {
  key: string;
  value: any;
};

export class FossilMapDB extends Dexie {
  projects!: Table<Project, string>;
  localities!: Table<Locality, string>;
  sessions!: Table<Session, string>;
  specimens!: Table<Specimen, string>;
  media!: Table<Media, string>;
  settings!: Table<Setting, string>;

  constructor() {
    super("fossilmap_uk");

    this.version(1).stores({
      projects: "id, name, region, createdAt",
      localities: "id, projectId, name, observedAt, sssi, permissionGranted",
      specimens: "id, projectId, localityId, specimenCode, taxon, createdAt",
      media: "id, projectId, specimenId, createdAt",
    });

    this.version(2).stores({
      projects: "id, name, region, createdAt",
      localities: "id, projectId, name, observedAt, sssi, permissionGranted, formation",
      specimens: "id, projectId, localityId, specimenCode, taxon, createdAt",
      media: "id, projectId, specimenId, createdAt",
    });

    // Version 3: Add 'createdAt' index to localities so sortBy works properly
    this.version(3).stores({
      localities: "id, projectId, name, observedAt, sssi, permissionGranted, formation, createdAt",
    });

    // Version 4: Add settings table
    this.version(4).stores({
      settings: "key",
    });

    // Version 5: Media photoType
    this.version(5).stores({
      media: "id, projectId, specimenId, createdAt",
    });

    // Version 6: Sessions and updated Locality/Specimen types
    this.version(6).stores({
        localities: "id, projectId, type, name, observedAt, sssi, permissionGranted, formation, createdAt",
        sessions: "id, projectId, localityId, startTime, isFinished, createdAt",
        specimens: "id, projectId, localityId, sessionId, specimenCode, taxon, createdAt",
    }).upgrade(async tx => {
        await tx.table("localities").toCollection().modify(l => {
            if (!l.type) l.type = "location";
        });
    });

    // Version 7: Specimen GPS fields
    this.version(7).stores({
        specimens: "id, projectId, localityId, sessionId, specimenCode, taxon, lat, lon, createdAt",
    });
  }
}

export const db = new FossilMapDB();