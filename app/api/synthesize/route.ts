import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';
import { loadSelectedFiles } from '../resources/route';
import { loadVaultNotes } from '../vault/route';

const client = new Anthropic();

const DEPTH_CONFIG = {
  quick: {
    maxTokens: 2048,
    instruction:
      'Provide a concise synthesis of approximately 1500 words. Focus on the main themes and key agreements between the commentaries. Identify the passage, summarise each source briefly, then give a unified Reformed reading.',
  },
  standard: {
    maxTokens: 8192,
    instruction:
      'Provide a full synthesis up to 12,000 words. Include thorough analysis of themes, agreements, meaningful disagreements, theological implications, and a section on preaching/teaching application from a Reformed perspective.',
  },
  detailed: {
    maxTokens: 16000,
    instruction:
      'Provide a comprehensive, scholarly synthesis up to 18,000 words. Include direct quotations from the commentaries, detailed exegetical notes, extensive theological analysis covering all Reformed distinctives relevant to the passage, a survey of interpretive history, and thorough preaching application.',
  },
};

const SYSTEM_PROMPT = `You are a senior Reformed biblical scholar with deep expertise in exegesis, systematic theology, and church history. You write for pastors and serious Bible students preparing sermons and lessons.

When synthesising commentary excerpts you:
1. Identify the biblical passage(s) under discussion.
2. Detect and attribute each commentary source (use the author/title if discernible, otherwise label them Source A, Source B, etc.). When a source comes from a named file, always refer to it by that filename so it can be traced back.
3. Surface the major interpretive themes and where the commentators agree.
4. Note significant disagreements or differing emphases with charity.
5. Evaluate every insight through a confessionally Reformed theological lens, drawing on:
   - The sovereignty of God in creation, providence, and redemption.
   - The Five Solas: Sola Scriptura, Sola Gratia, Sola Fide, Solus Christus, Soli Deo Gloria.
   - Covenant theology as the controlling biblical-theological framework.
   - The Doctrines of Grace (TULIP) where the passage warrants it.
   - Christ-centred, redemptive-historical (Christocentric) interpretation.
   - Careful attention to original languages, literary context, and historical background.
6. Highlight where commentators affirm or depart from Reformed distinctives, with brief evaluation.
7. Close with a practical section on preaching and teaching application.

IMPORTANT — Bible citations: Always quote Scripture using the English Standard Version (ESV). When referencing a verse, include the ESV text in full where possible.

Format your response with clear markdown headings (##, ###), use bold for key terms, and write bullet lists where they aid clarity. Be scholarly yet pastorally warm.`;

export async function POST(request: NextRequest) {
  try {
    const { text, depth, selectedFilePaths = [], selectedVaultPaths = [] } = await request.json();

    if (!text?.trim()) {
      return new Response('No commentary text provided.', { status: 400 });
    }

    const config = DEPTH_CONFIG[depth as keyof typeof DEPTH_CONFIG];
    if (!config) {
      return new Response('Invalid analysis depth.', { status: 400 });
    }

    const [resourceFiles, vaultNotes] = await Promise.all([
      loadSelectedFiles(selectedFilePaths),
      loadVaultNotes(selectedVaultPaths),
    ]);

    const resourceSection = resourceFiles.length
      ? '\n\n--- SAVED RESOURCES (from your resources folder) ---\n\n' +
        resourceFiles.map((f) => `[Source file: ${f.name}]\n${f.content}`).join('\n\n')
      : '';

    const vaultSection = vaultNotes.length
      ? '\n\n--- PERSONAL STUDY NOTES (from your Obsidian vault) ---\n\n' +
        vaultNotes.map((n) => `[Vault note: ${n.name}]\n${n.text}`).join('\n\n')
      : '';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please synthesise the following biblical commentary excerpts from a Reformed theological perspective.\n\n${config.instruction}\n\n--- PASTED COMMENTARY ---\n\n${text}${resourceSection}${vaultSection}`,
        },
      ],
    });

    const result = message.content
      .filter((block) => block.type === 'text')
      .map((block) => (block as { type: 'text'; text: string }).text)
      .join('');

    return new Response(
      JSON.stringify({
        result,
        resourcesUsed: resourceFiles.map((f) => ({ name: f.name, filePath: f.filePath })),
        vaultNotesUsed: vaultNotes.map((n) => ({ name: n.name, filePath: n.filePath })),
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    console.error('Synthesis error:', msg);
    return new Response(`Failed to generate synthesis: ${msg}`, { status: 500 });
  }
}
