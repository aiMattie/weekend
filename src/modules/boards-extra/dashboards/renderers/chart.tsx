"use client";

import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ChartData } from "../../widgets/defs/chart";
import { Empty, nf, useLabel, type RendererProps } from "./shared";

export function ChartWidget({ data, settings }: RendererProps<ChartData, { showLegend?: boolean }>) {
  const label = useLabel();
  if (!data.rows.length) return <Empty />;
  const rows = data.rows.map((r) => ({ ...r, name: label(r.label), ...(r.stacks ?? {}) }));
  const common = { data: rows, margin: { top: 8, right: 16, bottom: 4, left: 0 } };
  const legend = settings.showLegend !== false;
  const grid = <CartesianGrid strokeDasharray="3 3" stroke="#e6e9ef" />;
  let chart;
  switch (data.chartType) {
    case "pie":
    case "donut":
      chart = (
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={data.chartType === "donut" ? "55%" : 0} outerRadius="85%" paddingAngle={data.chartType === "donut" ? 2 : 0} label={({ value }: { value?: number }) => nf.format(value ?? 0)} isAnimationActive={false}>
            {rows.map((r) => <Cell key={r.key} fill={r.color} />)}
          </Pie>
          <Tooltip formatter={(v) => nf.format(Number(v))} />
          {legend && <Legend />}
        </PieChart>
      );
      break;
    case "line":
      chart = (
        <LineChart {...common}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(v) => nf.format(Number(v))} />
          <Line type="monotone" dataKey="value" stroke="#0073ea" strokeWidth={2} dot isAnimationActive={false} />
        </LineChart>
      );
      break;
    case "stacked":
      chart = (
        <BarChart {...common}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(v) => nf.format(Number(v))} />
          {legend && <Legend formatter={(v) => label(data.stackKeys.find((s) => s.key === v)?.label ?? String(v))} />}
          {data.stackKeys.map((s) => <Bar key={s.key} dataKey={s.key} name={s.key} stackId="a" fill={s.color} isAnimationActive={false} />)}
        </BarChart>
      );
      break;
    case "column":
      chart = (
        <BarChart {...common}>
          {grid}<XAxis dataKey="name" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
          <Tooltip formatter={(v) => nf.format(Number(v))} />
          <Bar dataKey="value" isAnimationActive={false}>{rows.map((r) => <Cell key={r.key} fill={r.color} />)}</Bar>
        </BarChart>
      );
      break;
    default:
      chart = (
        <BarChart {...common} layout="vertical">
          {grid}<XAxis type="number" tick={{ fontSize: 12 }} allowDecimals={false} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 12 }} />
          <Tooltip formatter={(v) => nf.format(Number(v))} />
          <Bar dataKey="value" isAnimationActive={false}>{rows.map((r) => <Cell key={r.key} fill={r.color} />)}</Bar>
        </BarChart>
      );
  }
  return <div style={{ width: "100%", height: "100%", minHeight: 120 }} data-testid="chart-widget" data-chart-total={data.total}><ResponsiveContainer width="100%" height="100%">{chart}</ResponsiveContainer></div>;
}
