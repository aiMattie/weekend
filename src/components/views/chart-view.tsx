"use client";

import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useIsClient } from "@/lib/use-persistent-state";
import { useT } from "@/lib/i18n/client";
import { buildChart, GROUP_AXIS, type ChartType, type Metric } from "@/modules/views/lib/chart";
import { itemColumns, oneOf, pickColumn, firstColumn } from "@/modules/views/lib/settings";
import { useViewSettings } from "@/modules/views/ui/use-view-settings";
import { useVisibleItems } from "@/modules/views/ui/use-visible-items";
import { ViewFrame } from "@/modules/views/ui/view-frame";
import styles from "@/modules/views/ui/chart.module.css";
import type { ViewProps } from "./types";

export function ChartView(props: ViewProps) {
  const { board, view, viewState, actions, canEditStructure } = props;
  const t = useT();
  const client = useIsClient();
  const { settings, patch } = useViewSettings(view, actions, canEditStructure);
  const items = useVisibleItems(board, viewState);
  const type = oneOf<ChartType>(settings.chartType, ["bar", "stacked", "line", "pie"], "bar");
  const metric = oneOf<Metric>(settings.metric, ["count", "sum", "avg"], "count");
  const cols = itemColumns(board.columns);
  const xStored = settings.xColumnId;
  const xId = xStored === GROUP_AXIS ? GROUP_AXIS : pickColumn(board.columns, xStored)?.id ?? firstColumn(board.columns, ["status", "dropdown", "people"])?.id ?? GROUP_AXIS;
  const stack = type === "pie" ? null : pickColumn(board.columns, settings.stackColumnId)?.id ?? null;
  const yCol = pickColumn(board.columns, settings.yColumnId, ["numbers"]) ?? (metric !== "count" ? firstColumn(board.columns, ["numbers"]) : undefined);
  const effMetric: Metric = metric !== "count" && !yCol ? "count" : metric;
  const data = useMemo(() => buildChart(items, board.columns, board.groups, board.users, { xColumnId: xId, stackColumnId: stack, metric: effMetric, yColumnId: yCol?.id }, t("vw.chart.empty")), [items, board.columns, board.groups, board.users, xId, stack, effMetric, yCol, t]);
  const xTitle = xId === GROUP_AXIS ? "Group" : cols.find((c) => c.id === xId)?.title ?? "";
  const stacked = type === "stacked" || (stack !== null && type === "bar");
  const total = data.rows.reduce((s, r) => s + Number(r.total), 0);

  return (
    <ViewFrame props={props} settings={settings} patch={patch} testId="chart-view"
      controls={<div className={styles.title}>{t(`vw.metric.${effMetric}`)} · {xTitle}</div>}>
      <div className={styles.wrap} data-testid="chart" data-chart-type={type} data-buckets={data.rows.length} data-total={total}>
        {!data.rows.length ? <div className={styles.empty}>{t("vw.chart.noData")}</div> : (
          <>
            <div className={styles.canvas}>
              {client ? (
                <ResponsiveContainer width="100%" height={420}>
                  {type === "pie" ? (
                    <PieChart>
                      <Pie data={data.rows} dataKey="total" nameKey="label" outerRadius={150} label isAnimationActive={false}>
                        {data.rows.map((r) => <Cell key={String(r.key)} fill={String(r.color)} />)}
                      </Pie>
                      <Tooltip /><Legend />
                    </PieChart>
                  ) : type === "line" ? (
                    <LineChart data={data.rows}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
                      {data.series.map((s) => <Line key={s.key} type="monotone" dataKey={s.key} name={s.label || t(`vw.metric.${effMetric}`)} stroke={s.color} strokeWidth={2} isAnimationActive={false} />)}
                    </LineChart>
                  ) : (
                    <BarChart data={data.rows}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" /><YAxis allowDecimals={false} /><Tooltip />{stacked || data.series.length > 1 ? <Legend /> : null}
                      {data.series.map((s) => (
                        <Bar key={s.key} dataKey={s.key} name={s.label || t(`vw.metric.${effMetric}`)} fill={s.color} stackId={stacked ? "a" : undefined} isAnimationActive={false}>
                          {!stacked && data.series.length === 1 ? data.rows.map((r) => <Cell key={String(r.key)} fill={String(r.color)} />) : null}
                        </Bar>
                      ))}
                    </BarChart>
                  )}
                </ResponsiveContainer>
              ) : null}
            </div>
            <table className={styles.legend} data-testid="chart-legend">
              <tbody>
                {data.rows.map((r) => (
                  <tr key={String(r.key)} data-testid="chart-row" data-label={String(r.label)} data-value={String(r.total)}>
                    <td><i style={{ background: String(r.color) }} />{String(r.label)}</td><td>{String(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </ViewFrame>
  );
}
