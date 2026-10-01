import type { CapyApi } from '../shared/types'

declare global {
  interface Window {
    api: CapyApi
  }
}
