import type { RuntimeStatus, ServiceState } from '@shared/types'
import { ModelLibrary } from './ModelLibrary'

function Dot({ state }: { state: ServiceState }): React.JSX.Element {
  const color = {
    stopped: 'bg-neutral-400',
    starting: 'bg-amber-400 animate-pulse',
    ready: 'bg-emerald-500',
    error: 'bg-red-500'
  }[state]
  return <span className={`inline-block size-2 rounded-full ${color}`} />
}

/** First-run screen: waits for the bundled services, then asks for a model if none is installed. */
export function Setup({ status }: { status?: RuntimeStatus }): React.JSX.Element {
  if (!status) return <div />
  const servicesReady = status.ollama === 'ready' && status.opencode === 'ready'

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <h1 className="text-xl font-semibold">{servicesReady ? 'Choose a model to get started' : 'Getting ready'}</h1>

        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Dot state={status.ollama} /> Local model server (Ollama)
          </li>
          <li className="flex items-center gap-2">
            <Dot state={status.opencode} /> Agent engine (opencode)
          </li>
        </ul>

        {status.error && <p className="selectable text-sm text-red-500">{status.error}</p>}

        {servicesReady && !status.hasModels && (
          <>
            <p className="text-sm text-neutral-500">
              Models run entirely on this Mac. Downloads are large, so pick one that fits your memory: about 32 GB of RAM for the 27–30B models.
            </p>
            <ModelLibrary />
          </>
        )}
      </div>
    </div>
  )
}
