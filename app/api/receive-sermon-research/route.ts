import fs from 'fs';
import { NextRequest } from 'next/server';
import { normalizePassage, buildVaultPath } from '../../../lib/passage';

// Holds the most recently received research so the UI can poll for it
let latest: { passage: string; sessionNumber: string; receivedAt: string } | null = null;

function getVaultRoot(): string {
  const v = process.env.OBSIDIAN_VAULT;
  if (!v) return '';
  return v.replace(/^~/, process.env.HOME || '');
}

// GET — UI polls this to auto-populate passage/session fields
export async function GET() {
  return Response.json(latest ?? { passage: '', sessionNumber: '', receivedAt: '' });
}

// POST { passage, sessionNumber, content } — called by the Sermon Research Tool
export async function POST(request: NextRequest) {
  const { passage, sessionNumber, content } = await request.json();

  if (!passage?.trim() || !sessionNumber?.trim() || !content?.trim()) {
    return Response.json({ error: 'passage, sessionNumber, and content are required.' }, { status: 400 });
  }

  const vaultRoot = getVaultRoot();
  if (!vaultRoot || !fs.existsSync(vaultRoot)) {
    return Response.json({ error: 'Obsidian vault not configured or not found.' }, { status: 500 });
  }

  let info;
  try {
    info = normalizePassage(passage);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }

  const { folder, filename, fullPath } = buildVaultPath(
    vaultRoot,
    info.bookName,
    sessionNumber,
    info.passageCode,
    info.passageName,
    'Sermon_Research',
  );

  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');

  latest = { passage, sessionNumber, receivedAt: new Date().toISOString() };

  return Response.json({ success: true, savedPath: fullPath });
}
