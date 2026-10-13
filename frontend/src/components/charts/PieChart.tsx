'use client';

import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ReactNode } from 'react';
import { cn } from '@/utils/cn';

interface PieChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

const DEFAULT_COLORS = [
  '#334155', // slate-700
  '#059669', // emerald-600
  '#2563eb', // blue-600
  '#d97706', // amber-600
  '#dc2626', // red-600
  '#7c3aed', // violet-600
  '#0891b2', // cyan-600
  '#be185d', // pink-600
];

interface PieChartProps {
  data: PieChartData[];
  nameKey?: string;
  dataKey?: string;
  height?: number;
  innerRadius?: number;
  outerRadius?: number;
  colors?: string[];
  className?: string;
  showLegend?: boolean;
  showTooltip?: boolean;
  showLabels?: boolean;
  labelLine?: boolean;
  padAngle?: number;
  onClick?: (data: PieChartData, index: number) => void;
}

const currencyFormatter = (value: number | undefined, _name: string) => (value !== undefined ? [`₹${value.toLocaleString('en-IN')}`, ''] : ['', '']);

export function PieChart({
  data,
  nameKey = 'name',
  dataKey = 'value',
  height = 200,
  innerRadius = 60,
  outerRadius = 80,
  colors = DEFAULT_COLORS,
  className,
  showLegend = true,
  showTooltip = true,
  showLabels = false,
  labelLine = false,
  padAngle = 2,
  onClick,
}: PieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[200px] bg-slate-50 rounded-lg border border-dashed border-slate-200', className)}>
        <p className="text-sm text-slate-500">No data available</p>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item[dataKey]), 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload: PieChartData }> }) => {
    if (!active || !payload || !payload[0]) return null;

    const { value, name, color } = payload[0];
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

    return (
      <div
        className="rounded-lg bg-white border border-slate-200 p-3 shadow-lg"
        style={{ minWidth: 160 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-slate-900">{name}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">₹{Number(value).toLocaleString('en-IN')}</span>
          <span className="font-semibold text-slate-900">{percentage}%</span>
        </div>
      </div>
    );
  };

  const legendPayload = data.map((d, i) => ({
    value: Number(d[dataKey]),
    id: d[nameKey],
    color: colors[i % colors.length],
    type: 'circle' as const,
  }));

  const CustomLegend = () => (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-4" role="list">
      {legendPayload.map((entry, index) => (
        <div
          key={`legend-${entry.id}-${index}`}
          className="flex items-center gap-2 cursor-pointer"
          role="listitem"
          onClick={() => onClick?.(data[index], index)}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-slate-700 truncate max-w-[120px]">
            {entry.id}
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            {total > 0 ? `${((entry.value / total) * 100).toFixed(1)}%` : '0%'}
          </span>
        </div>
      ))}
    </div>
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handlePieClick = onClick ? (payload: any) => {
    if (payload?.payload?.payload && typeof payload.index === 'number') {
      onClick(payload.payload.payload, payload.index);
    }
  } : undefined;

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart onClick={handlePieClick}>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={padAngle}
            dataKey={dataKey}
            nameKey={nameKey}
            label={showLabels ? ({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%` : false}
            labelLine={labelLine}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          {showTooltip && <Tooltip content={<CustomTooltip />} // @ts-expect-error - Recharts formatter type mismatch
            formatter={currencyFormatter} />}
          {showLegend && <CustomLegend />}
        </RechartsPieChart>
      </ResponsiveContainer>
    </div>
  );
}

interface DonutChartProps extends Omit<PieChartProps, 'innerRadius'> {
  /** Center content */
  centerContent?: ReactNode;
  /** Center value (large number) */
  centerValue?: string | number;
  /** Center label */
  centerLabel?: string;
  /** Inner radius for donut */
  innerRadius?: number;
}

export function DonutChart({
  data,
  nameKey = 'name',
  dataKey = 'value',
  height = 200,
  innerRadius = 55,
  outerRadius = 75,
  colors = DEFAULT_COLORS,
  className,
  showLegend = true,
  showTooltip = true,
  centerContent,
  centerValue,
  centerLabel,
}: DonutChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[200px] bg-slate-50 rounded-lg border border-dashed border-slate-200', className)}>
        <p className="text-sm text-slate-500">No data available</p>
      </div>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item[dataKey]), 0);

  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ value: number; name: string; color: string; payload: PieChartData }> }) => {
    if (!active || !payload || !payload[0]) return null;

    const { value, name, color } = payload[0];
    const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : '0';

    return (
      <div
        className="rounded-lg bg-white border border-slate-200 p-3 shadow-lg"
        style={{ minWidth: 160 }}
      >
        <div className="flex items-center gap-2 mb-1">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
          <span className="font-medium text-slate-900">{name}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-600">₹{Number(value).toLocaleString('en-IN')}</span>
          <span className="font-semibold text-slate-900">{percentage}%</span>
        </div>
      </div>
    );
  };

  const legendPayload = data.map((d, i) => ({
    value: Number(d[dataKey]),
    id: d[nameKey],
    color: colors[i % colors.length],
    type: 'circle' as const,
  }));

  const CustomLegend = () => (
    <div className="flex flex-wrap items-center justify-center gap-3 mt-4" role="list">
      {legendPayload.map((entry, index) => (
        <div
          key={`legend-${entry.id}-${index}`}
          className="flex items-center gap-2 cursor-pointer"
          role="listitem"
          onClick={() => { /* no onClick for donut */ }}
        >
          <div
            className="w-3 h-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm text-slate-700 truncate max-w-[120px]">
            {entry.id}
          </span>
          <span className="text-xs text-slate-500 tabular-nums">
            {total > 0 ? `${((entry.value / total) * 100).toFixed(1)}%` : '0%'}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className={cn('relative w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsPieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={outerRadius}
            paddingAngle={2}
            dataKey={dataKey}
            nameKey={nameKey}
            label={false}
            labelLine={false}
            startAngle={90}
            endAngle={-270}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
            ))}
          </Pie>
          {showTooltip && <Tooltip content={<CustomTooltip />} // @ts-expect-error - Recharts formatter type mismatch
            formatter={currencyFormatter} />}
          {showLegend && <CustomLegend />}
        </RechartsPieChart>
      </ResponsiveContainer>

      {(centerContent || centerValue !== undefined || centerLabel) && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none"
          aria-hidden="true"
        >
          {centerContent || (
            <>
              {centerValue !== undefined && (
                <span className="text-2xl font-bold text-slate-900 tabular-nums">
                  {centerValue}
                </span>
              )}
              {centerLabel && (
                <span className="text-xs text-slate-500 mt-0.5">{centerLabel}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}