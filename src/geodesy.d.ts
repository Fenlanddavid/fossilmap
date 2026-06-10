declare module "geodesy/osgridref.js" {
  export default class OsGridRef {
    constructor(easting: number | string, northing: number | string);
    static parse(gridref: string): OsGridRef;
    toLatLon(): LatLon;
    toString(digits?: number): string;
  }

  export class LatLon {
    constructor(lat: number, lon: number);
    lat: number;
    lon: number;
    longitude: number;
    toOsGrid(): OsGridRef;
  }

  export const Dms: unknown;
}
