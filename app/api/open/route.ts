import { exec } from 'child_process';
import { NextRequest } from 'next/server';
import fs from 'fs';

export async function POST(request: NextRequest) {
  const { filePath } = await request.json();

  if (!filePath || typeof filePath !== 'string') {
    return Response.json({ error: 'No file path provided.' }, { status: 400 });
  }

  if (!fs.existsSync(filePath)) {
    return Response.json({ error: 'File not found.' }, { status: 404 });
  }

  return new Promise<Response>((resolve) => {
    // 'open' is macOS-specific; works for epub, md, pdf, txt
    exec(`open "${filePath.replace(/"/g, '\\"')}"`, (err) => {
      if (err) {
        resolve(Response.json({ error: err.message }, { status: 500 }));
      } else {
        resolve(Response.json({ ok: true }));
      }
    });
  });
}
