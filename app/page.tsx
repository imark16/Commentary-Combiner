'use client';

import { useState, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';

type Depth = 'quick' | 'standard' | 'detailed';

const DEPTHS: {
  id: Depth;
  label: string;
  description: string;
  meta: string;
}[] = [
  {
    id: 'quick',
    label: 'Quick',
    description: 'Basic themes and key agreements',
    meta: '~1 500 words · Best for 2–5 commentaries',
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'Full synthesis (Recommended)',
    meta: 'Up to 12 000 words · Good for most uses',
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'Comprehensive with quotes',
    meta: 'Up to 18 000 words · Best for large inputs (15 000+ words)',
  },
];

export default function Home() {
  const [text, setText] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [synthesis, setSynthesis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      setError('Please paste some commentary text first.');
      return;
    }

    setError('');
    setSynthesis('');
    setLoading(true);

    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, depth }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Request failed.');
      }

      const { result } = await res.json();
      setSynthesis(result);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [text, depth]);

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    setText('');
    setSynthesis('');
    setError('');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Commentary Synthesis</h1>
            <p className="text-sm font-semibold text-[#c0392b]">#TruthMattersMost</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Input card */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Commentary Input</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste your Logos commentary exports below. You can include as many commentaries as you
            like. The tool will automatically detect sources and synthesise the insights from a
            Reformed theological perspective.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your commentary exports here…"
            className="w-full h-64 p-4 text-sm text-gray-800 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#c0392b]/40 focus:border-[#c0392b] placeholder-gray-400"
            disabled={loading}
          />
          <div className="text-right text-xs text-gray-400 mt-1">
            {text.length.toLocaleString()} characters
          </div>

          {/* Depth selector */}
          <h3 className="text-base font-bold text-gray-900 mt-5 mb-3">Analysis Depth</h3>
          <div className="space-y-2">
            {DEPTHS.map((d) => (
              <label
                key={d.id}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  depth === d.id
                    ? 'border-[#c0392b] bg-red-50'
                    : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <input
                  type="radio"
                  name="depth"
                  value={d.id}
                  checked={depth === d.id}
                  onChange={() => setDepth(d.id)}
                  className="mt-0.5 accent-[#c0392b]"
                  disabled={loading}
                />
                <div>
                  <span className="font-semibold text-gray-900">{d.label}</span>
                  <span className="text-gray-700"> – {d.description}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{d.meta}</p>
                </div>
              </label>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={loading ? handleStop : handleGenerate}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                loading
                  ? 'bg-gray-500 hover:bg-gray-600'
                  : 'bg-[#c0392b] hover:bg-[#a93226]'
              }`}
            >
              {loading ? 'Stop' : 'Generate Synthesis'}
            </button>
            <button
              onClick={handleClear}
              disabled={loading}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50"
            >
              Clear Input
            </button>
          </div>
        </section>

        {/* Results card */}
        {(synthesis || loading) && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Reformed Synthesis</h2>
              {synthesis && !loading && (
                <button
                  onClick={() => navigator.clipboard.writeText(synthesis)}
                  className="text-xs text-[#c0392b] hover:text-[#a93226] font-medium"
                >
                  Copy to clipboard
                </button>
              )}
            </div>

            {loading && !synthesis && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-[#c0392b] border-t-transparent rounded-full animate-spin" />
                Generating synthesis…
              </div>
            )}

            {synthesis && (
              <>
                <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-[#c0392b]">
                  <ReactMarkdown>{synthesis}</ReactMarkdown>
                </article>
                {loading && (
                  <span className="inline-block w-2 h-4 bg-[#c0392b] animate-pulse ml-0.5" />
                )}
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
