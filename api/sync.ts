import { get, put } from '@vercel/blob'

type WakeRecord = {
  id: string
  date: string
  wokeAtISO: string
  createdAtISO: string
  updatedAtISO: string
}

type ApiResponse = {
  status(code: number): ApiResponse
  json(value: unknown): void
  setHeader(name: string, value: string): void
  end(): void
}

type ApiRequest = {
  method?: string
  query: {
    deviceId?: string | string[]
  }
  body?: unknown
}

function isValidDeviceId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{8,80}$/.test(value)
}

function isWakeRecord(value: unknown): value is WakeRecord {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>

  return (
    typeof record.id === 'string' &&
    typeof record.date === 'string' &&
    typeof record.wokeAtISO === 'string' &&
    typeof record.createdAtISO === 'string' &&
    typeof record.updatedAtISO === 'string'
  )
}

function parseBody(body: unknown) {
  if (typeof body === 'string') return JSON.parse(body) as unknown
  return body
}

async function streamToText(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }

  return result + decoder.decode()
}

function blobPath(deviceId: string) {
  return `wake-records/${deviceId}.json`
}

export default async function handler(request: ApiRequest, response: ApiResponse) {
  response.setHeader('Cache-Control', 'no-store')

  if (request.method === 'OPTIONS') {
    response.status(204).end()
    return
  }

  try {
    if (request.method === 'GET') {
      const deviceId = Array.isArray(request.query.deviceId)
        ? request.query.deviceId[0]
        : request.query.deviceId

      if (!isValidDeviceId(deviceId)) {
        response.status(400).json({ error: 'Invalid deviceId' })
        return
      }

      const blob = await get(blobPath(deviceId), { access: 'private', useCache: false })

      if (!blob || blob.statusCode === 304 || !blob.stream) {
        response.status(200).json({ records: [], updatedAtISO: null })
        return
      }

      const payload = JSON.parse(await streamToText(blob.stream)) as unknown
      response.status(200).json(payload)
      return
    }

    if (request.method === 'PUT') {
      const body = parseBody(request.body) as Record<string, unknown>
      const deviceId = body.deviceId
      const records = body.records

      if (!isValidDeviceId(deviceId) || !Array.isArray(records) || !records.every(isWakeRecord)) {
        response.status(400).json({ error: 'Invalid sync payload' })
        return
      }

      const payload = {
        records: records.slice(0, 30),
        updatedAtISO: new Date().toISOString(),
      }

      await put(blobPath(deviceId), JSON.stringify(payload), {
        access: 'private',
        allowOverwrite: true,
        contentType: 'application/json',
      })

      response.status(200).json(payload)
      return
    }

    response.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error'
    response.status(500).json({ error: message })
  }
}
