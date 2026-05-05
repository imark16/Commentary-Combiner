'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

type Depth = 'quick' | 'standard' | 'detailed';
type PanelTab = 'browse' | 'search';

interface ResourceFileInfo {
  name: string;
  filePath: string;
}

interface SearchResult {
  name: string;
  filePath: string;
  matchCount: number;
  snippets: string[];
}

interface IndexStatus {
  indexed: number;
  total: number;
  building: boolean;
  ready: boolean;
}

const DEPTHS: { id: Depth; label: string; description: string; meta: string }[] = [
  { id: 'quick', label: 'Quick', description: 'Basic themes and key agreements', meta: '~1 500 words · Best for 2–5 commentaries' },
  { id: 'standard', label: 'Standard', description: 'Full synthesis (Recommended)', meta: 'Up to 12 000 words · Good for most uses' },
  { id: 'detailed', label: 'Detailed', description: 'Comprehensive with quotes', meta: 'Up to 18 000 words · Best for large inputs (15 000+ words)' },
];

function fileUrl(fp: string) {
  return 'file://' + fp.replace(/ /g, '%20');
}

export default function Home() {
  // Synthesis
  const [text, setText] = useState('');
  const [depth, setDepth] = useState<Depth>('standard');
  const [synthesis, setSynthesis] = useState('');
  const [loadingGen, setLoadingGen] = useState(false);
  const [genError, setGenError] = useState('');
  const [resourcesUsed, setResourcesUsed] = useState<ResourceFileInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // Resources panel
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<PanelTab>('browse');
  const [allFiles, setAllFiles] = useState<ResourceFileInfo[]>([]);
  const [resourceFolder, setResourceFolder] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());

  // Search
  const [indexStatus, setIndexStatus] = useState<IndexStatus>({ indexed: 0, total: 0, building: false, ready: false });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load file list
  useEffect(() => {
    fetch('/api/resources')
      .then((r) => r.json())
      .then(({ folder, files }) => { setResourceFolder(folder); setAllFiles(files ?? []); })
      .catch(() => {});
    fetch('/api/search')
      .then((r) => r.json())
      .then((s: IndexStatus) => setIndexStatus(s))
      .catch(() => {});
  }, []);

  // Poll while indexing
  useEffect(() => {
    if (indexStatus.building) {
      pollRef.current = setInterval(async () => {
        const r = await fetch('/api/search').then((x) => x.json());
        setIndexStatus(r);
        if (!r.building) {
          clearInterval(pollRef.current!);
        }
      }, 1500);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [indexStatus.building]);

  const handleBuildIndex = async () => {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'build' }) });
    const data = await res.json();
    if (data.error) { setSearchError(data.error); return; }
    setIndexStatus((s) => ({ ...s, building: true, total: data.total }));
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchError('');
    setSearchResults([]);
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery }) });
      const data = await res.json();
      if (data.notIndexed) { setSearchError('Index not built yet. Click "Build Index" first.'); }
      else if (data.error) { setSearchError(data.error); }
      else { setSearchResults(data.results ?? []); }
    } catch { setSearchError('Search failed. Please try again.'); }
    finally { setSearching(false); }
  };

  const toggleFile = (fp: string) =>
    setSelectedPaths((prev) => { const n = new Set(prev); n.has(fp) ? n.delete(fp) : n.add(fp); return n; });

  const selectAll = () => setSelectedPaths(new Set(allFiles.map((f) => f.filePath)));
  const clearAll = () => setSelectedPaths(new Set());

  const addSearchResult = (fp: string) =>
    setSelectedPaths((prev) => new Set([...prev, fp]));

  const filteredFiles = allFiles.filter((f) =>
    f.name.toLowerCase().includes(nameFilter.toLowerCase())
  );

  const handleGenerate = useCallback(async () => {
    if (!text.trim()) { setGenError('Please paste some commentary text first.'); return; }
    setGenError(''); setSynthesis(''); setResourcesUsed([]); setLoadingGen(true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, depth, selectedFilePaths: Array.from(selectedPaths) }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(await res.text() || 'Request failed.');
      const { result, resourcesUsed: used } = await res.json();
      setSynthesis(result);
      setResourcesUsed(used ?? []);
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError')
        setGenError(err.message || 'Something went wrong. Please try again.');
    } finally { setLoadingGen(false); }
  }, [text, depth, selectedPaths]);

  const handleClear = () => { setText(''); setSynthesis(''); setGenError(''); setResourcesUsed([]); };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">Commentary-Combiner</h1>
          <p className="text-sm font-semibold text-[#c0392b]">#TruthMattersMost</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ── Resources Library ── */}
        <section className="bg-green-50 rounded-xl border border-green-200 shadow-sm overflow-hidden">
          {/* Collapsible header */}
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-green-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="text-base font-bold text-green-900">Resources Library</span>
              <span className="text-xs bg-green-200 text-green-800 rounded-full px-2 py-0.5 font-medium">
                {allFiles.length} books{selectedPaths.size > 0 && ` · ${selectedPaths.size} selected`}
              </span>
              {indexStatus.ready && (
                <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5 font-medium">
                  indexed
                </span>
              )}
            </div>
            <span className="text-green-700">{panelOpen ? '▲' : '▼'}</span>
          </button>

          {panelOpen && (
            <div className="border-t border-green-200">
              {/* Tab bar */}
              <div className="flex border-b border-green-200">
                {(['browse', 'search'] as PanelTab[]).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${
                      activeTab === tab
                        ? 'border-b-2 border-green-700 text-green-900 bg-white'
                        : 'text-green-700 hover:bg-green-100'
                    }`}
                  >
                    {tab === 'browse' ? 'Browse All' : 'Search Content'}
                  </button>
                ))}
              </div>

              {/* ── Browse tab ── */}
              {activeTab === 'browse' && (
                <div className="p-5">
                  {resourceFolder && (
                    <p className="text-xs text-green-700 font-mono break-all mb-3">{resourceFolder}</p>
                  )}
                  <input
                    type="text"
                    value={nameFilter}
                    onChange={(e) => setNameFilter(e.target.value)}
                    placeholder="Filter by filename…"
                    className="w-full text-sm px-3 py-2 border border-green-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-400 mb-3"
                  />
                  <div className="flex items-center gap-4 mb-3">
                    <button onClick={selectAll} className="text-xs text-green-800 underline hover:text-green-600">Select all</button>
                    <button onClick={clearAll} className="text-xs text-green-800 underline hover:text-green-600">Clear all</button>
                    {selectedPaths.size > 0 && (
                      <span className="text-xs text-green-700 ml-auto">{selectedPaths.size} selected for synthesis</span>
                    )}
                  </div>
                  {filteredFiles.length > 0 ? (
                    <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
                      {filteredFiles.map((f) => (
                        <label
                          key={f.filePath}
                          className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer transition-colors ${
                            selectedPaths.has(f.filePath)
                              ? 'bg-green-600 text-white border-green-700'
                              : 'bg-white text-green-800 border-green-300 hover:bg-green-100'
                          }`}
                        >
                          <input type="checkbox" className="sr-only" checked={selectedPaths.has(f.filePath)} onChange={() => toggleFile(f.filePath)} />
                          <a href={fileUrl(f.filePath)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="underline opacity-70 hover:opacity-100">↗</a>
                          {f.name}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-green-700">No books match "{nameFilter}".</p>
                  )}
                </div>
              )}

              {/* ── Search tab ── */}
              {activeTab === 'search' && (
                <div className="p-5 space-y-4">
                  {/* Index status */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {indexStatus.building ? (
                      <div className="flex items-center gap-2 text-sm text-green-800">
                        <span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                        Indexing {indexStatus.indexed} of {indexStatus.total} books…
                      </div>
                    ) : indexStatus.ready ? (
                      <span className="text-sm text-green-800 font-medium">
                        ✓ {indexStatus.indexed} books indexed
                      </span>
                    ) : (
                      <span className="text-sm text-green-700">
                        Index not built yet — search requires reading all epub content.
                      </span>
                    )}
                    <button
                      onClick={handleBuildIndex}
                      disabled={indexStatus.building}
                      className="ml-auto text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
                    >
                      {indexStatus.ready ? 'Rebuild Index' : 'Build Index'}
                    </button>
                  </div>

                  {indexStatus.ready && (
                    <>
                      {/* Progress bar */}
                      <div className="w-full bg-green-200 rounded-full h-1.5">
                        <div className="bg-green-600 h-1.5 rounded-full transition-all" style={{ width: '100%' }} />
                      </div>

                      {/* Search input */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                          placeholder="Search topics, e.g. justification, election, covenant…"
                          className="flex-1 text-sm px-3 py-2 border border-green-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-400"
                        />
                        <button
                          onClick={handleSearch}
                          disabled={searching || !searchQuery.trim()}
                          className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors"
                        >
                          {searching ? '…' : 'Search'}
                        </button>
                      </div>
                    </>
                  )}

                  {searchError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{searchError}</p>
                  )}

                  {/* Search results */}
                  {searchResults.length > 0 && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      <p className="text-xs text-green-700 font-medium">{searchResults.length} books matched</p>
                      {searchResults.map((r) => (
                        <div key={r.filePath} className="bg-white border border-green-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <a href={fileUrl(r.filePath)} target="_blank" rel="noreferrer" className="text-sm font-semibold text-green-900 hover:underline">
                                {r.name}
                              </a>
                              <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">
                                {r.matchCount} match{r.matchCount !== 1 ? 'es' : ''}
                              </span>
                            </div>
                            <button
                              onClick={() => addSearchResult(r.filePath)}
                              className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${
                                selectedPaths.has(r.filePath)
                                  ? 'bg-green-600 text-white border-green-700'
                                  : 'bg-white text-green-700 border-green-400 hover:bg-green-50'
                              }`}
                            >
                              {selectedPaths.has(r.filePath) ? '✓ Selected' : '+ Select'}
                            </button>
                          </div>
                          {r.snippets.map((s, i) => (
                            <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 leading-relaxed">
                              {s}
                            </p>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {searchResults.length === 0 && !searching && searchQuery && !searchError && (
                    <p className="text-sm text-green-700">No books matched "{searchQuery}".</p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── Commentary Input ── */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Commentary Input</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste your commentary exports below. Select books from the Resources Library above to
            include them alongside your pasted text. All Scripture citations will use the ESV.
          </p>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste your commentary exports here…"
            className="w-full h-64 p-4 text-sm text-gray-800 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#c0392b]/40 focus:border-[#c0392b] placeholder-gray-400"
            disabled={loadingGen}
          />
          <div className="text-right text-xs text-gray-400 mt-1">{text.length.toLocaleString()} characters</div>

          <h3 className="text-base font-bold text-gray-900 mt-5 mb-3">Analysis Depth</h3>
          <div className="space-y-2">
            {DEPTHS.map((d) => (
              <label
                key={d.id}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                  depth === d.id ? 'border-[#c0392b] bg-red-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <input type="radio" name="depth" value={d.id} checked={depth === d.id} onChange={() => setDepth(d.id)} className="mt-0.5 accent-[#c0392b]" disabled={loadingGen} />
                <div>
                  <span className="font-semibold text-gray-900">{d.label}</span>
                  <span className="text-gray-700"> – {d.description}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{d.meta}</p>
                </div>
              </label>
            ))}
          </div>

          {genError && (
            <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{genError}</p>
          )}

          <div className="flex gap-3 mt-6">
            <button
              onClick={loadingGen ? () => { abortRef.current?.abort(); setLoadingGen(false); } : handleGenerate}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${loadingGen ? 'bg-gray-500 hover:bg-gray-600' : 'bg-[#c0392b] hover:bg-[#a93226]'}`}
            >
              {loadingGen ? 'Stop' : 'Generate Synthesis'}
            </button>
            <button onClick={handleClear} disabled={loadingGen} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50">
              Clear Input
            </button>
          </div>
        </section>

        {/* ── Results ── */}
        {(synthesis || loadingGen) && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Reformed Synthesis</h2>
              {synthesis && !loadingGen && (
                <button onClick={() => navigator.clipboard.writeText(synthesis)} className="text-xs text-[#c0392b] hover:text-[#a93226] font-medium">
                  Copy to clipboard
                </button>
              )}
            </div>

            {resourcesUsed.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 items-center">
                <span className="text-xs text-gray-500">Books used:</span>
                {resourcesUsed.map((f) => (
                  <a key={f.filePath} href={fileUrl(f.filePath)} target="_blank" rel="noreferrer" className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-100 transition-colors">
                    {f.name}
                  </a>
                ))}
              </div>
            )}

            {loadingGen && !synthesis && (
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
