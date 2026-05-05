import Anthropic from '@anthropic-ai/sdk';
import { NextRequest } from 'next/server';

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
2. Detect and attribute each commentary source (use the author/title if discernible, otherwise label them Source A, Source B, etc.).
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

Format your response with clear markdown headings (##, ###), use bold for key terms, and write bullet lists where they aid clarity. Be scholarly yet pastorally warm.`;

export async function POST(request: NextRequest) {
  try {
    const { text, depth } = await request.json();

    if (!text?.trim()) {
      return new Response('No commentary text provided.', { status: 400 });
    }

    const config = DEPTH_CONFIG[depth as keyof typeof DEPTH_CONFIG];
    if (!config) {
      return new Response('Invalid analysis depth.', { status: 400 });
    }

    const stream = await client.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: config.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Please synthesise the following biblical commentary excerpts from a Reformed theological perspective.\n\n${config.instruction}\n\n---\n\n${text}`,
        },
      ],
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === 'content_block_delta' &&
              chunk.delta.type === 'text_delta'
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Streaming error.';
          controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error.';
    console.error('Synthesis error:', msg);
    return new Response(`Failed to generate synthesis: ${msg}`, {
      status: 500,
    });
  }
}
