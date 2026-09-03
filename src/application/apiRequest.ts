export const maximumApiRequestBytes = 16_384

export class ApiRequestError extends Error {
  readonly code: 'request_too_large' | 'invalid_json'

  constructor(code: 'request_too_large' | 'invalid_json') {
    super(code)
    this.name = 'ApiRequestError'
    this.code = code
  }
}

export function jsonResponse(payload: unknown, status = 200) {
  return Response.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

export function errorResponse(code: string, message: string, status: number, extra: Record<string, unknown> = {}) {
  return jsonResponse({ ok: false, error: { code, message, ...extra } }, status)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export async function readBoundedJson(request: Request): Promise<unknown> {
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > maximumApiRequestBytes) throw new ApiRequestError('request_too_large')
  if (!request.body) throw new ApiRequestError('invalid_json')

  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let byteCount = 0
  let body = ''
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    byteCount += chunk.value.byteLength
    if (byteCount > maximumApiRequestBytes) {
      await reader.cancel()
      throw new ApiRequestError('request_too_large')
    }
    body += decoder.decode(chunk.value, { stream: true })
  }
  body += decoder.decode()

  try {
    return JSON.parse(body)
  } catch {
    throw new ApiRequestError('invalid_json')
  }
}
