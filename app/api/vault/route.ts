import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { NextRequest } from 'next/server';

export interface VaultNote {
  filePath: string;
  name: string;
  relativePath: string;
  text: string;
}

interface NoteResult {
  note: VaultNote;
  matchCount: number;
  snippets: string[];
}

// Module-level cache — rebuilt when server restarts
let vaultCache: VaultNote[] | null = null;
let cacheBuilding = false;

function getVaultPath(): string {
  const v = process.env.OBSIDIAN_VAULT;
  if (!v) return '';
  return v.replace(/^~/, process.env.HOME || '');
}

function stripFrontmatter(content: string): string {
  if (content.startsWith('---')) {
    const end = content.indexOf('---', 3);
    if (end !== -1) return content.slice(end + 3).trim();
  }
  return content.trim();
}

function collectNotes(dir: string, root: string, results: VaultNote[] = []): VaultNote[] {
  let entries: fs.Dirent[];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
  catch { return results; }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue; // skip .obsidian, .trash, etc.
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectNotes(full, root, results);
    } else if (/\.md$/i.test(entry.name)) {
      try {
        const raw = fs.readFileSync(full, 'utf-8');
        const text = stripFrontmatter(raw).slice(0, 25000);
        if (text.length > 20) {
          results.push({
            filePath: full,
            name: entry.name.replace(/\.md$/i, ''),
            relativePath: path.relative(root, full),
            text,
          });
        }
      } catch { /* skip */ }
    }
  }
  return results;
}

async function ensureCache(): Promise<VaultNote[]> {
  if (vaultCache) return vaultCache;
  if (cacheBuilding) {
    while (cacheBuilding) await new Promise((r) => setTimeout(r, 100));
    return vaultCache ?? [];
  }
  cacheBuilding = true;
  const vaultPath = getVaultPath();
  if (vaultPath && fs.existsSync(vaultPath)) {
    vaultCache = collectNotes(vaultPath, vaultPath);
  } else {
    vaultCache = [];
  }
  cacheBuilding = false;
  return vaultCache;
}

function rankNotes(notes: VaultNote[], query: string): NoteResult[] {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 2);
  if (!terms.length) return [];

  const results: NoteResult[] = [];
  for (const note of notes) {
    const lowerText = note.text.toLowerCase();
    const lowerName = note.name.toLowerCase();
    let matchCount = 0;
    const snippets: string[] = [];

    for (const term of terms) {
      if (lowerName.includes(term)) matchCount += 5;
      let pos = 0, firstIdx = -1;
      while ((pos = lowerText.indexOf(term, pos)) !== -1) {
        if (firstIdx === -1) firstIdx = pos;
        matchCount++;
        pos += term.length;
      }
      if (firstIdx !== -1 && snippets.length < 2) {
        const start = Math.max(0, firstIdx - 100);
        const end = Math.min(note.text.length, firstIdx + term.length + 220);
        snippets.push((start > 0 ? '…' : '') + note.text.slice(start, end).replace(/\s+/g, ' ').trim() + '…');
      }
    }
    if (matchCount > 0) results.push({ note, matchCount, snippets });
  }
  return results.sort((a, b) => b.matchCount - a.matchCount);
}

// Load specific vault notes by file path (used by synthesize route)
export async function loadVaultNotes(filePaths: string[]): Promise<VaultNote[]> {
  if (!filePaths.length) return [];
  const notes: VaultNote[] = [];
  const vaultPath = getVaultPath();
  for (const fp of filePaths) {
    try {
      const raw = fs.readFileSync(fp, 'utf-8');
      const text = stripFrontmatter(raw).slice(0, 15000);
      if (text.length > 20) {
        notes.push({
          filePath: fp,
          name: path.basename(fp, '.md'),
          relativePath: path.relative(vaultPath, fp),
          text,
        });
      }
    } catch { /* skip */ }
  }
  return notes;
}

export async function GET() {
  const vaultPath = getVaultPath();
  const connected = !!vaultPath && fs.existsSync(vaultPath);
  return Response.json({
    connected,
    vaultPath,
    noteCount: vaultCache?.length ?? null,
    cacheBuilding,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const client = new Anthropic();

  // ── Search notes ──
  if (body.action === 'search') {
    const notes = await ensureCache();
    const results = rankNotes(notes, body.query ?? '').slice(0, 40);
    return Response.json({
      results: results.map((r) => ({
        name: r.note.name,
        filePath: r.note.filePath,
        relativePath: r.note.relativePath,
        matchCount: r.matchCount,
        snippets: r.snippets,
      })),
      totalNotes: notes.length,
    });
  }

  // ── Ask a question ──
  if (body.action === 'ask') {
    const notes = await ensureCache();
    const relevant = rankNotes(notes, body.question ?? '').slice(0, 10);

    if (!relevant.length) {
      return Response.json({
        answer: "I couldn't find any relevant notes in your vault for that question.",
        notesUsed: [],
      });
    }

    const context = relevant
      .map((r) => `### ${r.note.name}\n\n${r.note.text.slice(0, 4000)}`)
      .join('\n\n---\n\n');

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      system: `You are a helpful assistant answering questions based on the user's personal Obsidian vault — a collection of their own theological study notes, Bible study reflections, and sermon preparation material. Answer faithfully and specifically based on what the notes contain. Where helpful, quote or paraphrase the notes directly. Always note which note(s) informed each part of your answer.`,
      messages: [{
        role: 'user',
        content: `Based on my personal vault notes below, please answer this question:\n\n${body.question}\n\n---\n\n${context}`,
      }],
    });

    const answer = message.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return Response.json({
      answer,
      notesUsed: relevant.map((r) => ({ name: r.note.name, filePath: r.note.filePath })),
    });
  }

  return Response.json({ error: 'Unknown action.' }, { status: 400 });
}
