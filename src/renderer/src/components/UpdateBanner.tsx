import { useEffect, useState } from 'react'
import type { UpdateState } from '@shared/types'
import { XIcon } from './icons'

export function useUpdateState(): UpdateState | undefined {
  const [state, setState] = useState<UpdateState>()
  useEffect(() => {
    window.api.getUpdateState().then(setState)
    return window.api.onUpdateState(setState)
  }, [])
  return state
}

/** Shown when a newer Capy is available (download link) or downloaded (restart to install). */
export function UpdateBanner(): React.JSX.Element | null {
  const state = useUpdateState()
  const [dismissed, setDismissed] = useState<string>()
  if (!state?.latest || dismissed === state.latest || (state.status !== 'available' && state.status !== 'ready')) return null
  const ready = state.status === 'ready'
  return (
    <div className="flex items-center gap-3 bg-blue-500/15 px-4 py-1.5 text-xs text-blue-700 dark:text-blue-300">
      <span className="flex-1">{ready ? `Capy ${state.latest} is ready to install.` : `Capy ${state.latest} is available.`}</span>
      <button onClick={() => window.api.installUpdate()} className="rounded bg-blue-600 px-2 py-0.5 font-medium text-white hover:bg-blue-500">
        {ready ? 'Restart to update' : 'Download'}
      </button>
      <button onClick={() => setDismissed(state.latest)} title="Dismiss">
        <XIcon className="size-3.5" />
      </button>
    </div>
  )
}
