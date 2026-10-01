/** Renders a unified diff with added/removed lines colored. */
export function DiffView({ patch }: { patch: string }): React.JSX.Element {
  const lines = patch.split('\n').filter((l) => !l.startsWith('Index:') && !l.startsWith('====') && !l.startsWith('diff --git'))
  return (
    <pre className="max-h-96 overflow-auto border-t border-neutral-200 py-1 font-mono text-[11px] leading-relaxed dark:border-neutral-800">
      {lines.map((l, i) => {
        const cls = l.startsWith('+++') || l.startsWith('---')
          ? 'text-neutral-500'
          : l.startsWith('@@')
            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
            : l.startsWith('+')
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : l.startsWith('-')
                ? 'bg-red-500/10 text-red-700 dark:text-red-300'
                : 'text-neutral-600 dark:text-neutral-400'
        return (
          <div key={i} className={`px-2 whitespace-pre ${cls}`}>
            {l || ' '}
          </div>
        )
      })}
    </pre>
  )
}
