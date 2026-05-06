'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';

type Depth = 'quick' | 'standard' | 'detailed';
type LibTab = 'browse' | 'search';
type VaultTab = 'find' | 'ask';

interface FileInfo { name: string; filePath: string; }
interface NoteInfo { name: string; filePath: string; relativePath: string; matchCount: number; snippets: string[]; }
interface LibResult extends FileInfo { matchCount: number; snippets: string[]; }
interface IndexStatus { indexed: number; total: number; building: boolean; ready: boolean; builtAt?: string | null; }
interface VaultStatus { connected: boolean; vaultPath: string; noteCount: number | null; cacheBuilding: boolean; }

const DEPTHS: { id: Depth; label: string; description: string; meta: string }[] = [
  { id: 'quick',    label: 'Quick',    description: 'Basic themes and key agreements',  meta: '~1 500 words · Best for 2–5 commentaries' },
  { id: 'standard', label: 'Standard', description: 'Full synthesis (Recommended)',     meta: 'Up to 12 000 words · Good for most uses' },
  { id: 'detailed', label: 'Detailed', description: 'Comprehensive with quotes',        meta: 'Up to 18 000 words · Best for large inputs (15 000+ words)' },
];

async function openFile(filePath: string) {
  await fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ filePath }) });
}

function OpenLink({ filePath, className, children }: { filePath: string; className?: string; children: React.ReactNode }) {
  return (
    <button onClick={() => openFile(filePath)} className={className} title={filePath}>
      {children}
    </button>
  );
}

export default function Home() {
  // ── Synthesis ──
  const [text, setText]             = useState('');
  const [depth, setDepth]           = useState<Depth>('standard');
  const [synthesis, setSynthesis]   = useState('');
  const [loadingGen, setLoadingGen] = useState(false);
  const [genError, setGenError]     = useState('');
  const [resourcesUsed, setResourcesUsed]   = useState<FileInfo[]>([]);
  const [vaultNotesUsed, setVaultNotesUsed] = useState<FileInfo[]>([]);
  const abortRef = useRef<AbortController | null>(null);

  // ── Save / Word export ──
  const [savedMdPath, setSavedMdPath]   = useState('');
  const [savedFilename, setSavedFilename] = useState('');
  const [saveError, setSaveError]       = useState('');
  const [exportingWord, setExportingWord] = useState(false);
  const [wordDone, setWordDone]         = useState(false);

  // ── Resources Library ──
  const [libOpen, setLibOpen]           = useState(false);
  const [libTab, setLibTab]             = useState<LibTab>('browse');
  const [allFiles, setAllFiles]         = useState<FileInfo[]>([]);
  const [resourceFolder, setResourceFolder] = useState('');
  const [nameFilter, setNameFilter]     = useState('');
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [idxStatus, setIdxStatus]       = useState<IndexStatus>({ indexed: 0, total: 0, building: false, ready: false });
  const [libQuery, setLibQuery]         = useState('');
  const [libResults, setLibResults]     = useState<LibResult[]>([]);
  const [libSearching, setLibSearching] = useState(false);
  const [libSearchErr, setLibSearchErr] = useState('');
  const libPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Obsidian Vault ──
  const [vaultOpen, setVaultOpen]       = useState(false);
  const [vaultTab, setVaultTab]         = useState<VaultTab>('find');
  const [vaultStatus, setVaultStatus]   = useState<VaultStatus>({ connected: false, vaultPath: '', noteCount: null, cacheBuilding: false });
  const [selectedVaultPaths, setSelectedVaultPaths] = useState<Set<string>>(new Set());
  const [vaultFindQuery, setVaultFindQuery] = useState('');
  const [vaultFindResults, setVaultFindResults] = useState<NoteInfo[]>([]);
  const [vaultFinding, setVaultFinding] = useState(false);
  const [vaultFindErr, setVaultFindErr] = useState('');
  const [vaultAskQ, setVaultAskQ]       = useState('');
  const [vaultAnswer, setVaultAnswer]   = useState('');
  const [vaultAnswering, setVaultAnswering] = useState(false);
  const [vaultAskErr, setVaultAskErr]   = useState('');
  const [vaultAskNotes, setVaultAskNotes] = useState<FileInfo[]>([]);

  // ── Mount: load resource list + index status + vault status ──
  useEffect(() => {
    fetch('/api/resources').then(r => r.json()).then(({ folder, files }) => {
      setResourceFolder(folder); setAllFiles(files ?? []);
    }).catch(() => {});
    fetch('/api/search').then(r => r.json()).then(s => setIdxStatus(s)).catch(() => {});
    fetch('/api/vault').then(r => r.json()).then(s => setVaultStatus(s)).catch(() => {});
  }, []);

  // Poll epub index while building
  useEffect(() => {
    if (idxStatus.building) {
      libPollRef.current = setInterval(async () => {
        const r = await fetch('/api/search').then(x => x.json());
        setIdxStatus(r);
        if (!r.building) clearInterval(libPollRef.current!);
      }, 1500);
    }
    return () => { if (libPollRef.current) clearInterval(libPollRef.current); };
  }, [idxStatus.building]);

  // ── Library handlers ──
  const handleBuildIndex = async () => {
    const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'build' }) });
    const d = await res.json();
    if (d.error) { setLibSearchErr(d.error); return; }
    setIdxStatus(s => ({ ...s, building: true, total: d.total }));
  };

  const handleLibSearch = async () => {
    if (!libQuery.trim()) return;
    setLibSearching(true); setLibSearchErr(''); setLibResults([]);
    try {
      const res = await fetch('/api/search', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: libQuery }) });
      const d = await res.json();
      if (d.notIndexed) setLibSearchErr('Index not built yet. Click "Build Index" first.');
      else if (d.error) setLibSearchErr(d.error);
      else setLibResults(d.results ?? []);
    } catch { setLibSearchErr('Search failed.'); }
    finally { setLibSearching(false); }
  };

  const toggleFile = (fp: string) => setSelectedPaths(p => { const n = new Set(p); n.has(fp) ? n.delete(fp) : n.add(fp); return n; });
  const selectAllFiles = () => setSelectedPaths(new Set(allFiles.map(f => f.filePath)));
  const clearAllFiles  = () => setSelectedPaths(new Set());
  const filteredFiles  = allFiles.filter(f => f.name.toLowerCase().includes(nameFilter.toLowerCase()));

  // ── Vault handlers ──
  const handleVaultFind = async () => {
    if (!vaultFindQuery.trim()) return;
    setVaultFinding(true); setVaultFindErr(''); setVaultFindResults([]);
    try {
      const res = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'search', query: vaultFindQuery }) });
      const d = await res.json();
      if (d.error) setVaultFindErr(d.error);
      else {
        setVaultFindResults(d.results ?? []);
        setVaultStatus(s => ({ ...s, noteCount: d.totalNotes }));
      }
    } catch { setVaultFindErr('Search failed.'); }
    finally { setVaultFinding(false); }
  };

  const handleVaultAsk = async () => {
    if (!vaultAskQ.trim()) return;
    setVaultAnswering(true); setVaultAskErr(''); setVaultAnswer(''); setVaultAskNotes([]);
    try {
      const res = await fetch('/api/vault', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'ask', question: vaultAskQ }) });
      const d = await res.json();
      if (d.error) setVaultAskErr(d.error);
      else { setVaultAnswer(d.answer); setVaultAskNotes(d.notesUsed ?? []); }
    } catch { setVaultAskErr('Request failed.'); }
    finally { setVaultAnswering(false); }
  };

  const toggleVaultNote = (fp: string) => setSelectedVaultPaths(p => { const n = new Set(p); n.has(fp) ? n.delete(fp) : n.add(fp); return n; });
  const addVaultResult  = (fp: string) => setSelectedVaultPaths(p => new Set([...p, fp]));

  // ── Synthesis handler ──
  const handleGenerate = useCallback(async () => {
    if (!text.trim()) { setGenError('Please paste some commentary text first.'); return; }
    setGenError(''); setSynthesis(''); setResourcesUsed([]); setVaultNotesUsed([]);
    setSavedMdPath(''); setSavedFilename(''); setSaveError(''); setWordDone(false);
    setLoadingGen(true);
    abortRef.current = new AbortController();
    try {
      const res = await fetch('/api/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, depth, selectedFilePaths: Array.from(selectedPaths), selectedVaultPaths: Array.from(selectedVaultPaths) }),
        signal: abortRef.current.signal,
      });
      if (!res.ok) throw new Error(await res.text() || 'Request failed.');
      const { result, resourcesUsed: ru, vaultNotesUsed: vu } = await res.json();
      setSynthesis(result); setResourcesUsed(ru ?? []); setVaultNotesUsed(vu ?? []);
      // Auto-save markdown
      const saveRes = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ result }) });
      const saveData = await saveRes.json();
      if (saveData.ok) { setSavedMdPath(saveData.mdPath); setSavedFilename(saveData.filename); }
      else setSaveError(saveData.error ?? 'Could not save file.');
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError')
        setGenError(err.message || 'Something went wrong.');
    } finally { setLoadingGen(false); }
  }, [text, depth, selectedPaths, selectedVaultPaths]);

  const handleExportWord = async () => {
    if (!savedMdPath) return;
    setExportingWord(true); setWordDone(false);
    const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'word', mdPath: savedMdPath }) });
    const d = await res.json();
    setExportingWord(false);
    if (d.ok) setWordDone(true);
    else setSaveError(d.error ?? 'Word export failed.');
  };

  const handleClear = () => { setText(''); setSynthesis(''); setGenError(''); setResourcesUsed([]); setVaultNotesUsed([]); setSavedMdPath(''); setSavedFilename(''); setSaveError(''); setWordDone(false); };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">Commentary-Combiner</h1>
          <p className="text-sm font-semibold text-[#c0392b]">#TruthMattersMost</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* ══ Resources Library (green) ══ */}
        <section className="bg-green-50 rounded-xl border border-green-200 shadow-sm overflow-hidden">
          <button onClick={() => setLibOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-green-100 transition-colors">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-green-900">Resources Library</span>
              <span className="text-xs bg-green-200 text-green-800 rounded-full px-2 py-0.5 font-medium">
                {allFiles.length} books{selectedPaths.size > 0 && ` · ${selectedPaths.size} selected`}
              </span>
              {idxStatus.ready && <span className="text-xs bg-green-600 text-white rounded-full px-2 py-0.5">indexed</span>}
            </div>
            <span className="text-green-700">{libOpen ? '▲' : '▼'}</span>
          </button>

          {libOpen && (
            <div className="border-t border-green-200">
              <div className="flex border-b border-green-200">
                {(['browse', 'search'] as LibTab[]).map(tab => (
                  <button key={tab} onClick={() => setLibTab(tab)}
                    className={`px-5 py-2.5 text-sm font-semibold capitalize transition-colors ${libTab === tab ? 'border-b-2 border-green-700 text-green-900 bg-white' : 'text-green-700 hover:bg-green-100'}`}>
                    {tab === 'browse' ? 'Browse All' : 'Search Content'}
                  </button>
                ))}
              </div>

              {libTab === 'browse' && (
                <div className="p-5">
                  {resourceFolder && <p className="text-xs text-green-700 font-mono break-all mb-3">{resourceFolder}</p>}
                  <input type="text" value={nameFilter} onChange={e => setNameFilter(e.target.value)} placeholder="Filter by filename…"
                    className="w-full text-sm px-3 py-2 border border-green-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-400 mb-3" />
                  <div className="flex items-center gap-4 mb-3">
                    <button onClick={selectAllFiles} className="text-xs text-green-800 underline hover:text-green-600">Select all</button>
                    <button onClick={clearAllFiles}  className="text-xs text-green-800 underline hover:text-green-600">Clear all</button>
                    {selectedPaths.size > 0 && <span className="text-xs text-green-700 ml-auto">{selectedPaths.size} selected</span>}
                  </div>
                  <div className="flex flex-wrap gap-2 max-h-56 overflow-y-auto">
                    {filteredFiles.map(f => (
                      <label key={f.filePath} className={`flex items-center gap-1.5 text-xs border rounded px-2 py-1 cursor-pointer transition-colors ${selectedPaths.has(f.filePath) ? 'bg-green-600 text-white border-green-700' : 'bg-white text-green-800 border-green-300 hover:bg-green-100'}`}>
                        <input type="checkbox" className="sr-only" checked={selectedPaths.has(f.filePath)} onChange={() => toggleFile(f.filePath)} />
                        <OpenLink filePath={f.filePath} className="underline opacity-70 hover:opacity-100 cursor-pointer">↗</OpenLink>
                        {f.name}
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {libTab === 'search' && (
                <div className="p-5 space-y-4">
                  <div className="flex items-center gap-3 flex-wrap">
                    {idxStatus.building
                      ? <div className="flex items-center gap-2 text-sm text-green-800"><span className="inline-block w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />Indexing {idxStatus.indexed} of {idxStatus.total}…</div>
                      : idxStatus.ready
                        ? <span className="text-sm text-green-800 font-medium">✓ {idxStatus.indexed} books indexed{idxStatus.builtAt ? ` · built ${new Date(idxStatus.builtAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}</span>
                        : <span className="text-sm text-green-700">Index not built yet.</span>}
                    <button onClick={handleBuildIndex} disabled={idxStatus.building}
                      className="ml-auto text-xs px-3 py-1.5 bg-green-700 text-white rounded-lg hover:bg-green-800 disabled:opacity-50 transition-colors">
                      {idxStatus.ready ? 'Rebuild' : 'Build Index'}
                    </button>
                  </div>
                  {idxStatus.ready && (
                    <div className="flex gap-2">
                      <input type="text" value={libQuery} onChange={e => setLibQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLibSearch()}
                        placeholder="Search topics, e.g. justification, election, covenant…"
                        className="flex-1 text-sm px-3 py-2 border border-green-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-green-400" />
                      <button onClick={handleLibSearch} disabled={libSearching || !libQuery.trim()}
                        className="px-4 py-2 bg-green-700 text-white text-sm font-semibold rounded-lg hover:bg-green-800 disabled:opacity-50">{libSearching ? '…' : 'Search'}</button>
                    </div>
                  )}
                  {libSearchErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{libSearchErr}</p>}
                  {libResults.length > 0 && (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      <p className="text-xs text-green-700 font-medium">{libResults.length} books matched</p>
                      {libResults.map((r: LibResult) => (
                        <div key={r.filePath} className="bg-white border border-green-200 rounded-lg p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <OpenLink filePath={r.filePath} className="text-sm font-semibold text-green-900 hover:underline cursor-pointer">{r.name}</OpenLink>
                              <span className="text-xs bg-green-100 text-green-700 rounded px-1.5 py-0.5">{r.matchCount} match{r.matchCount !== 1 ? 'es' : ''}</span>
                            </div>
                            <button onClick={() => toggleFile(r.filePath)}
                              className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${selectedPaths.has(r.filePath) ? 'bg-green-600 text-white border-green-700' : 'bg-white text-green-700 border-green-400 hover:bg-green-50'}`}>
                              {selectedPaths.has(r.filePath) ? '✓ Selected' : '+ Select'}
                            </button>
                          </div>
                          {r.snippets.map((s, i) => <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 leading-relaxed">{s}</p>)}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ══ Obsidian Vault (indigo) ══ */}
        <section className="bg-indigo-50 rounded-xl border border-indigo-200 shadow-sm overflow-hidden">
          <button onClick={() => setVaultOpen(o => !o)} className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-indigo-100 transition-colors">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-base font-bold text-indigo-900">Obsidian Vault</span>
              {vaultStatus.connected
                ? <span className="text-xs bg-indigo-200 text-indigo-800 rounded-full px-2 py-0.5 font-medium">
                    {vaultStatus.noteCount !== null ? `${vaultStatus.noteCount} notes` : 'connected'}
                    {selectedVaultPaths.size > 0 && ` · ${selectedVaultPaths.size} selected`}
                  </span>
                : <span className="text-xs bg-red-100 text-red-700 rounded-full px-2 py-0.5">not configured</span>}
            </div>
            <span className="text-indigo-700">{vaultOpen ? '▲' : '▼'}</span>
          </button>

          {vaultOpen && (
            <div className="border-t border-indigo-200">
              {!vaultStatus.connected ? (
                <div className="p-5">
                  <p className="text-sm text-indigo-700">
                    Add <code className="bg-indigo-100 px-1 rounded">OBSIDIAN_VAULT=/Users/marktriplett/Vaults/LifeHQ Blank-3</code> to your <code className="bg-indigo-100 px-1 rounded">.env.local</code> file, then restart the server.
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-5 pt-3 pb-0">
                    <p className="text-xs text-indigo-600 font-mono break-all">{vaultStatus.vaultPath}</p>
                  </div>
                  <div className="flex border-b border-indigo-200 mt-3">
                    {(['find', 'ask'] as VaultTab[]).map(tab => (
                      <button key={tab} onClick={() => setVaultTab(tab)}
                        className={`px-5 py-2.5 text-sm font-semibold transition-colors ${vaultTab === tab ? 'border-b-2 border-indigo-700 text-indigo-900 bg-white' : 'text-indigo-700 hover:bg-indigo-100'}`}>
                        {tab === 'find' ? 'Find Notes' : 'Ask Your Vault'}
                      </button>
                    ))}
                  </div>

                  {/* Find Notes tab */}
                  {vaultTab === 'find' && (
                    <div className="p-5 space-y-4">
                      <div className="flex gap-2">
                        <input type="text" value={vaultFindQuery} onChange={e => setVaultFindQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleVaultFind()}
                          placeholder="Search your notes, e.g. Romans 8, justification, sermon…"
                          className="flex-1 text-sm px-3 py-2 border border-indigo-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <button onClick={handleVaultFind} disabled={vaultFinding || !vaultFindQuery.trim()}
                          className="px-4 py-2 bg-indigo-700 text-white text-sm font-semibold rounded-lg hover:bg-indigo-800 disabled:opacity-50">
                          {vaultFinding ? '…' : 'Search'}
                        </button>
                      </div>
                      {selectedVaultPaths.size > 0 && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-indigo-700">{selectedVaultPaths.size} note{selectedVaultPaths.size !== 1 ? 's' : ''} selected for synthesis:</span>
                          {Array.from(selectedVaultPaths).map(fp => (
                            <button key={fp} onClick={() => toggleVaultNote(fp)}
                              className="text-xs bg-indigo-600 text-white border border-indigo-700 rounded px-2 py-0.5 hover:bg-indigo-700">
                              {fp.split('/').pop()?.replace(/\.md$/, '')} ×
                            </button>
                          ))}
                        </div>
                      )}
                      {vaultFindErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{vaultFindErr}</p>}
                      {vaultFindResults.length > 0 && (
                        <div className="space-y-3 max-h-96 overflow-y-auto">
                          <p className="text-xs text-indigo-700 font-medium">{vaultFindResults.length} notes matched</p>
                          {vaultFindResults.map(r => (
                            <div key={r.filePath} className="bg-white border border-indigo-200 rounded-lg p-3 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div>
                                  <OpenLink filePath={r.filePath} className="text-sm font-semibold text-indigo-900 hover:underline cursor-pointer">{r.name}</OpenLink>
                                  <p className="text-xs text-indigo-400 mt-0.5">{r.relativePath}</p>
                                </div>
                                <button onClick={() => addVaultResult(r.filePath)}
                                  className={`shrink-0 text-xs px-2 py-1 rounded border transition-colors ${selectedVaultPaths.has(r.filePath) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-indigo-700 border-indigo-400 hover:bg-indigo-50'}`}>
                                  {selectedVaultPaths.has(r.filePath) ? '✓ Added' : '+ Add to synthesis'}
                                </button>
                              </div>
                              {r.snippets.map((s, i) => <p key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1.5 leading-relaxed">{s}</p>)}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Ask Your Vault tab */}
                  {vaultTab === 'ask' && (
                    <div className="p-5 space-y-4">
                      <p className="text-xs text-indigo-600">Ask a question and get an answer grounded in your own notes.</p>
                      <div className="flex gap-2">
                        <input type="text" value={vaultAskQ} onChange={e => setVaultAskQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleVaultAsk()}
                          placeholder="e.g. What have I written about Romans 8:28?"
                          className="flex-1 text-sm px-3 py-2 border border-indigo-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                        <button onClick={handleVaultAsk} disabled={vaultAnswering || !vaultAskQ.trim()}
                          className="px-4 py-2 bg-indigo-700 text-white text-sm font-semibold rounded-lg hover:bg-indigo-800 disabled:opacity-50">
                          {vaultAnswering ? '…' : 'Ask'}
                        </button>
                      </div>
                      {vaultAskErr && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{vaultAskErr}</p>}
                      {vaultAnswering && (
                        <div className="flex items-center gap-2 text-sm text-indigo-600 py-4 justify-center">
                          <span className="inline-block w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />Searching your vault…
                        </div>
                      )}
                      {vaultAnswer && (
                        <div className="space-y-3">
                          {vaultAskNotes.length > 0 && (
                            <div className="flex flex-wrap gap-2 items-center">
                              <span className="text-xs text-indigo-600">Notes consulted:</span>
                              {vaultAskNotes.map(n => (
                                <OpenLink key={n.filePath} filePath={n.filePath}
                                  className="text-xs bg-indigo-100 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 hover:bg-indigo-200 cursor-pointer">{n.name}</OpenLink>
                              ))}
                            </div>
                          )}
                          <article className="prose prose-sm max-w-none prose-headings:text-indigo-900 prose-p:text-gray-700 prose-li:text-gray-700 bg-white border border-indigo-100 rounded-lg p-4">
                            <ReactMarkdown>{vaultAnswer}</ReactMarkdown>
                          </article>
                          <button onClick={() => navigator.clipboard.writeText(vaultAnswer)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium">Copy answer</button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        {/* ══ Commentary Input ══ */}
        <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900 mb-1">Commentary Input</h2>
          <p className="text-sm text-gray-500 mb-4">
            Paste commentary exports below. Select books from Resources Library or notes from your Obsidian Vault above to include them. All Scripture citations will use the ESV.
          </p>
          <textarea value={text} onChange={e => setText(e.target.value)} placeholder="Paste your commentary exports here…" disabled={loadingGen}
            className="w-full h-64 p-4 text-sm text-gray-800 border border-gray-200 rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-[#c0392b]/40 focus:border-[#c0392b] placeholder-gray-400" />
          <div className="text-right text-xs text-gray-400 mt-1">{text.length.toLocaleString()} characters</div>

          <h3 className="text-base font-bold text-gray-900 mt-5 mb-3">Analysis Depth</h3>
          <div className="space-y-2">
            {DEPTHS.map(d => (
              <label key={d.id} className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${depth === d.id ? 'border-[#c0392b] bg-red-50' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                <input type="radio" name="depth" value={d.id} checked={depth === d.id} onChange={() => setDepth(d.id)} className="mt-0.5 accent-[#c0392b]" disabled={loadingGen} />
                <div>
                  <span className="font-semibold text-gray-900">{d.label}</span>
                  <span className="text-gray-700"> – {d.description}</span>
                  <p className="text-xs text-gray-500 mt-0.5">{d.meta}</p>
                </div>
              </label>
            ))}
          </div>

          {genError && <p className="mt-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">{genError}</p>}

          <div className="flex gap-3 mt-6">
            <button onClick={loadingGen ? () => { abortRef.current?.abort(); setLoadingGen(false); } : handleGenerate}
              className={`px-6 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors ${loadingGen ? 'bg-gray-500 hover:bg-gray-600' : 'bg-[#c0392b] hover:bg-[#a93226]'}`}>
              {loadingGen ? 'Stop' : 'Generate Synthesis'}
            </button>
            <button onClick={handleClear} disabled={loadingGen} className="px-6 py-2.5 rounded-lg text-sm font-semibold text-gray-700 border border-gray-300 hover:bg-gray-100 transition-colors disabled:opacity-50">
              Clear Input
            </button>
          </div>
        </section>

        {/* ══ Results ══ */}
        {(synthesis || loadingGen) && (
          <section className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h2 className="text-xl font-bold text-gray-900">Reformed Synthesis</h2>
              {synthesis && !loadingGen && (
                <div className="flex items-center gap-3 flex-wrap">
                  <button onClick={() => navigator.clipboard.writeText(synthesis)} className="text-xs text-[#c0392b] hover:text-[#a93226] font-medium">Copy to clipboard</button>
                  {savedFilename && (
                    <span className="text-xs text-gray-500">
                      Saved: <OpenLink filePath={savedMdPath} className="underline text-gray-700 hover:text-gray-900 cursor-pointer">{savedFilename}</OpenLink>
                    </span>
                  )}
                  {savedMdPath && (
                    <button onClick={handleExportWord} disabled={exportingWord}
                      className="text-xs px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                      {exportingWord ? 'Opening…' : wordDone ? '✓ Opened in Word' : 'Save as Word'}
                    </button>
                  )}
                  {saveError && <span className="text-xs text-red-600">{saveError}</span>}
                </div>
              )}
            </div>

            {(resourcesUsed.length > 0 || vaultNotesUsed.length > 0) && (
              <div className="mb-4 space-y-2">
                {resourcesUsed.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-gray-500">Books used:</span>
                    {resourcesUsed.map(f => <OpenLink key={f.filePath} filePath={f.filePath} className="text-xs bg-green-50 text-green-700 border border-green-200 rounded px-2 py-0.5 hover:bg-green-100 cursor-pointer">{f.name}</OpenLink>)}
                  </div>
                )}
                {vaultNotesUsed.length > 0 && (
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs text-gray-500">Vault notes used:</span>
                    {vaultNotesUsed.map(n => <OpenLink key={n.filePath} filePath={n.filePath} className="text-xs bg-indigo-50 text-indigo-700 border border-indigo-200 rounded px-2 py-0.5 hover:bg-indigo-100 cursor-pointer">{n.name}</OpenLink>)}
                  </div>
                )}
              </div>
            )}

            {loadingGen && !synthesis && (
              <div className="flex items-center gap-2 text-sm text-gray-500 py-8 justify-center">
                <span className="inline-block w-4 h-4 border-2 border-[#c0392b] border-t-transparent rounded-full animate-spin" />Generating synthesis…
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
