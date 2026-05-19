import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { NextRequest } from 'next/server';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { normalizePassage, buildVaultPath } from '../../../lib/passage';

function getSaveFolder(): string {
  const configured = process.env.SAVE_FOLDER?.replace(/^~/, process.env.HOME || '');
  const folder = configured || path.join(process.env.HOME || '', 'Documents', 'Commentary Syntheses');
  if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });
  return folder;
}

function getVaultRoot(): string {
  const v = process.env.OBSIDIAN_VAULT;
  if (!v) return '';
  return v.replace(/^~/, process.env.HOME || '');
}

function timestamp(): string {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
    '-',
    String(d.getHours()).padStart(2, '0'),
    String(d.getMinutes()).padStart(2, '0'),
    String(d.getSeconds()).padStart(2, '0'),
  ].join('');
}

function parseInline(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
    } else {
      runs.push(new TextRun({ text: part }));
    }
  }
  return runs.length ? runs : [new TextRun({ text: '' })];
}

async function buildDocx(markdown: string): Promise<Buffer> {
  const lines = markdown.split('\n');
  const children: Paragraph[] = [];
  for (const line of lines) {
    if (line.startsWith('#### ')) {
      children.push(new Paragraph({ text: line.slice(5).trim(), heading: HeadingLevel.HEADING_4 }));
    } else if (line.startsWith('### ')) {
      children.push(new Paragraph({ text: line.slice(4).trim(), heading: HeadingLevel.HEADING_3 }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ text: line.slice(3).trim(), heading: HeadingLevel.HEADING_2 }));
    } else if (line.startsWith('# ')) {
      children.push(new Paragraph({ text: line.slice(2).trim(), heading: HeadingLevel.HEADING_1 }));
    } else if (/^[-*] /.test(line)) {
      children.push(new Paragraph({ children: parseInline(line.slice(2).trim()), bullet: { level: 0 } }));
    } else if (line.trim()) {
      children.push(new Paragraph({ children: parseInline(line.trim()) }));
    } else {
      children.push(new Paragraph({ text: '' }));
    }
  }
  const doc = new Document({ sections: [{ children }] });
  return Packer.toBuffer(doc);
}

// POST { result, passage?, sessionNumber? } → save markdown
// POST { action: 'word', mdPath } → convert to .docx and open
export async function POST(request: NextRequest) {
  const body = await request.json();

  if (body.action === 'word') {
    const { mdPath } = body;
    if (!mdPath || !fs.existsSync(mdPath)) {
      return Response.json({ error: 'Markdown file not found.' }, { status: 404 });
    }
    try {
      const markdown = fs.readFileSync(mdPath, 'utf-8');
      const docxBuf = await buildDocx(markdown);
      const docxPath = mdPath.replace(/\.md$/, '.docx');
      fs.writeFileSync(docxPath, docxBuf);
      await new Promise<void>((resolve) => exec(`open "${docxPath.replace(/"/g, '\\"')}"`, () => resolve()));
      return Response.json({ ok: true, docxPath });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      return Response.json({ error: msg }, { status: 500 });
    }
  }

  const { result, passage, sessionNumber } = body;
  if (!result?.trim()) {
    return Response.json({ error: 'No content to save.' }, { status: 400 });
  }

  try {
    // If passage + session provided, save to vault with structured naming
    if (passage?.trim() && sessionNumber?.trim()) {
      const vaultRoot = getVaultRoot();
      if (vaultRoot && fs.existsSync(vaultRoot)) {
        const info = normalizePassage(passage);
        const { folder, filename, fullPath } = buildVaultPath(
          vaultRoot,
          info.bookName,
          sessionNumber,
          info.passageCode,
          info.passageName,
          'Synthesis',
        );
        fs.mkdirSync(folder, { recursive: true });
        fs.writeFileSync(fullPath, result, 'utf-8');
        return Response.json({ ok: true, mdPath: fullPath, filename, folder });
      }
    }

    // Fallback: save to Documents/Commentary Syntheses with timestamp
    const folder = getSaveFolder();
    const filename = `synthesis-${timestamp()}.md`;
    const mdPath = path.join(folder, filename);
    fs.writeFileSync(mdPath, result, 'utf-8');
    return Response.json({ ok: true, mdPath, filename, folder });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
