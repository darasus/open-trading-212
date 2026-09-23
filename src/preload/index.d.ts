import type { OpenT212Api } from '../shared/ipc'

declare global {
  interface Window {
    ot212: OpenT212Api
  }
}

export {}
