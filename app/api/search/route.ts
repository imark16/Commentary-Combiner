import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { NextRequest } from 'next/server';

export interface SearchResult {
  name: string;
  filePath: string;
  matchCount: number;
  snippets: string[];
}

interface CachedBook {
  filePath: string;
  name: string;
  text: string;
}

// Module-level state — lives as long as the dev server runs
let cache: CachedBook[] = [];
let indexed = 0;
let total = 0;
let building = false;

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

async function epubToText(filePath: string): Promise<string> {
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
    const htmlContent = await zip.file(opfDir + htmlFile)?.async('text');
    if (htmlContent) {
      text += stripHtml(htmlContent) + ' ';
      if (text.length > 80000) break;
    }
  }
  return text.slice(0, 80000);
}

function collectFiles(dir: string, results: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collectFiles(full, results);
    else if (/\.(epub|txt|md)$/i.test(entry.name)) results.push(full);
  }
  return results;
}

async function buildIndex(filePaths: string[]) {
  if (building) return;
  building = true;
  cache = [];
  indexed = 0;
  total = filePaths.length;

  for (const fp of filePaths) {
    try {
      const name = path.basename(fp);
      let text = '';
      if (/\.epub$/i.test(fp)) {
        text = await epubToText(fp);
      } else {
        text = fs.readFileSync(fp, 'utf-8').slice(0, 80000);
      }
      if (text.trim()) cache.push({ filePath: fp, name, text });
    } catch {
      // skip unreadable files
    }
    indexed++;
  }
  building = false;
}

export async function GET() {
  return Response.json({ indexed, total, building, ready: !building && indexed > 0 && indexed === total });
}

export async function POST(request: NextRequest) {
  const body = await request.json();

  // Trigger index build
  if (body.action === 'build') {
    const folder = process.env.RESOURCES_FOLDER?.replace(/^~/, process.env.HOME || '');
    if (!folder || !fs.existsSync(folder)) {
      return Response.json({ error: 'No resources folder configured.' }, { status: 400 });
    }
    const files = collectFiles(folder);
    buildIndex(files); // fire and forget
    return Response.json({ started: true, total: files.length });
  }

  // Search
  const { query } = body;
  if (!query?.trim()) return Response.json({ results: [] });

  if (cache.length === 0) {
    return Response.json({ results: [], notIndexed: true });
  }

  const terms = query
    .toLowerCase()
    .split(/\s+/)
    .filter((t: string) => t.length > 2);

  if (terms.length === 0) return Response.json({ results: [] });

  const results: SearchResult[] = [];

  for (const book of cache) {
    const lowerText = book.text.toLowerCase();
    let matchCount = 0;
    const snippets: string[] = [];

    for (const term of terms) {
      let pos = 0;
      let firstIdx = -1;
      while ((pos = lowerText.indexOf(term, pos)) !== -1) {
        if (firstIdx === -1) firstIdx = pos;
        matchCount++;
        pos += term.length;
      }
      if (firstIdx !== -1 && snippets.length < 3) {
        const start = Math.max(0, firstIdx - 120);
        const end = Math.min(book.text.length, firstIdx + term.length + 220);
        const snippet = book.text.slice(start, end).replace(/\s+/g, ' ').trim();
        snippets.push((start > 0 ? '…' : '') + snippet + (end < book.text.length ? '…' : ''));
      }
    }

    if (matchCount > 0) {
      results.push({ name: book.name, filePath: book.filePath, matchCount, snippets });
    }
  }

  results.sort((a, b) => b.matchCount - a.matchCount);
  return Response.json({ results: results.slice(0, 50) });
}
