'use client';

import { cn } from '@/utils/cn';

interface BulletChartProps {
  /** Current value */
  value: number;
  /** Target value */
  target: number;
  /** Ranges for qualitative bands [poor, satisfactory, good] */
  ranges?: [number, number, number];
  /** Label for the metric */
  label?: string;
  /** Unit suffix (e.g., '₹', '%', ' units') */
  unit?: string;
  /** Height of the chart */
  height?: number;
  /** Width of the chart (default: full container) */
  width?: string | number;
  /** Color for the performance bar */
  performanceColor?: string;
  /** Color for the target marker */
  targetColor?: string;
  /** Range colors [poor, satisfactory, good] */
  rangeColors?: [string, string, string];
  /** Show tooltip on hover */
  showTooltip?: boolean;
  /** Custom className */
  className?: string;
  /** Accessibility label */
  ariaLabel?: string;
}

export function BulletChart({
  value,
  target,
  ranges = [0, 0, 0],
  label,
  unit = '',
  height = 48,
  width = '100%',
  performanceColor = '#334155',
  targetColor = '#000000',
  rangeColors = ['#fecaca', '#fef08a', '#bbf7d0'],
  showTooltip = true,
  className,
  ariaLabel,
}: BulletChartProps) {
  const [poorMax, satisfactoryMax, goodMax] = ranges;

  // Calculate percentages for rendering
  const maxRange = Math.max(goodMax, target, value, 1);
  const valuePercent = Math.min((value / maxRange) * 100, 100);
  const targetPercent = Math.min((target / maxRange) * 100, 100);
  const poorPercent = Math.min((poorMax / maxRange) * 100, 100);
  const satisfactoryPercent = Math.min((satisfactoryMax / maxRange) * 100, 100);
  const goodPercent = Math.min((goodMax / maxRange) * 100, 100);

  const formattedValue = unit === '₹'
    ? `₹${value.toLocaleString('en-IN')}`
    : `${value.toLocaleString('en-IN')}${unit}`;
  const formattedTarget = unit === '₹'
    ? `₹${target.toLocaleString('en-IN')}`
    : `${target.toLocaleString('en-IN')}${unit}`;

  const a11yLabel = ariaLabel || `${label || 'Metric'}: ${formattedValue}, target ${formattedTarget}`;

  return (
    <div
      className={cn('w-full', className)}
      style={{ width, height: `${height}px` }}
      role="img"
      aria-label={a11yLabel}
    >
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-700">{label}</span>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{formattedValue}</span>
        </div>
      )}
      <div
        className="relative"
        style={{ height: `${height - (label ? 24 : 0)}px` }}
      >
        {/* Qualitative ranges */}
        <div className="absolute inset-0 flex h-full">
          {poorMax > 0 && (
            <div
              className="h-full rounded-l"
              style={{
                width: `${poorPercent}%`,
                backgroundColor: rangeColors[0],
              }}
              aria-hidden="true"
            />
          )}
          {satisfactoryMax > poorMax && (
            <div
              className="h-full"
              style={{
                width: `${satisfactoryPercent - poorPercent}%`,
                backgroundColor: rangeColors[1],
              }}
              aria-hidden="true"
            />
          )}
          {goodMax > satisfactoryMax && (
            <div
              className="h-full rounded-r"
              style={{
                width: `${goodPercent - satisfactoryPercent}%`,
                backgroundColor: rangeColors[2],
              }}
              aria-hidden="true"
            />
          )}
        </div>

        {/* Performance bar */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-2 rounded"
          style={{
            width: `${valuePercent}%`,
            backgroundColor: performanceColor,
            maxWidth: '100%',
          }}
          aria-hidden="true"
        >
          {showTooltip && (
            <div
              className="absolute top-full left-0 mt-1 transform -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity hover:opacity-100"
              style={{ left: `${valuePercent}%` }}
            >
              {formattedValue}
            </div>
          )}
        </div>

        {/* Target marker */}
        {target > 0 && (
          <div
            className="absolute top-1/2 -translate-y-1/2 w-[3px] h-6 -translate-x-[1.5px] rounded"
            style={{
              left: `${Math.min(targetPercent, 100)}%`,
              backgroundColor: targetColor,
            }}
            aria-hidden="true"
          >
            {showTooltip && (
              <div
                className="absolute top-full left-1/2 mt-1 transform -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 transition-opacity hover:opacity-100"
              >
                Target: {formattedTarget}
              </div>
            )}
          </div>
        )}
      </div>
      {(!label || showTooltip) && (
        <div className="mt-1 flex items-center justify-between text-xs text-slate-500">
          <span>Target: {formattedTarget}</span>
          {poorMax > 0 && (
            <>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: rangeColors[0] }} />
                Poor
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: rangeColors[1] }} />
                OK
              </span>
              <span className="flex items-center gap-1">
                <span className="w-3 h-3 rounded" style={{ backgroundColor: rangeColors[2] }} />
                Good
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

interface BulletChartGridProps {
  items: BulletChartProps[];
  columns?: { sm?: number; md?: number; lg?: number; xl?: number };
  className?: string;
}

export function BulletChartGrid({
  items,
  columns = { sm: 1, md: 2, lg: 3, xl: 4 },
  className,
}: BulletChartGridProps) {
  return (
    <div
      className={cn(
        'grid gap-4',
        `grid-cols-${columns.sm}`,
        `sm:grid-cols-${columns.md}`,
        `lg:grid-cols-${columns.lg}`,
        `xl:grid-cols-${columns.xl}`,
        className,
      )}
    >
      {items.map((item, index) => (
        <BulletChart key={`${item.label}-${index}`} {...item} />
      ))}
    </div>
  );
}