'use client';

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { cn } from '@/utils/cn';

interface BarChartData {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface BarChartProps {
  data: BarChartData[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
  className?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  radius?: [number, number, number, number];
}

const currencyFormatter = (value: number | undefined, _name: string) => (value !== undefined ? [`₹${value.toLocaleString('en-IN')}`, ''] : ['', '']);

export function BarChart({
  data,
  dataKey,
  nameKey = 'name',
  height = 200,
  color = '#334155',
  className,
  showGrid = false,
  showTooltip = true,
  radius = [4, 4, 0, 0],
}: BarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[200px] bg-slate-50 rounded-lg border border-dashed border-slate-200', className)}>
        <p className="text-sm text-slate-500">No data available</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => Number(d[dataKey])), 1);

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          layout="vertical"
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ea" vertical={false} />}
          <XAxis
            type="number"
            dataKey={dataKey}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            domain={[0, maxValue * 1.15]}
          />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={80}
            tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            padding={{ top: 10, bottom: 10 }}
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e6e8ea',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#334155', fontWeight: 600, fontSize: 12 }}
              itemStyle={{ color: '#0f172a', fontSize: 12 }}
              // @ts-expect-error - Recharts formatter type mismatch
              formatter={currencyFormatter}
            />
          )}
          <Bar
            dataKey={dataKey}
            radius={radius}
            fill={color}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={color} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}

interface HorizontalBarChartProps {
  data: BarChartData[];
  dataKey: string;
  nameKey?: string;
  height?: number;
  color?: string;
  className?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  radius?: [number, number, number, number];
}

export function HorizontalBarChart({
  data,
  dataKey,
  nameKey = 'name',
  height = 200,
  color = '#334155',
  className,
  showGrid = false,
  showTooltip = true,
  radius = [0, 4, 4, 0],
}: HorizontalBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-[200px] bg-slate-50 rounded-lg border border-dashed border-slate-200', className)}>
        <p className="text-sm text-slate-500">No data available</p>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((d) => Number(d[dataKey])), 1);

  return (
    <div className={cn('w-full', className)}>
      <ResponsiveContainer width="100%" height={height}>
        <RechartsBarChart
          data={data}
          margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
        >
          {showGrid && <CartesianGrid strokeDasharray="3 3" stroke="#e6e8ea" vertical={true} />}
          <XAxis
            type="number"
            dataKey={dataKey}
            tick={{ fontSize: 10, fill: '#94a3b8' }}
            axisLine={false}
            tickLine={false}
            tickCount={4}
            domain={[0, maxValue * 1.15]}
          />
          <YAxis
            type="category"
            dataKey={nameKey}
            width={100}
            tick={{ fontSize: 11, fill: '#475569', fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            padding={{ top: 10, bottom: 10 }}
          />
          {showTooltip && (
            <Tooltip
              contentStyle={{
                backgroundColor: '#fff',
                border: '1px solid #e6e8ea',
                borderRadius: '8px',
                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                padding: '8px 12px',
              }}
              labelStyle={{ color: '#334155', fontWeight: 600, fontSize: 12 }}
              itemStyle={{ color: '#0f172a', fontSize: 12 }}
              // @ts-expect-error - Recharts formatter type mismatch
              formatter={currencyFormatter}
            />
          )}
          <Bar
            dataKey={dataKey}
            radius={radius}
            fill={color}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={color} />
            ))}
          </Bar>
        </RechartsBarChart>
      </ResponsiveContainer>
    </div>
  );
}