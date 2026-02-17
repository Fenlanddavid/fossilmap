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

export type Specimen = {
  id: string;
  projectId: string;
  localityId: string;

  specimenCode: string;
  taxon: string;
  taxonConfidence: "high" | "med" | "low";

  element:
    | "shell"
    | "bone"
    | "tooth"
    | "plant"
    | "trace fossil"
    | "microfossil"
    | "unknown"
    | "other";

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
  }
}

export const db = new FossilMapDB();