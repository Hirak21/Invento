'use client';

import {
  LineChart as RechartsLineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/utils/cn';

interface LineChartData {
  name: string;
  [key: string]: string | number;
}

type CurveType = 'basis' | 'basisClosed' | 'basisOpen' | 'linear' | 'linearClosed' | 'monotone' | 'natural' | 'step' | 'stepBefore' | 'stepAfter';

interface LineChartSeries {
  dataKey: string;
  name: string;
  color: string;
  strokeWidth?: number;
  dotRadius?: number;
  showArea?: boolean;
  areaOpacity?: number;
  type?: CurveType;
}

const DEFAULT_COLORS = [
  '#334155',
  '#059669',
  '#2563eb',
  '#d97706',
  '#dc2626',
  '#7c3aed',
  '#0891b2',
  '#be185d',
];

interface LineChartProps {
  data: LineChartData[];
  series: LineChartSeries[];
  xKey: string;
  height?: number;
  className?: string;
  showGrid?: boolean;
  showLegend?: boolean;
  showTooltip?: boolean;
  showDots?: boolean;
  showXAxis?: boolean;
  showYAxis?: boolean;
  yDomain?: [number | 'auto', number | 'auto'];
  xAxisTickFormatter?: (value: string) => string;
  yAxisTickFormatter?: (value: number) => string;
  tooltipFormatter?: (value: number, name: string) => [string, string];
  onClick?: (data: LineChartData, series: LineChartSeries) => void;
  animationDuration?: number;
}

export function LineChart({
  data,
  series,
  xKey,
  height = 250,
  className,
  showGrid = true,
  showLegend = false,
  showTooltip = true,
  showDots = false,
  showXAxis = true,
  showYAxis = true,
  yDomain = ['auto', 'auto'],
  xAxisTickFormatter,
  yAxisTickFormatter,
  tooltipFormatter,
  animationDuration = 300,
}: LineChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[250px] bg-slate-50 rounded-lg border border-dashed border-slate-200', className)}>
        <p className="text-sm text-slate-500">No data available</p>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: {
    active?: boolean;
    payload?: Array<{ value: number; name: string; color: string; dataKey: string; payload: LineChartData }>;
    label?: string;
  }) => {
    if (!active || !payload || !payload.length) return null;

    const items = payload.map((entry) => {
      const seriesConfig = series.find((s) => s.dataKey === entry.dataKey);
      const formattedValue = tooltipFormatter
        ? tooltipFormatter(entry.value, entry.name)
        : seriesConfig?.name === 'Sales' || entry.dataKey.includes('sales')
          ? [`₹${Number(entry.value).toLocaleString('en-IN')}`, seriesConfig?.name || entry.name]
          : [`${Number(entry.value).toLocaleString('en-IN')}`, seriesConfig?.name || entry.name];

      return (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-sm text-slate-700">{formattedValue[1]}: </span>
          <span className="text-sm font-semibold text-slate-900 tabular-nums">{formattedValue[0]}</span>
        </div>
      );
    });

    return (
      <div className="rounded-lg bg-white border border-slate-200 p-3 shadow-lg min-w-[180px]">
        <p className="text-xs font-medium text-slate-500 mb-2">{xAxisTickFormatter ? xAxisTickFormatter(label as string) : label}</p>
        <div className="space-y-1">{items}</div>
      </div>
    );
  };

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart
          data={data}
          margin={{ top: 10, right: 20, left: 0, bottom: showXAxis ? 20 : 0 }}
        >
          {showGrid && (
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e6e8ea"
              vertical={false}
              horizontal={true}
            />
          )}
          <XAxis
            dataKey={xKey}
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={{ stroke: '#e6e8ea' }}
            tickLine={false}
            tickFormatter={xAxisTickFormatter}
            hide={!showXAxis}
            dy={8}
          />
          <YAxis
            tick={{ fontSize: 11, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickFormatter={yAxisTickFormatter || ((value) => `₹${Number(value).toLocaleString('en-IN')}`)}
            domain={yDomain}
            hide={!showYAxis}
            width={50}
            orientation="left"
            tickCount={5}
          />
          {showTooltip && <Tooltip content={<CustomTooltip />} />}
          {showLegend && (
            <Legend
              layout="horizontal"
              align="center"
              verticalAlign="top"
              iconType="line"
              wrapperStyle={{ paddingTop: 10 }}
              formatter={(value) => (
                <span className="flex items-center gap-1 text-sm text-slate-600">
                  {value}
                </span>
              )}
            />
          )}
          {series.map((s, index) => {
            const color = s.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length];
            const strokeWidth = s.strokeWidth ?? 2;
            const dotRadius = s.dotRadius ?? 4;
            const type = s.type ?? 'monotone';

            if (s.showArea) {
              return (
                <Area
                  key={`area-${s.dataKey}`}
                  type={type}
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={color}
                  strokeWidth={strokeWidth}
                  fill={color}
                  fillOpacity={s.areaOpacity ?? 0.15}
                  dot={showDots ? { r: dotRadius, strokeWidth: 2, stroke: '#fff' } : false}
                  activeDot={showDots ? { r: dotRadius + 2, strokeWidth: 2, stroke: '#fff' } : false}
                  animationDuration={animationDuration}
                  isAnimationActive={true}
                />
              );
            }

            return (
              <Line
                key={`line-${s.dataKey}`}
                type={type}
                dataKey={s.dataKey}
                name={s.name}
                stroke={color}
                strokeWidth={strokeWidth}
                dot={showDots ? { r: dotRadius, strokeWidth: 2, stroke: '#fff' } : false}
                activeDot={showDots ? { r: dotRadius + 2, strokeWidth: 2, stroke: '#fff' } : false}
                animationDuration={animationDuration}
                isAnimationActive={true}
              />
            );
          })}
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}

interface SparklineProps {
  data: number[];
  color?: string;
  height?: number;
  width?: number | string;
  showArea?: boolean;
  areaOpacity?: number;
  strokeWidth?: number;
  className?: string;
  onClick?: () => void;
}

export function Sparkline({
  data,
  color = '#334155',
  height = 40,
  width = '100%',
  showArea = true,
  areaOpacity = 0.15,
  strokeWidth = 2,
  className,
  onClick,
}: SparklineProps) {
  if (!data || data.length === 0) {
    return (
      <div
        className={cn('bg-slate-50 rounded', className)}
        style={{ width, height: `${height}px` }}
        aria-hidden="true"
      />
    );
  }

  const chartData = data.map((value, index) => ({ value, index }));

  return (
    <div
      className={cn(className)}
      style={{ width }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => e.key === 'Enter' && onClick?.()}
      aria-label={onClick ? 'View detailed chart' : undefined}
    >
      <ResponsiveContainer width="100%" height={height}>
        <RechartsLineChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
          <XAxis type="number" dataKey="index" hide />
          <YAxis type="number" dataKey="value" hide />
          {showArea && (
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={strokeWidth}
              fill={color}
              fillOpacity={areaOpacity}
              dot={false}
              animationDuration={300}
            />
          )}
          <Line
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={strokeWidth}
            dot={false}
            animationDuration={300}
          />
        </RechartsLineChart>
      </ResponsiveContainer>
    </div>
  );
}