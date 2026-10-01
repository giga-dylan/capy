import { useEffect, useState } from 'react'
import type { InstalledModel, ModelProgress } from '@shared/types'

export interface RecommendedModel {
  name: string
  label: string
  size: string
  note: string
}

/** Curated Ollama library tags (sizes from ollama.com, Oct 2026). */
export const RECOMMENDED_MODELS: RecommendedModel[] = [
  { name: 'qwen3.8:27b-mlx', label: 'Qwen 3.8 27B (MLX)', size: '18 GB', note: 'Default. Built for agentic work; runs on the MLX engine.' },
  { name: 'qwen3-coder:30b', label: 'Qwen3-Coder 30B-A3B', size: '19 GB', note: 'Mixture-of-experts coding model; faster generation.' },
  { name: 'gpt-oss:20b', label: 'gpt-oss 20B', size: '14 GB', note: "OpenAI's open-weight model." },
  { name: 'devstral-small-2:24b', label: 'Devstral Small 2 24B', size: '15 GB', note: "Mistral's coding-agent model." },
  { name: 'gemma4:12b-mlx', label: 'Gemma 4 12B (MLX)', size: '7.7 GB', note: 'Small and quick; for lighter tasks.' },
  { name: 'qwen3-coder-next', label: 'Qwen3-Coder-Next', size: '52 GB', note: 'Largest; needs 64 GB+ of memory.' }
]

export function formatBytes(bytes: number): string {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`
}

export const supportsTools = (m: InstalledModel): boolean => m.capabilities.includes('tools')

/** Installed models; refetched whenever the main process reports a status change. */
export function useInstalledModels(): InstalledModel[] {
  const [models, setModels] = useState<InstalledModel[]>([])
  useEffect(() => {
    const load = (): void => void window.api.listModels().then(setModels)
    load()
    return window.api.onStatus(load)
  }, [])
  return models
}

/** Latest progress per model for downloads/imports in flight (and their final result). */
export function useModelProgress(): Record<string, ModelProgress> {
  const [progress, setProgress] = useState<Record<string, ModelProgress>>({})
  useEffect(() => window.api.onModelProgress((p) => setProgress((s) => ({ ...s, [p.model]: p }))), [])
  return progress
}

export function progressPercent(p: ModelProgress | undefined): number | undefined {
  return p?.total ? Math.round(((p.completed ?? 0) / p.total) * 100) : undefined
}
