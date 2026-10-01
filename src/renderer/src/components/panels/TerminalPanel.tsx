import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

/**
 * A terminal in the chat's folder: an opencode PTY (pty.create), streamed through the main
 * process. Closed when the panel closes or the folder changes.
 */
export function TerminalPanel({ directory }: { directory: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState<'starting' | 'running' | 'exited' | string>('starting')

  useEffect(() => {
    const dark = matchMedia('(prefers-color-scheme: dark)').matches
    const term = new Terminal({
      fontFamily: 'SF Mono, ui-monospace, Menlo, monospace',
      fontSize: 12,
      cursorBlink: true,
      theme: dark ? { background: '#0a0a0a', foreground: '#e5e5e5' } : { background: '#ffffff', foreground: '#171717', cursor: '#171717' }
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(host.current!)
    fit.fit()

    let ptyId: string | undefined
    let disposed = false
    const offData = window.api.onPtyData((id, data) => id === ptyId && term.write(data))
    const offExit = window.api.onPtyExit((id) => id === ptyId && setStatus('exited'))
    const input = term.onData((data) => ptyId && window.api.ptyWrite(ptyId, data))

    window.api
      .ptyOpen(directory, term.cols, term.rows)
      .then((id) => {
        if (disposed) return void window.api.ptyClose(directory, id)
        ptyId = id
        setStatus('running')
        term.focus()
      })
      .catch((err) => setStatus(String(err)))

    const observer = new ResizeObserver(() => {
      fit.fit()
      if (ptyId) window.api.ptyResize(directory, ptyId, term.cols, term.rows)
    })
    observer.observe(host.current!)

    return () => {
      disposed = true
      observer.disconnect()
      input.dispose()
      offData()
      offExit()
      if (ptyId) void window.api.ptyClose(directory, ptyId)
      term.dispose()
    }
  }, [directory])

  return (
    <div className="flex min-h-0 flex-1 flex-col px-2 pb-2">
      {status !== 'running' && <p className="px-1 pb-1 text-xs text-neutral-500">{status === 'starting' ? 'Starting…' : status === 'exited' ? 'The shell exited. Reopen the panel for a new one.' : status}</p>}
      <div ref={host} className="min-h-0 flex-1 overflow-hidden rounded-md border border-neutral-200 p-1 dark:border-neutral-800" />
    </div>
  )
}
