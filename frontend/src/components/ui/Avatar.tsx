import type { HTMLAttributes } from 'react'
import { cn } from '@/utils/cn'

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'square'
  status?: 'online' | 'offline' | 'busy'
}

const sizeClasses = {
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
}

const statusSizeClasses = {
  sm: 'w-2 h-2',
  md: 'w-2.5 h-2.5',
  lg: 'w-3 h-3',
  xl: 'w-4 h-4',
}

const statusColors = {
  online: 'bg-[var(--color-accent)]',
  offline: 'bg-[var(--color-muted)]',
  busy: 'bg-[var(--color-destructive)]',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

export function Avatar({ src, alt, name, size = 'md', shape = 'circle', status, className, ...rest }: AvatarProps) {
  const isCircle = shape === 'circle'

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden', sizeClasses[size], className)} {...rest}>
      {src ? (
        <img
          src={src}
          alt={alt ?? name ?? 'Avatar'}
          className={cn('w-full h-full object-cover', isCircle && 'rounded-full')}
        />
      ) : (
        <div
          className={cn(
            'w-full h-full bg-[var(--color-bg-tertiary)] flex items-center justify-center font-medium text-[var(--color-text-secondary)]',
            isCircle ? 'rounded-full' : 'rounded-xl',
          )}
        >
          {name ? getInitials(name) : '?'}
        </div>
      )}
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 border-2 border-[var(--color-surface)] rounded-full',
            statusSizeClasses[size],
            statusColors[status],
          )}
          aria-label={status}
        />
      )}
    </div>
  )
}

interface AvatarGroupProps {
  avatars: Array<{ src?: string | null; name?: string; alt?: string }>
  max?: number
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export function AvatarGroup({ avatars, max = 4, size = 'md', className }: AvatarGroupProps) {
  const visible = avatars.slice(0, max)
  const remaining = avatars.length - max

  return (
    <div className={cn('flex -space-x-2', className)} aria-label={`${avatars.length} people`}>
      {visible.map((avatar, index) => (
        <Avatar key={index} src={avatar.src} name={avatar.name} alt={avatar.alt} size={size} />
      ))}
      {remaining > 0 && (
        <div
          className={cn(
            'flex shrink-0 items-center justify-center bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] font-medium border-2 border-[var(--color-surface)]',
            sizeClasses[size],
            'rounded-full',
          )}
        >
          +{remaining}
        </div>
      )}
    </div>
  )
}