import { useEffect, useState } from 'react'

/** True when the viewport is a mobile-sized screen (< 768px). */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < breakpoint : false,
  )

  useEffect(() => {
    const query = window.matchMedia(`(max-width: ${breakpoint - 1}px)`)
    const update = () => setIsMobile(query.matches)
    update()
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [breakpoint])

  return isMobile
}
