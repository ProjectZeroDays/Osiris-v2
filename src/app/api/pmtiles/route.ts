import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import pmtiles from 'pmtiles';

const PM_TILES_DIR = path.join(process.cwd(), 'public', 'pmtiles');
if (!existsSync(PM_TILES_DIR)) {
  mkdirSync(PM_TILES_DIR, { recursive: true });
}

// GET /api/pmtiles
export async function GET(request: NextRequest) {
  try {
    const { readdirSync } = await import('node:fs');
    const files = existsSync(PM_TILES_DIR)
      ? readdirSync(PM_TILES_DIR).filter(f => f.endsWith('.pmtiles'))
      : [];

    return NextResponse.json({
      ok: true,
      files,
      count: files.length,
    });
  } catch (error) {
    console.error('PMTiles list error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to list PMTiles files' },
      { status: 500 }
    );
  }
}

// POST /api/pmtiles (multipart)
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { ok: false, error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const filePath = path.join(PM_TILES_DIR, safeName);
    writeFileSync(filePath, buffer);

    return NextResponse.json({
      ok: true,
      filename: safeName,
      size: buffer.length,
    });
  } catch (error) {
    console.error('PMTiles upload error:', error);
    return NextResponse.json(
      { ok: false, error: 'Failed to upload PMTiles file' },
      { status: 500 }
    );
  }
}