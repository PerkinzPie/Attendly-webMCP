export type WebMcpToolExecuteOptions = {
  readonly signal: AbortSignal
}

export type WebMcpTool = {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly inputSchema: Record<string, unknown>
  readonly annotations?: {
    readonly readOnlyHint?: boolean
    readonly untrustedContentHint?: boolean
  }
  readonly execute: (
    input: Record<string, unknown>,
    options?: WebMcpToolExecuteOptions,
  ) => unknown | Promise<unknown>
}

export type WebMcpModelContext = {
  registerTool(tool: WebMcpTool, options?: { signal?: AbortSignal }): Promise<void>
  unregisterTool?(name: string): void | Promise<void>
}

export type WebMcpRegistration = {
  readonly supported: boolean
  readonly ready: Promise<void>
  unregister(): void
}

declare global {
  interface Document {
    readonly modelContext?: WebMcpModelContext
  }
}

export const webMcpCompatibilityGuidance = 'Site tools require a WebMCP-enabled browser.'

export function hasWebMcpSupport(target: Document = document) {
  return typeof target.modelContext?.registerTool === 'function'
}

export type WebMcpSupportWatch = {
  stop(): void
}

export function watchWebMcpSupport(
  onSupported: () => void,
  target: Document = document,
  { intervalMs = 250, timeoutMs = 10_000 } = {},
): WebMcpSupportWatch {
  if (hasWebMcpSupport(target)) {
    onSupported()
    return { stop() {} }
  }

  const startedAt = Date.now()
  const timer = setInterval(() => {
    if (hasWebMcpSupport(target)) {
      clearInterval(timer)
      onSupported()
      return
    }
    if (Date.now() - startedAt >= timeoutMs) clearInterval(timer)
  }, intervalMs)

  return {
    stop() {
      clearInterval(timer)
    },
  }
}

export function registerWebMcpTools(
  tools: readonly WebMcpTool[],
  target: Document = document,
): WebMcpRegistration {
  const modelContext = target.modelContext
  if (typeof modelContext?.registerTool !== 'function') {
    return {
      supported: false,
      ready: Promise.resolve(),
      unregister() {},
    }
  }

  const controller = new AbortController()
  const guardedTools = tools.map((tool): WebMcpTool => ({
    ...tool,
    execute: (input, options) => {
      if (controller.signal.aborted) return Promise.reject(controller.signal.reason)
      return tool.execute(input, options)
    },
  }))

  return {
    supported: true,
    ready: Promise.all(guardedTools.map((tool) => modelContext.registerTool(tool, {
      signal: controller.signal,
    }))).then(() => undefined),
    unregister() {
      controller.abort(new DOMException('The page context changed.', 'AbortError'))
      if (typeof modelContext.unregisterTool !== 'function') return
      for (const tool of guardedTools) {
        try {
          void Promise.resolve(modelContext.unregisterTool(tool.name)).catch(() => undefined)
        } catch {
          // The browser already dropped the tool with the abort signal.
        }
      }
    },
  }
}
