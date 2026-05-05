'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

type Depth = 'quick' | 'standard' | 'detailed';

interface ResourceFileInfo {
  name: string;
  filePath: string;
}

const DEPTHS: { id: Depth; label: string; description: string; meta: string }[] = [
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

function fileUrl(filePath: string) {
  return 'file://' + filePath.replace(/ /g, '%20');
}

export default function Home() {
  const [text, setText] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [synthesis, setSynthesis] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resourceFiles, setResourceFiles] = useState<ResourceFileInfo[]>([]);
  const [resourceFolder, setResourceFolder] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [resourcesUsed, setResourcesUsed] = useState<ResourceFileInfo[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch('/api/resources')
      .then((r) => r.json())
      .then(({ folder, files }) => {
        setResourceFolder(folder);
        setResourceFiles(files ?? []);
      })
      .catch(() => {});
  }, []);

  const toggleFile = (filePath: string) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev);
      next.has(filePath) ? next.delete(filePath) : next.add(filePath);
      return next;
    });
  };

  const selectAll = () => setSelectedPaths(new Set(resourceFiles.map((f) => f.filePath)));
  const clearAll = () => setSelectedPaths(new Set());

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) {
      setError('Please paste some commentary text first.');
      return;
    }

    setError('');
    setSynthesis('');
    setResourcesUsed([]);
    setLoading(true);
    abortRef.current = new AbortController();

    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          depth,
          selectedFilePaths: Array.from(selectedPaths),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || 'Request failed.');
      }

      const { result, resourcesUsed: used } = await res.json();
      setSynthesis(result);
      setResourcesUsed(used ?? []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, [text, depth, selectedPaths]);

  const handleStop = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const handleClear = () => {
    setText('');
    setSynthesis('');
    setError('');
    setResourcesUsed([]);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">Commentary-Combiner</h1>
          <p className="text-sm font-semibold text-[#c0392b]">#TruthMattersMost</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* Collapsible resources panel */}
        <section className="bg-green-50 rounded-xl border border-green-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-green-900">Resources Library</span>
              {resourceFiles.length > 0 && (
                <span className="text-xs bg-green-200 text-green-800 rounded-full px-2 py-0.5 font-medium">
                  {resourceFiles.length} books
                  {selectedPaths.size > 0 && ` · ${selectedPaths.size} selected`}
                </span>
              )}
            </div>
            <span className="text-green-700 text-lg">{panelOpen ? '▲' : '▼'}</span>
          </button>

          {panelOpen && (
            <div className="px-5 pb-5 border-t border-green-200">
              {resourceFolder ? (
                <>
                  <p className="text-xs text-green-700 font-mono break-all mt-3 mb-3">
                    {resourceFolder}
                  </p>
                  {resourceFiles.length > 0 ? (
                    <>
                      <div className="flex gap-3 mb-3">
                        <button
                          onClick={selectAll}
                          className="text-xs text-green-800 underline hover:text-green-600"
                        >
                          Select all
                        </button>
                        <button
                          onClick={clearAll}
                          className="text-xs text-green-800 underline hover:text-green-600"
                        >
                          Clear all
                        </button>
                        {selectedPaths.size > 0 && (
                          <span className="text-xs text-green-700 ml-auto">
                            {selectedPaths.size} of {resourceFiles.length} selected for synthesis
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                        {resourceFiles.map((f) => (
                          <label
                            key={f.filePath}
                            className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer transition-colors ${
                              selectedPaths.has(f.filePath)
                                ? 'bg-green-600 text-white border-green-700'
                                : 'bg-white text-green-800 border-green-300 hover:bg-green-100'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={selectedPaths.has(f.filePath)}
                              onChange={() => toggleFile(f.filePath)}
                            />
                            {f.name}
                          </label>
                        ))}
                      </div>
                      <p className="text-xs text-green-600 mt-3">
                        Click a book to include it in the synthesis. Click the name to open it.
                      </p>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {resourceFiles.map((f) => (
                          <a
                            key={f.filePath}
                            href={fileUrl(f.filePath)}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-green-700 underline hover:text-green-900"
                          >
                            {f.name}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-green-700 mt-3">
                      No .txt, .md, or .epub files found in folder or subfolders.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-green-700 mt-3">
                  No resources folder configured. Add{' '}
                  <code className="bg-green-100 px-1 rounded">RESOURCES_FOLDER=~/your/folder</code>{' '}
                  to <code className="bg-green-100 px-1 rounded">.env.local</code>.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Input card */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Commentary Input</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste your commentary exports below. Select books from the Resources Library above to
            include them in the synthesis. All Scripture citations will use the ESV.
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

          <div className="flex gap-3 mt-6">
            <button
              onClick={loading ? handleStop : handleGenerate}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${
                loading ? 'bg-gray-500 hover:bg-gray-600' : 'bg-[#c0392b] hover:bg-[#a93226]'
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

            {resourcesUsed.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">Books used:</span>
                {resourcesUsed.map((f) => (
                  <a
                    key={f.filePath}
                    href={fileUrl(f.filePath)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-100 transition-colors"
                  >
                    {f.name}
                  </a>
                ))}
              </div>
            )}

            {loading && !synthesis && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-[#c0392b] border-t-transparent rounded-full animate-spin" />
                Generating synthesis…
              </div>
            )}

            {synthesis && (
              <article className="prose prose-sm max-w-none prose-headings:text-gray-900 prose-headings:font-bold prose-p:text-gray-700 prose-li:text-gray-700 prose-strong:text-gray-900 prose-a:text-[#c0392b]">
                <ReactMarkdown>{synthesis}</ReactMarkdown>
              </article>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
