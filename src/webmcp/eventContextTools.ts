import type { WebMcpTool } from './browserAdapter'

export function createEventContextTools(
  getActiveEventContext: () => unknown,
): readonly WebMcpTool[] {
  return [{
    name: 'get_active_event_context',
    title: 'Get active event context',
    description: 'Read the identity of the event currently open in event management. This does not change event data.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      untrustedContentHint: false,
    },
    execute: () => getActiveEventContext(),
  }]
}
