import { useEffect, useState } from 'react'
import type { RuntimeStatus } from '@shared/types'
import { Setup } from './components/Setup'
import { Shell } from './components/Shell'

export function App(): React.JSX.Element {
  const [status, setStatus] = useState<RuntimeStatus>()

  useEffect(() => {
    window.api.getStatus().then(setStatus)
    return window.api.onStatus((s) => setStatus({ ...s }))
  }, [])

  // Once the app has booted, keep the chat UI mounted through service restarts.
  const [booted, setBooted] = useState(false)
  const ready = status?.ollama === 'ready' && status.opencode === 'ready' && status.hasModels
  useEffect(() => {
    if (ready) setBooted(true)
  }, [ready])

  return (
    <div className="flex h-full flex-col">
      {status && (booted || ready) ? (
        <Shell status={status} />
      ) : (
        <>
          <div className="drag h-12 shrink-0" />
          <Setup status={status} />
        </>
      )}
    </div>
  )
}
