import { cn } from "@/lib/utils";

const escalationSegments = [
  {
    label: "Talk to HR",
    count: "752",
    percentage: "32.3%",
    value: 32.3,
    color: "var(--chart-1)",
  },
  {
    label: "Unrecognized Input",
    count: "684",
    percentage: "29.4%",
    value: 29.4,
    color: "var(--chart-2)",
  },
  {
    label: "Workflow Requires HR",
    count: "612",
    percentage: "26.3%",
    value: 26.3,
    color: "var(--chart-3)",
  },
  {
    label: "Other / System Issue",
    count: "280",
    percentage: "12.0%",
    value: 12,
    color: "var(--chart-4)",
  },
] as const;

const segmentsWithOffsets = escalationSegments.map((segment, index) => ({
  ...segment,
  dashOffset: -escalationSegments
    .slice(0, index)
    .reduce((total, previousSegment) => total + previousSegment.value, 0),
}));

interface EscalationDonutProps {
  className?: string;
}

export function EscalationDonut({ className }: EscalationDonutProps) {
  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm",
        className,
      )}
      aria-labelledby="escalation-analytics-title"
    >
      <h3 id="escalation-analytics-title" className="text-sm font-semibold">
        Escalation Analytics
      </h3>

      <div className="mt-5 flex min-w-0 flex-col items-center gap-5">
        <div
          className="relative size-36 shrink-0"
          role="img"
          aria-label="2,328 total escalations"
        >
          <svg
            viewBox="0 0 100 100"
            className="size-full -rotate-90"
            aria-hidden="true"
          >
            <circle
              cx="50"
              cy="50"
              r="40"
              fill="none"
              stroke="var(--muted)"
              strokeWidth="13"
            />

            {segmentsWithOffsets.map((segment) => (
              <circle
                key={segment.label}
                cx="50"
                cy="50"
                r="40"
                fill="none"
                pathLength="100"
                stroke={segment.color}
                strokeDasharray={`${segment.value} ${100 - segment.value}`}
                strokeDashoffset={segment.dashOffset}
                strokeLinecap="butt"
                strokeWidth="13"
              />
            ))}
          </svg>

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-semibold leading-tight text-foreground">
              2,328
            </span>
            <span className="text-[9px] text-muted-foreground">Total</span>
          </div>
        </div>

        <ul
          className="w-full min-w-0 space-y-2.5 text-[10px]"
          aria-label="Escalation breakdown"
        >
          {escalationSegments.map((segment) => (
            <li key={segment.label} className="flex min-w-0 items-start gap-2">
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: segment.color }}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 leading-4 text-muted-foreground">
                {segment.label}
              </span>
              <span className="shrink-0 whitespace-nowrap leading-4 font-medium text-foreground">
                {segment.count} ({segment.percentage})
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
