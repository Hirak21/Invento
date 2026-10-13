import { useEffect, useState } from 'react'

import { getApiMode, retryPrimary, subscribeApiMode } from '@/services/api'
import type { ApiMode } from '@/services/api'

/**
 * Slim notice shown when the app is served by the standby backend (Render)
 * because the main VPS server could not be reached. Lets the user jump back
 * to the main server once it is back up (next request probes it again).
 */
export function ServerModeBanner() {
  const [mode, setMode] = useState<ApiMode>(() => getApiMode())

  useEffect(() => subscribeApiMode(setMode), [])

  if (mode !== 'standby') return null

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-amber-100 px-3 py-2 text-center text-xs text-amber-900"
    >
      <span>
        Main server unreachable — running on the <strong>standby server</strong> (older data).
        You may need to sign in again.
      </span>
      <button
        type="button"
        onClick={retryPrimary}
        className="font-semibold underline underline-offset-2 hover:text-amber-700"
      >
        Retry main server
      </button>
    </div>
  )
}
