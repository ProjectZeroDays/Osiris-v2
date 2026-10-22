declare module 'pmtiles' {
  export class PMTiles {
    constructor(source?: string | { getSource?: () => any });
    static open(source: string): Promise<any>;
    open(source?: string): Promise<any>;
    getTile(z: number, x: number, y: number): Promise<ArrayBuffer | null>;
    getHeader(): Promise<any>;
    getZxy(z: number, x: number, y: number): Promise<any>;
  }
  export default PMTiles;
}
