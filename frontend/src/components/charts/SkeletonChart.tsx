'use client';

import { cn } from '@/utils/cn';

interface SkeletonBarChartProps {
  bars?: number;
  height?: number;
  className?: string;
}

export function SkeletonBarChart({ bars = 6, height = 200, className }: SkeletonBarChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height: `${height}px` }}>
      <div className="flex h-full items-end gap-2 p-2" role="status" aria-label="Loading chart">
        {Array.from({ length: bars }).map((_, i) => (
          <div
            key={i}
            className="flex-1 rounded-t skeleton animate-pulse"
            style={{
              height: `${30 + Math.random() * 70}%`,
              minHeight: '20px',
              animationDelay: `${i * 100}ms`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface SkeletonLineChartProps {
  points?: number;
  height?: number;
  className?: string;
}

export function SkeletonLineChart({ points = 8, height = 200, className }: SkeletonLineChartProps) {
  return (
    <div className={cn('w-full', className)} style={{ height: `${height}px` }} role="status" aria-label="Loading chart">
      <div className="relative h-full">
        <svg className="w-full h-full" viewBox={`0 0 400 ${height}`} preserveAspectRatio="none">
          <defs>
            <linearGradient id="skeleton-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e6e8ea" />
              <stop offset="100%" stopColor="#f2f3f4" />
            </linearGradient>
          </defs>
          <rect width="100%" height="100%" fill="url(#skeleton-gradient)" className="animate-pulse" />
        </svg>
        <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between h-[60%]">
          {Array.from({ length: points }).map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full skeleton animate-pulse"
              style={{ animationDelay: `${i * 80}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

interface SkeletonPieChartProps {
  height?: number;
  className?: string;
}

export function SkeletonPieChart({ height = 200, className }: SkeletonPieChartProps) {
  return (
    <div className={cn('relative w-full', className)} style={{ height: `${height}px` }} role="status" aria-label="Loading chart">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-32 h-32 rounded-full border-4 border-slate-200 animate-pulse" />
      </div>
      <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 skeleton animate-pulse"
            style={{ animationDelay: `${i * 100}ms`, width: '80px' }}
          >
            <div className="w-3 h-3 rounded-full" />
            <div className="flex-1 h-3 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

interface SkeletonBulletChartProps {
  count?: number;
  height?: number;
  className?: string;
}

export function SkeletonBulletChart({ count = 1, height = 48, className }: SkeletonBulletChartProps) {
  return (
    <div className={cn('space-y-4', className)} role="status" aria-label="Loading KPIs" style={{ height: `${height * count + 16 * (count - 1)}px` }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="h-4 w-24 skeleton animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
            <div className="h-5 w-20 skeleton animate-pulse" style={{ animationDelay: `${i * 100 + 50}ms` }} />
          </div>
          <div className="h-[calc(100%-24px)] min-h-[24px] skeleton animate-pulse rounded" style={{ animationDelay: `${i * 100 + 100}ms` }} />
          <div className="flex items-center justify-between text-xs">
            <div className="h-3 w-16 skeleton animate-pulse" />
            <div className="h-3 w-16 skeleton animate-pulse" />
            <div className="h-3 w-16 skeleton animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface SkeletonKPICardProps {
  count?: number;
  className?: string;
}

export function SkeletonKPICard({ count = 4, className }: SkeletonKPICardProps) {
  return (
    <div className={cn('grid gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-slate-200 bg-white p-5 space-y-3 skeleton animate-pulse"
          style={{ animationDelay: `${i * 80}ms` }}
        >
          <div className="h-4 w-32 rounded" />
          <div className="h-8 w-24 rounded" />
          <div className="h-3 w-40 rounded" />
        </div>
      ))}
    </div>
  );
}