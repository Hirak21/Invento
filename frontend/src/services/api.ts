const RAW_BASE = import.meta.env.VITE_API_BASE as string | undefined
const BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : '/api'
export const TOKEN_KEY = 'invento_token'

export class ApiError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers(options.headers)
  if (options.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }

  if (response.status === 204) {
    return undefined as T
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token && path !== '/auth/login') {
      // Token expired or revoked — clear so RequireAuth sends user to login.
      localStorage.removeItem(TOKEN_KEY)
    }
    // FastAPI validation errors arrive as { detail: [{ loc, msg, ... }] } —
    // join the messages so the user sees "body → quantity: ..." instead of
    // "[object Object]". Domain errors are already { detail: string }.
    let detail = 'Something went wrong. Please try again.'
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const raw = (data as { detail: unknown }).detail
      if (typeof raw === 'string') detail = raw
      else if (Array.isArray(raw)) {
        const msgs = raw
          .map((e) => {
            if (typeof e === 'string') return e
            if (typeof e === 'object' && e !== null && 'msg' in e) {
              const loc = 'loc' in e && Array.isArray((e as { loc: unknown }).loc)
                ? (e as { loc: unknown[] }).loc.slice(1).join(' → ')
                : ''
              return loc ? `${loc}: ${String((e as { msg: unknown }).msg)}` : String((e as { msg: unknown }).msg)
            }
            return null
          })
          .filter(Boolean)
        if (msgs.length > 0) detail = msgs.join('; ')
      }
    }
    throw new ApiError(response.status, detail)
  }

  return data as T
}

/** Download a binary response (e.g. xlsx export) with the auth header attached. */
export async function apiDownload(path: string): Promise<Blob> {
  const token = localStorage.getItem(TOKEN_KEY)
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, { headers })
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  }
  if (!response.ok) {
    if (response.status === 401 && token) localStorage.removeItem(TOKEN_KEY)
    throw new ApiError(response.status, 'The download failed. Please try again.')
  }
  return response.blob()
}
