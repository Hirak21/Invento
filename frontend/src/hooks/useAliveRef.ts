import { useEffect, useRef } from 'react'
import type { MutableRefObject } from 'react'

/**
 * Ref that is `true` while the component is mounted and flips to `false` in
 * the unmount cleanup. Guard async `.then` callbacks with it so a response
 * that lands after unmount never calls setState.
 */
export function useAliveRef(): MutableRefObject<boolean> {
  const alive = useRef(true)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])
  return alive
}
