import { describe, expect, it, vi } from 'vitest'
import {
  hasWebMcpSupport,
  registerWebMcpTools,
  watchWebMcpSupport,
  type WebMcpModelContext,
  type WebMcpTool,
} from './browserAdapter'

function createTool(name: string, execute: WebMcpTool['execute'] = vi.fn(() => name)): WebMcpTool {
  return {
    name,
    title: name,
    description: `Run ${name}.`,
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    execute,
  }
}

function createCompatibleDocument() {
  const tools = new Map<string, WebMcpTool>()
  const registerTool = vi.fn(async (tool: WebMcpTool, options?: { signal?: AbortSignal }) => {
    if (tools.has(tool.name)) throw new DOMException('Already registered', 'InvalidStateError')
    tools.set(tool.name, tool)
    options?.signal?.addEventListener('abort', () => {
      if (tools.get(tool.name) === tool) tools.delete(tool.name)
    }, { once: true })
  })
  const modelContext: WebMcpModelContext = { registerTool }
  const target = { modelContext } as Document
  return { target, tools, registerTool }
}

describe('WebMCP browser adapter', () => {
  it('registers one guarded copy of each page tool and removes the scope together', async () => {
    const { target, tools, registerTool } = createCompatibleDocument()
    const listEvents = vi.fn(() => ({ ok: true }))
    const sourceTools = [createTool('list_events', listEvents), createTool('create_event_draft')]

    const registration = registerWebMcpTools(sourceTools, target)
    await registration.ready

    expect(registration.supported).toBe(true)
    expect(registerTool).toHaveBeenCalledTimes(2)
    expect([...tools.keys()]).toEqual(['list_events', 'create_event_draft'])
    expect(await tools.get('list_events')?.execute({})).toEqual({ ok: true })
    expect(listEvents).toHaveBeenCalledOnce()

    const staleTool = tools.get('list_events')
    registration.unregister()

    expect(tools).toHaveLength(0)
    await expect(staleTool?.execute({})).rejects.toMatchObject({ name: 'AbortError' })
    expect(listEvents).toHaveBeenCalledOnce()
  })

  it('allows the same tool names to register after the previous page scope is removed', async () => {
    const { target, tools, registerTool } = createCompatibleDocument()
    const first = registerWebMcpTools([createTool('list_events')], target)
    await first.ready
    first.unregister()

    const second = registerWebMcpTools([createTool('list_events')], target)
    await second.ready

    expect(registerTool).toHaveBeenCalledTimes(2)
    expect([...tools.keys()]).toEqual(['list_events'])
    second.unregister()
  })

  it('is a no-op when the browser does not expose WebMCP', async () => {
    const target = {} as Document

    expect(hasWebMcpSupport(target)).toBe(false)
    const registration = registerWebMcpTools([createTool('list_events')], target)

    expect(registration.supported).toBe(false)
    await expect(registration.ready).resolves.toBeUndefined()
    expect(() => registration.unregister()).not.toThrow()
  })

  it('also calls unregisterTool by name when the browser offers it', async () => {
    const { target, tools } = createCompatibleDocument()
    const unregisterTool = vi.fn()
    Object.assign(target.modelContext as WebMcpModelContext, { unregisterTool })

    const registration = registerWebMcpTools([createTool('list_events'), createTool('check_in_attendee')], target)
    await registration.ready
    registration.unregister()

    expect(unregisterTool).toHaveBeenCalledTimes(2)
    expect(unregisterTool).toHaveBeenNthCalledWith(1, 'list_events')
    expect(unregisterTool).toHaveBeenNthCalledWith(2, 'check_in_attendee')
    expect(tools).toHaveLength(0)
  })

  it('surfaces a rejected registration through the ready promise', async () => {
    const target = {
      modelContext: {
        registerTool: vi.fn(async () => {
          throw new TypeError('inputSchema must be an object')
        }),
      },
    } as unknown as Document

    const registration = registerWebMcpTools([createTool('list_events')], target)

    await expect(registration.ready).rejects.toThrow('inputSchema must be an object')
  })

  it('notices WebMCP support that the browser injects after the page script runs', () => {
    vi.useFakeTimers()
    try {
      const target = {} as { modelContext?: WebMcpModelContext }
      const onSupported = vi.fn()

      watchWebMcpSupport(onSupported, target as Document, { intervalMs: 100, timeoutMs: 1000 })
      vi.advanceTimersByTime(300)
      expect(onSupported).not.toHaveBeenCalled()

      target.modelContext = { registerTool: vi.fn(async () => undefined) }
      vi.advanceTimersByTime(100)
      expect(onSupported).toHaveBeenCalledOnce()

      vi.advanceTimersByTime(2000)
      expect(onSupported).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops watching after the timeout or when asked', () => {
    vi.useFakeTimers()
    try {
      const target = {} as { modelContext?: WebMcpModelContext }
      const onSupported = vi.fn()

      const timedOut = watchWebMcpSupport(onSupported, target as Document, { intervalMs: 100, timeoutMs: 300 })
      vi.advanceTimersByTime(400)
      target.modelContext = { registerTool: vi.fn(async () => undefined) }
      vi.advanceTimersByTime(400)
      expect(onSupported).not.toHaveBeenCalled()
      timedOut.stop()

      delete target.modelContext
      const stopped = watchWebMcpSupport(onSupported, target as Document, { intervalMs: 100, timeoutMs: 1000 })
      stopped.stop()
      target.modelContext = { registerTool: vi.fn(async () => undefined) }
      vi.advanceTimersByTime(400)
      expect(onSupported).not.toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })
})
