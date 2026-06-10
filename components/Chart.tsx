"use client";
import { ParentSize } from "@visx/responsive";
import { Group } from "@visx/group";
import { LinePath } from "@visx/shape";
import { scaleTime, scaleLinear } from "@visx/scale";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { curveMonotoneX } from "@visx/curve";
import { Tooltip, useTooltip, defaultStyles } from "@visx/tooltip";
import { bisector, extent, max, min } from "d3-array";
import { GlassCard } from "./GlassCard";
import { fmtEur } from "@/lib/format";
import type { ValuePoint, BenchmarkSeries } from "@/lib/types";

type Mode = "value" | "pl";

export function Chart({ series, benchmarks, mode, onModeChange }: {
  series: ValuePoint[];
  benchmarks: BenchmarkSeries[];
  mode: Mode;
  onModeChange: (m: Mode) => void;
}) {
  return (
    <GlassCard className="p-4">
      <div className="flex items-center justify-between mb-3 px-2">
        <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)]">Portfolio</div>
        <div className="flex gap-1 p-1 glass" style={{ borderRadius: "999px" }}>
          {(["value","pl"] as Mode[]).map((m) => (
            <button key={m} onClick={() => onModeChange(m)}
              className={`px-3 py-1 text-xs uppercase rounded-full ${mode === m ? "bg-white/10" : "text-[var(--color-text-secondary)]"}`}>
              {m === "value" ? "Value" : "P/L"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 320 }}>
        <ParentSize>{({ width, height }) => (
          <ChartInner width={width} height={height} series={series} benchmarks={benchmarks} mode={mode} />
        )}</ParentSize>
      </div>
    </GlassCard>
  );
}

function ChartInner({ width, height, series, benchmarks, mode }: {
  width: number; height: number; series: ValuePoint[]; benchmarks: BenchmarkSeries[]; mode: Mode;
}) {
  const margin = { top: 12, right: 12, bottom: 28, left: 56 };
  const innerW = Math.max(0, width - margin.left - margin.right);
  const innerH = Math.max(0, height - margin.top - margin.bottom);

  const accessorX = (d: ValuePoint) => new Date(d.t * 1000);
  const accessorY = (d: ValuePoint) => (mode === "value" ? d.valueEur : d.plEur);

  const startValue = series[0] ? (mode === "value" ? series[0].valueEur : 0) : 0;
  const startCost  = series[0] ? series[0].costBasisEur : 0;

  const rebased = benchmarks.map((b) => {
    if (b.points.length === 0) return { ...b, scaled: [] as { t: number; v: number }[] };
    const base = b.points[0].close;
    const scaled = b.points.map((p) => ({
      t: p.t,
      v: mode === "value"
        ? (p.close / base) * (startValue || 1)
        : ((p.close / base) - 1) * (startCost || 1),
    }));
    return { ...b, scaled };
  });

  const allY = [
    ...series.map(accessorY),
    ...rebased.flatMap((b) => b.scaled.map((p) => p.v)),
  ];

  const xExtent = extent(series, accessorX);
  const xScale = scaleTime({
    range: [0, innerW],
    domain: (xExtent[0] && xExtent[1] ? xExtent : [new Date(), new Date()]) as [Date, Date],
  });
  const yScale = scaleLinear({
    range: [innerH, 0],
    domain: [Math.min(0, min(allY) ?? 0), max(allY) ?? 1],
    nice: true,
  });

  const { tooltipData, tooltipLeft, tooltipTop, showTooltip, hideTooltip } = useTooltip<ValuePoint>();
  const bisectDate = bisector<ValuePoint, Date>((d) => new Date(d.t * 1000)).left;

  return (
    <>
      <svg width={width} height={height}>
        <Group left={margin.left} top={margin.top}>
          {rebased.map((b, i) => (
            <LinePath
              key={b.id}
              data={b.scaled}
              x={(d) => xScale(new Date(d.t * 1000))!}
              y={(d) => yScale(d.v)!}
              stroke={`oklch(0.7 0.05 ${200 + i * 40})`}
              strokeWidth={1.25}
              strokeDasharray="4 4"
              curve={curveMonotoneX}
            />
          ))}
          <LinePath
            data={series}
            x={(d) => xScale(accessorX(d))!}
            y={(d) => yScale(accessorY(d))!}
            stroke={mode === "value" ? "oklch(0.85 0.13 200)" : "oklch(0.85 0.18 145)"}
            strokeWidth={2}
            curve={curveMonotoneX}
          />
          <AxisBottom top={innerH} scale={xScale} numTicks={width > 600 ? 8 : 4}
            stroke="oklch(1 0 0 / 0.15)" tickStroke="oklch(1 0 0 / 0.15)"
            tickLabelProps={() => ({ fill: "oklch(0.72 0.015 240)", fontSize: 10, textAnchor: "middle" })}
          />
          <AxisLeft scale={yScale} numTicks={5}
            stroke="oklch(1 0 0 / 0.15)" tickStroke="oklch(1 0 0 / 0.15)"
            tickFormat={(v) => fmtEur(Number(v))}
            tickLabelProps={() => ({ fill: "oklch(0.72 0.015 240)", fontSize: 10, textAnchor: "end", dx: -4, dy: 3 })}
          />
          <rect width={innerW} height={innerH} fill="transparent"
            onMouseMove={(e) => {
              const { left } = (e.currentTarget as SVGRectElement).getBoundingClientRect();
              const x = e.clientX - left;
              const date = xScale.invert(x);
              const idx = bisectDate(series, date, 1);
              const d = series[Math.min(idx, series.length - 1)];
              if (!d) return;
              showTooltip({ tooltipData: d, tooltipLeft: xScale(accessorX(d))!, tooltipTop: yScale(accessorY(d))! });
            }}
            onMouseLeave={hideTooltip}
          />
        </Group>
      </svg>
      {tooltipData ? (
        <Tooltip top={(tooltipTop ?? 0) + margin.top} left={(tooltipLeft ?? 0) + margin.left}
          style={{ ...defaultStyles, background: "oklch(0.2 0.02 240 / 0.9)", color: "white", border: "1px solid oklch(1 0 0 / 0.15)" }}>
          <div className="text-xs">{new Date(tooltipData.t * 1000).toLocaleDateString()}</div>
          <div className="mono tabular text-sm">{fmtEur(mode === "value" ? tooltipData.valueEur : tooltipData.plEur)}</div>
        </Tooltip>
      ) : null}
    </>
  );
}
