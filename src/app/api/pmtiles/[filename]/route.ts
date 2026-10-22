import { NextRequest, NextResponse } from 'next/server';
import { existsSync } from 'node:fs';
import path from 'node:path';
import pmtiles from 'pmtiles';

const PM_TILES_DIR = path.join(process.cwd(), 'public', 'pmtiles');

export async function GET(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    const filePath = path.join(PM_TILES_DIR, filename);

    if (!existsSync(filePath)) {
      return NextResponse.json({ ok: false, error: 'PMTiles file not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const z = url.searchParams.get('z');
    const x = url.searchParams.get('x');
    const y = url.searchParams.get('y');

    // If z/x/y are provided, serve a tile
    if (z !== null && x !== null && y !== null) {
      const pmt = await pmtiles.open(filePath);
      const tileData = await pmt.getTile(parseInt(z, 10), parseInt(x, 10), parseInt(y, 10));

      if (!tileData) {
        return new NextResponse(Buffer.alloc(0), {
          status: 204,
          headers: { 'Cache-Control': 'public, max-age=3600' },
        });
      }

      return new NextResponse(Buffer.from(tileData), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.mapbox-vector-tile',
          'Cache-Control': 'public, max-age=3600, immutable',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // No z/x/y — return metadata
    const pmt = await pmtiles.open(filePath);
    const header = await pmt.getHeader();
    return NextResponse.json({
      ok: true,
      filename,
      metadata: {
        name: (header as any)?.name || filename,
        format: (header as any)?.format || 'mvt',
        minzoom: (header as any)?.minzoom ?? 0,
        maxzoom: (header as any)?.maxzoom ?? 14,
      },
    });
  } catch (error) {
    console.error('PMTiles file error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to read PMTiles file' },
      { status: 500 }
    );
  }
}