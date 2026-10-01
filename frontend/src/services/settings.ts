import { apiFetch } from './api'

export interface BusinessSettings {
  business_name: string
  has_logo: boolean
  logo_url: string | null
  logo_absolute_url: string | null
  logo_updated_at: string | null
}

export function getSettings(): Promise<BusinessSettings> {
  return apiFetch<BusinessSettings>('/settings')
}

export function updateSettings(patch: {
  business_name?: string
  logo_data_uri?: string | null
  logo_url?: string | null
  remove_logo?: boolean
}): Promise<BusinessSettings> {
  return apiFetch<BusinessSettings>('/settings', { method: 'PUT', body: patch })
}

/** Same-origin logo <img> src. Returns null when no logo is set. */
export function logoImgSrc(settings: BusinessSettings | null): string | null {
  if (!settings?.has_logo) return null
  // Backend returns a same-origin path (or absolute URL for external logos).
  return settings.logo_url
}
