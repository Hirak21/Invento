import { TOKEN_KEY, apiFetch } from './api'
import type { User } from '@/types/user'

interface TokenResponse {
  access_token: string
  token_type: string
  user: User
}

interface BootstrapStatus {
  needs_bootstrap: boolean
}

export async function needsBootstrap(): Promise<boolean> {
  const status = await apiFetch<BootstrapStatus>('/auth/needs-bootstrap')
  return status.needs_bootstrap
}

function storeToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export async function login(username: string, password: string): Promise<User> {
  const result = await apiFetch<TokenResponse>('/auth/login', {
    method: 'POST',
    body: { username, password },
  })
  storeToken(result.access_token)
  return result.user
}

export async function bootstrapOwner(username: string, password: string): Promise<User> {
  const result = await apiFetch<TokenResponse>('/auth/bootstrap-owner', {
    method: 'POST',
    body: { username, password },
  })
  storeToken(result.access_token)
  return result.user
}

export async function fetchCurrentUser(): Promise<User> {
  return apiFetch<User>('/auth/me')
}
