import { useEffect, useState } from 'react'
import { ChevronDownIcon, FilesIcon, FolderIcon, SearchIcon } from '../icons'
import { DiffView } from './DiffView'

interface FileNode {
  name: string
  path: string
  absolute: string
  type: 'file' | 'directory'
  ignored: boolean
}
interface FileContent {
  type: 'text' | 'binary'
  content: string
  diff?: string
}
interface TextMatch {
  path: { text: string }
  lines: { text: string }
  line_number: number
}
interface SymbolMatch {
  name: string
  kind: number
  location: { uri: string; range: { start: { line: number } } }
}

/**
 * Browse and search the chat's folder through opencode (file.list, file.read, find.text,
 * find.files, find.symbols). "Add to chat" @mentions a file in the composer.
 */
export function FilesPanel({ directory, onAddToChat }: { directory: string; onAddToChat: (path: string) => void }): React.JSX.Element {
  const [open, setOpen] = useState<{ path: string; line?: number }>()
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'text' | 'files' | 'symbols'>('text')

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 px-3 pb-2">
        <div className="flex items-center gap-2 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700">
          <SearchIcon className="size-3.5 text-neutral-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={mode === 'text' ? 'Search in files (regex)…' : mode === 'files' ? 'Find files by name…' : 'Find symbols (needs LSP)…'}
            className="min-w-0 flex-1 bg-transparent text-xs outline-none"
          />
        </div>
        <div className="flex gap-1">
          {(['text', 'files', 'symbols'] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded px-2 py-0.5 text-[11px] ${mode === m ? 'bg-neutral-200 font-medium dark:bg-neutral-800' : 'text-neutral-500'}`}
            >
              {m === 'text' ? 'Text' : m === 'files' ? 'File names' : 'Symbols'}
            </button>
          ))}
        </div>
      </div>
      <div className="selectable min-h-0 flex-1 overflow-y-auto px-1 pb-4">
        {open ? (
          <FileViewer directory={directory} path={open.path} line={open.line} onBack={() => setOpen(undefined)} onAddToChat={onAddToChat} />
        ) : query.trim() ? (
          <SearchResults directory={directory} query={query.trim()} mode={mode} onOpen={(path, line) => setOpen({ path, line })} />
        ) : (
          <Tree directory={directory} path="." depth={0} onOpen={(path) => setOpen({ path })} />
        )}
      </div>
    </div>
  )
}

function Tree({ directory, path, depth, onOpen }: { directory: string; path: string; depth: number; onOpen: (path: string) => void }): React.JSX.Element {
  const [nodes, setNodes] = useState<FileNode[]>()
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  useEffect(() => {
    window.api
      .oc<FileNode[]>('file.list', { directory, path })
      .then((n) => setNodes((n ?? []).sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1))))
      .catch(() => setNodes([]))
  }, [directory, path])
  if (!nodes) return <p className="px-3 text-xs text-neutral-500">Loading…</p>
  return (
    <ul>
      {nodes.map((n) => (
        <li key={n.path}>
          <button
            onClick={() =>
              n.type === 'directory'
                ? setExpanded((s) => {
                    const next = new Set(s)
                    if (next.has(n.path)) next.delete(n.path)
                    else next.add(n.path)
                    return next
                  })
                : onOpen(n.path)
            }
            style={{ paddingLeft: 8 + depth * 12 }}
            className={`flex w-full items-center gap-1.5 rounded py-0.5 pr-2 text-left text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 ${n.ignored ? 'opacity-50' : ''}`}
          >
            {n.type === 'directory' ? (
              <>
                <ChevronDownIcon className={`size-3 shrink-0 transition-transform ${expanded.has(n.path) ? '' : '-rotate-90'}`} />
                <FolderIcon className="size-3.5 shrink-0 text-neutral-500" />
              </>
            ) : (
              <>
                <span className="w-3 shrink-0" />
                <FilesIcon className="size-3.5 shrink-0 text-neutral-400" />
              </>
            )}
            <span className="truncate">{n.name}</span>
          </button>
          {n.type === 'directory' && expanded.has(n.path) && <Tree directory={directory} path={n.path} depth={depth + 1} onOpen={onOpen} />}
        </li>
      ))}
    </ul>
  )
}

function SearchResults({
  directory,
  query,
  mode,
  onOpen
}: {
  directory: string
  query: string
  mode: 'text' | 'files' | 'symbols'
  onOpen: (path: string, line?: number) => void
}): React.JSX.Element {
  const [results, setResults] = useState<{ path: string; line?: number; text?: string }[]>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    setError(undefined)
    const t = setTimeout(() => {
      const strip = (p: string): string => (p.startsWith(directory) ? p.slice(directory.length + 1) : p)
      const call =
        mode === 'text'
          ? window.api.oc<TextMatch[]>('find.text', { directory, pattern: query }).then((r) =>
              (r ?? []).slice(0, 200).map((m) => ({ path: strip(m.path.text), line: m.line_number, text: m.lines.text.trim() }))
            )
          : mode === 'files'
            ? window.api.oc<string[]>('find.files', { directory, query, limit: 100 }).then((r) => (r ?? []).map((p) => ({ path: p })))
            : window.api.oc<SymbolMatch[]>('find.symbols', { directory, query }).then((r) =>
                (r ?? []).map((s) => ({ path: strip(decodeURIComponent(s.location.uri.replace('file://', ''))), line: s.location.range.start.line + 1, text: s.name }))
              )
      call.then(setResults).catch((err) => setError(String(err)))
    }, 250)
    return () => clearTimeout(t)
  }, [directory, query, mode])
  if (error) return <p className="px-3 text-xs text-red-500">{error}</p>
  if (!results) return <p className="px-3 text-xs text-neutral-500">Searching…</p>
  if (!results.length) return <p className="px-3 text-xs text-neutral-500">No matches.{mode === 'symbols' ? ' Symbol search needs a language server (Settings → Formatters & LSP).' : ''}</p>
  return (
    <ul>
      {results.map((r, i) => (
        <li key={i}>
          <button onClick={() => onOpen(r.path, r.line)} className="w-full rounded px-3 py-1 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800">
            <span className="block truncate font-mono text-[11px] text-neutral-500">
              {r.path}
              {r.line ? `:${r.line}` : ''}
            </span>
            {r.text && <span className="block truncate font-mono text-xs">{r.text}</span>}
          </button>
        </li>
      ))}
    </ul>
  )
}

function FileViewer({
  directory,
  path,
  line,
  onBack,
  onAddToChat
}: {
  directory: string
  path: string
  line?: number
  onBack: () => void
  onAddToChat: (path: string) => void
}): React.JSX.Element {
  const [file, setFile] = useState<FileContent>()
  const [error, setError] = useState<string>()
  useEffect(() => {
    window.api.oc<FileContent>('file.read', { directory, path }).then(setFile).catch((err) => setError(String(err)))
  }, [directory, path])
  useEffect(() => {
    if (line) document.getElementById(`line-${line}`)?.scrollIntoView({ block: 'center' })
  }, [file, line])
  return (
    <div className="space-y-2 px-2">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="rounded px-1.5 py-0.5 text-xs text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">
          ← Back
        </button>
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={path}>
          {path}
        </span>
        <button onClick={() => onAddToChat(path)} className="shrink-0 rounded px-1.5 py-0.5 text-xs text-blue-600 hover:bg-blue-500/10 dark:text-blue-400">
          @ Add to chat
        </button>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {file?.type === 'binary' && <p className="text-xs text-neutral-500">Binary file.</p>}
      {file?.diff && (
        <details className="rounded-md border border-neutral-200 dark:border-neutral-800">
          <summary className="cursor-pointer px-2 py-1 text-xs text-amber-500">Uncommitted changes</summary>
          <DiffView patch={file.diff} />
        </details>
      )}
      {file?.type === 'text' && (
        <pre className="overflow-x-auto rounded-md border border-neutral-200 py-1 font-mono text-[11px] leading-relaxed dark:border-neutral-800">
          {file.content.split('\n').map((l, i) => (
            <div key={i} id={`line-${i + 1}`} className={`flex ${line === i + 1 ? 'bg-amber-500/15' : ''}`}>
              <span className="w-10 shrink-0 pr-2 text-right text-neutral-400 select-none">{i + 1}</span>
              <span className="pr-2 whitespace-pre">{l || ' '}</span>
            </div>
          ))}
        </pre>
      )}
    </div>
  )
}
