"use client";
import { useState } from "react";
import { Pie } from "@visx/shape";
import { Group } from "@visx/group";
import { GlassCard } from "./GlassCard";
import { fmtEur, fmtPct } from "@/lib/format";

type Slice = { label: string; value: number };

export function AllocationDonut({ data, size = 240 }: { data: Slice[]; size?: number }) {
  const [hover, setHover] = useState<Slice | null>(null);
  const total = data.reduce((a, b) => a + b.value, 0);
  const radius = size / 2;
  const thickness = 28;

  return (
    <GlassCard className="flex flex-col items-center">
      <div className="text-xs uppercase tracking-wider text-[var(--color-text-muted)] self-start mb-2">Allocation</div>
      <svg width={size} height={size}>
        <Group top={radius} left={radius}>
          <Pie<Slice>
            data={data}
            pieValue={(d) => d.value}
            outerRadius={radius}
            innerRadius={radius - thickness}
            padAngle={0.005}
          >
            {(pie) => pie.arcs.map((arc, i) => {
              const path = pie.path(arc) ?? "";
              const hue = 200 + (i * 47) % 180;
              return (
                <path key={i} d={path} fill={`oklch(0.72 0.13 ${hue})`} opacity={hover && hover.label !== arc.data.label ? 0.4 : 1}
                  onMouseEnter={() => setHover(arc.data)} onMouseLeave={() => setHover(null)} />
              );
            })}
          </Pie>
          <text textAnchor="middle" dy="-0.3em" fontSize={11} fill="oklch(0.72 0.015 240)">total</text>
          <text textAnchor="middle" dy="1em" fontSize={16} className="mono tabular" fill="white">{fmtEur(total)}</text>
        </Group>
      </svg>
      <div className="mt-3 w-full">
        {data.map((d) => (
          <div key={d.label} className="flex items-center justify-between text-sm py-0.5">
            <span className="truncate text-[var(--color-text-secondary)]">{d.label}</span>
            <span className="mono tabular ml-2">{fmtPct(d.value / total)}</span>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}
