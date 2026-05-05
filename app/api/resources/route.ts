import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export interface ResourceFile {
  name: string;
  filePath: string;
  content: string;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

async function readEpub(filePath: string): Promise<string> {
  const buffer = fs.readFileSync(filePath);
  const zip = await JSZip.loadAsync(buffer);

  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) return '';

  const opfMatch = containerXml.match(/full-path="([^"]+)"/);
  if (!opfMatch) return '';

  const opfPath = opfMatch[1];
  const opfDir = opfPath.includes('/') ? opfPath.substring(0, opfPath.lastIndexOf('/') + 1) : '';
  const opfContent = await zip.file(opfPath)?.async('text');
  if (!opfContent) return '';

  const itemMatches = [...opfContent.matchAll(/href="([^"?#]+\.x?html?)"/gi)];
  let text = '';

  for (const match of itemMatches) {
    const htmlFile = decodeURIComponent(match[1].split('#')[0]);
    const htmlPath = opfDir + htmlFile;
    const htmlContent = await zip.file(htmlPath)?.async('text');
    if (htmlContent) {
      text += stripHtml(htmlContent) + '\n\n';
      if (text.length > 40000) break;
    }
  }

  return text.slice(0, 40000);
}

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectFiles(full, results);
    } else if (/\.(txt|md|epub)$/i.test(entry.name)) {
      results.push(full);
    }
  }
  return results;
}

export async function loadResourceFiles(): Promise<ResourceFile[]> {
  const folder = process.env.RESOURCES_FOLDER;
  if (!folder) return [];

  const expanded = folder.replace(/^~/, process.env.HOME || '');
  if (!fs.existsSync(expanded)) return [];

  const allFiles = collectFiles(expanded);
  const results: ResourceFile[] = [];

  for (const filePath of allFiles) {
    try {
      let content = '';
      if (/\.epub$/i.test(filePath)) {
        content = await readEpub(filePath);
      } else {
        content = fs.readFileSync(filePath, 'utf-8').trim();
      }
      if (content) results.push({ name: path.basename(filePath), filePath, content });
    } catch {
      // skip unreadable files
    }
  }

  return results;
}

export async function GET() {
  const files = await loadResourceFiles();
  const folder = process.env.RESOURCES_FOLDER
    ? process.env.RESOURCES_FOLDER.replace(/^~/, process.env.HOME || '')
    : '';
  return Response.json({
    folder,
    files: files.map((f) => ({ name: f.name, filePath: f.filePath })),
  });
}
