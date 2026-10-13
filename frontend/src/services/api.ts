const RAW_BASE = import.meta.env.VITE_API_BASE as string | undefined
/** Main server (VPS). Baked at build time via .env.production. */
const PRIMARY_BASE = RAW_BASE && RAW_BASE.length > 0 ? RAW_BASE : '/api'
const FALLBACK_RAW = import.meta.env.VITE_API_FALLBACK_BASE as string | undefined
/**
 * Standby server (Render free tier). It sleeps when idle (~30-60s to wake),
 * so it is only used when the primary cannot be reached. Tokens issued by one
 * server are NOT valid on the other (different JWT secrets) — after a
 * failover the user simply logs in again.
 */
const FALLBACK_BASE = FALLBACK_RAW && FALLBACK_RAW.length > 0 ? FALLBACK_RAW : null

/** How long to wait for the primary before trying the standby. */
const PRIMARY_TIMEOUT_MS = 12000
/** Standby may be asleep — give it time to cold-start. */
const FALLBACK_TIMEOUT_MS = 75000

export const TOKEN_KEY = 'invento_token'

export type ApiMode = 'primary' | 'standby'

let apiMode: ApiMode = 'primary'
const modeListeners = new Set<(mode: ApiMode) => void>()

function setApiMode(mode: ApiMode): void {
  if (apiMode === mode) return
  apiMode = mode
  for (const listener of modeListeners) {
    try {
      listener(mode)
    } catch {
      // Listener errors must never break API calls.
    }
  }
}

/** Which backend is currently serving requests. */
export function getApiMode(): ApiMode {
  return apiMode
}

export function isStandby(): boolean {
  return apiMode === 'standby'
}

/** Subscribe to backend switches (primary <-> standby). Returns an unsubscribe fn. */
export function subscribeApiMode(listener: (mode: ApiMode) => void): () => void {
  modeListeners.add(listener)
  return () => {
    modeListeners.delete(listener)
  }
}

/**
 * Forget the standby and try the primary again on the next request.
 * Called automatically after a successful primary response; also safe to call
 * from a "Retry main server" button.
 */
export function retryPrimary(): void {
  setApiMode('primary')
}

export class ApiError extends Error {
  status: number
  /** True when this error came from our own request timeout (server may still have processed it). */
  timedOut: boolean

  constructor(status: number, message: string, timedOut = false) {
    super(message)
    this.status = status
    this.timedOut = timedOut
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body' | 'signal'> {
  body?: unknown
  /** Abort the request after this many ms. Throw is ApiError status 0 (network error). */
  timeoutMs?: number
}

/** True when the request never got an HTTP response (server down/sleeping, offline, timeout). */
export function isNetworkError(err: unknown): boolean {
  return err instanceof ApiError && err.status === 0
}

/** Gateway errors from Caddy/Render that mean "this server is unhealthy, try the other". */
function isFailoverStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504
}

function isSafeMethod(method: string | undefined): boolean {
  return (
    method === undefined || method === 'GET' || method === 'HEAD' || method === 'OPTIONS'
  )
}

interface RawResult {
  kind: 'response'
  response: Response
  base: string
  mode: ApiMode
}

async function rawFetch(
  base: string,
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(`${base}${path}`, { ...init, signal: controller.signal })
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError(
        0,
        'The server is taking too long. It may be waking up — please retry.',
        true,
      )
    }
    throw new ApiError(0, 'Cannot reach the server. Check your connection.')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Fetch trying the current backend first, then the other one.
 *
 * Non-idempotent requests (POST/PUT/PATCH/DELETE) are retried on the other
 * server ONLY when the first server was clearly never reached (connection
 * refused / DNS / offline — the fetch itself threw). A timeout or a 502/503/
 * 504 on a mutation is NOT retried automatically: the first server may have
 * already applied it, and retrying elsewhere would duplicate it. In that case
 * the caller gets the error and the user retries deliberately.
 */
async function fetchWithFailover(
  path: string,
  init: RequestInit,
  timeoutMs: number | undefined,
): Promise<RawResult> {
  const method = init.method
  const primaryTimeout = timeoutMs ?? PRIMARY_TIMEOUT_MS
  const fallbackTimeout = timeoutMs ?? FALLBACK_TIMEOUT_MS

  // Order: current mode first so steady-state standby traffic never pays the
  // primary timeout on every request; recovery happens opportunistically.
  const attempts: Array<{ base: string; mode: ApiMode; timeout: number }> =
    apiMode === 'primary'
      ? [
          { base: PRIMARY_BASE, mode: 'primary', timeout: primaryTimeout },
          ...(FALLBACK_BASE
            ? [{ base: FALLBACK_BASE, mode: 'standby' as ApiMode, timeout: fallbackTimeout }]
            : []),
        ]
      : [
          ...(FALLBACK_BASE
            ? [{ base: FALLBACK_BASE, mode: 'standby' as ApiMode, timeout: fallbackTimeout }]
            : []),
          { base: PRIMARY_BASE, mode: 'primary', timeout: primaryTimeout },
        ]

  let firstError: ApiError | null = null
  for (let i = 0; i < attempts.length; i++) {
    const attempt = attempts[i]
    const isLast = i === attempts.length - 1
    try {
      const response = await rawFetch(attempt.base, path, init, attempt.timeout)
      if (!isLast && isFailoverStatus(response.status)) {
        // Unhealthy gateway response — try the other server (safe methods
        // always; mutations only via the network-error path below, so throw
        // here and let the caller surface it).
        if (!isSafeMethod(method)) throw new ApiError(response.status, await errorText(response))
        firstError = new ApiError(response.status, 'Server unhealthy, trying standby.')
        continue
      }
      setApiMode(attempt.mode)
      return { kind: 'response', response, base: attempt.base, mode: attempt.mode }
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(0, 'Cannot reach the server.')
      if (isLast) {
        if (firstError && apiMode === 'primary' && attempts.length > 1) {
          // Both backends failed.
          throw new ApiError(
            0,
            'Neither the main server nor the standby could be reached. The standby may still be waking up — wait a minute and retry.',
          )
        }
        throw firstError ?? apiErr
      }
      // There is another backend to try. Mutations are only retried when the
      // first server was never reached (network threw, not our own timeout).
      if (!isSafeMethod(method) && !(apiErr.status === 0 && !apiErr.timedOut)) {
        throw apiErr
      }
      firstError = apiErr
    }
  }
  throw firstError ?? new ApiError(0, 'Cannot reach the server. Check your connection.')
}

async function errorText(response: Response): Promise<string> {
  try {
    const data: unknown = await response.clone().json()
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const raw = (data as { detail: unknown }).detail
      if (typeof raw === 'string') return raw
    }
  } catch {
    // Fall through to the generic message.
  }
  return 'Something went wrong. Please try again.'
}

function parseDetail(data: unknown): string {
  let detail = 'Something went wrong. Please try again.'
  if (typeof data === 'object' && data !== null && 'detail' in data) {
    const raw = (data as { detail: unknown }).detail
    if (typeof raw === 'string') detail = raw
    else if (Array.isArray(raw)) {
      const msgs = raw
        .map((e) => {
          if (typeof e === 'string') return e
          if (typeof e === 'object' && e !== null && 'msg' in e) {
            const loc =
              'loc' in e && Array.isArray((e as { loc: unknown }).loc)
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
  return detail
}

export async function apiFetch<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY)
  const { timeoutMs, ...fetchOptions } = options
  const headers = new Headers(fetchOptions.headers)
  if (fetchOptions.body !== undefined && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const init: RequestInit = {
    ...fetchOptions,
    headers,
    body: fetchOptions.body === undefined ? undefined : JSON.stringify(fetchOptions.body),
  }

  const { response, mode } = await fetchWithFailover(path, init, timeoutMs)

  if (response.status === 204) {
    return undefined as T
  }

  const data: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    if (response.status === 401 && token && path !== '/auth/login') {
      // Token expired or revoked — clear so RequireAuth sends user to login.
      // (Also happens right after a failover: tokens are per-server.)
      localStorage.removeItem(TOKEN_KEY)
    }
    // FastAPI validation errors arrive as { detail: [{ loc, msg, ... }] } —
    // join the messages so the user sees "body → quantity: ..." instead of
    // "[object Object]". Domain errors are already { detail: string }.
    let detail = parseDetail(data)
    if (mode === 'standby' && response.status !== 401) {
      detail += ' (served by the standby server)'
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

  const { response } = await fetchWithFailover(path, { headers }, undefined)
  if (!response.ok) {
    if (response.status === 401 && token) localStorage.removeItem(TOKEN_KEY)
    throw new ApiError(response.status, 'The download failed. Please try again.')
  }
  return response.blob()
}
