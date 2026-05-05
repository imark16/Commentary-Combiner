import fs from 'fs';
import path from 'path';

export interface ResourceFile {
  name: string;
  content: string;
}

export function loadResourceFiles(): ResourceFile[] {
  const folder = process.env.RESOURCES_FOLDER;
  if (!folder) return [];

  const expanded = folder.replace(/^~/, process.env.HOME || '');
  if (!fs.existsSync(expanded)) return [];

  return fs
    .readdirSync(expanded)
    .filter((f) => /\.(txt|md)$/i.test(f))
    .flatMap((f) => {
      try {
        const content = fs.readFileSync(path.join(expanded, f), 'utf-8').trim();
        return content ? [{ name: f, content }] : [];
      } catch {
        return [];
      }
    });
}

export async function GET() {
  const files = loadResourceFiles();
  const folder = process.env.RESOURCES_FOLDER || '';
  return Response.json({ folder, files: files.map((f) => f.name) });
}
