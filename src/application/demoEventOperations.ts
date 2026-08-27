import { createDemoEventOperationsState } from '../demo/seed'
import {
  createEventOperationsService,
  type EventOperationsService,
} from './eventOperationsService'
import { createBrowserEventOperationsStore } from './eventOperationsStore'

let browserService: EventOperationsService | undefined

export function getDemoEventOperationsService(): EventOperationsService {
  if (browserService) return browserService

  browserService = createEventOperationsService({
    store: createBrowserEventOperationsStore(createDemoEventOperationsState()),
    authorise: (actor) => actor.isSynthetic,
    now: () => new Date().toISOString(),
    createId: (kind) => `${kind}_${globalThis.crypto.randomUUID()}`,
    resetState: createDemoEventOperationsState,
  })

  return browserService
}
