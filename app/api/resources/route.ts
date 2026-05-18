import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';

export interface ResourceFile {
  name: string;
  filePath: string;
  content: string;
}

export interface ResourceFileInfo {
  name: string;
  filePath: string;
}

const PER_FILE_CHAR_LIMIT = 20000;
const TOTAL_CHAR_LIMIT = 80000;

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
      if (text.length > PER_FILE_CHAR_LIMIT) break;
    }
  }

  return text.slice(0, PER_FILE_CHAR_LIMIT);
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

function getRootFolders(): string[] {
  const raw = process.env.RESOURCES_FOLDER;
  if (!raw) return [];
  return raw
    .split(',')
    .map(f => f.trim().replace(/^~/, process.env.HOME || ''))
    .filter(f => f && fs.existsSync(f));
}

// Discovers all files without loading content — fast, used by GET
export function discoverFiles(): ResourceFileInfo[] {
  const results: ResourceFileInfo[] = [];
  for (const folder of getRootFolders()) {
    collectFiles(folder).forEach(fp => results.push({ name: path.basename(fp), filePath: fp }));
  }
  return results;
}

// Loads content only for the specified file paths — used by synthesize
export async function loadSelectedFiles(filePaths: string[]): Promise<ResourceFile[]> {
  const results: ResourceFile[] = [];
  let totalChars = 0;

  for (const filePath of filePaths) {
    if (totalChars >= TOTAL_CHAR_LIMIT) break;
    try {
      let content = '';
      if (/\.epub$/i.test(filePath)) {
        content = await readEpub(filePath);
      } else {
        content = fs.readFileSync(filePath, 'utf-8').trim().slice(0, PER_FILE_CHAR_LIMIT);
      }
      if (content) {
        const remaining = TOTAL_CHAR_LIMIT - totalChars;
        const trimmed = content.slice(0, remaining);
        results.push({ name: path.basename(filePath), filePath, content: trimmed });
        totalChars += trimmed.length;
      }
    } catch {
      // skip unreadable files
    }
  }

  return results;
}

export async function GET() {
  const files = discoverFiles();
  const folders = getRootFolders();
  return Response.json({ folder: folders.join(', '), files });
}
