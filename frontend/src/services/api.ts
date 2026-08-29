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
    const detail =
      typeof data === 'object' && data !== null && 'detail' in data
        ? String((data as { detail: unknown }).detail)
        : 'Something went wrong. Please try again.'
    throw new ApiError(response.status, detail)
  }

  return data as T
}
