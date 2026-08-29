"use client";

import {
  AlertTriangle,
  Bot,
  CalendarDays,
  ChevronDown,
  Download,
  Grid2X2,
  MessageSquare,
  RefreshCw,
  Timer,
  Users,
} from "lucide-react";

const kpis = [
  {
    label: "Total Conversations",
    value: "1,248",
    change: "14.8%",
    comparison: "vs May 21 – Jun 19",
    icon: MessageSquare,
    tone: "blue",
  },
  {
    label: "Active Employees",
    value: "600",
    change: "8.2%",
    comparison: "vs May 21 – Jun 19",
    icon: Users,
    tone: "teal",
  },
  {
    label: "Bot Resolution Rate",
    value: "76.4%",
    change: "5.7%",
    comparison: "vs May 21 – Jun 19",
    icon: Bot,
    tone: "green",
  },
  {
    label: "Escalation Rate",
    value: "18.6%",
    change: "3.4%",
    comparison: "vs May 21 – Jun 19",
    icon: AlertTriangle,
    tone: "red",
  },
  {
    label: "Average First Response",
    value: "1m 42s",
    change: "18.3%",
    comparison: "vs May 21 – Jun 19",
    icon: Timer,
    tone: "purple",
  },
  {
    label: "HR Escalations",
    value: "114",
    change: "7.6%",
    comparison: "vs May 21 – Jun 19",
    icon: Users,
    tone: "coral",
  },
];

const services = [
  ["Leave Balance", "396", "31.8%"],
  ["Policy FAQ", "321", "25.8%"],
  ["Benefits", "218", "17.5%"],
  ["HR Document Requests", "168", "13.5%"],
  ["Talk to HR", "114", "9.2%"],
];

const journey = [
  ["Started Conversation", "1,248", "100%"],
  ["Main Menu Viewed", "1,210", "96.9%"],
  ["HR Service Selected", "1,124", "90.1%"],
  ["Information Provided", "984", "78.8%"],
  ["Completed (Bot)", "953", "76.4%"],
  ["Escalated to HR", "295", "18.6%"],
];

const paths = [
  ["Main Menu → Leave Balance", "396", "94.2%", "5.8%", "1m 38s"],
  ["Main Menu → Policy FAQ", "336", "91.6%", "8.4%", "1m 22s"],
  ["Main Menu → Benefits", "234", "88.3%", "11.7%", "1m 45s"],
  ["Main Menu → HR Document Requests", "168", "78.1%", "21.9%", "2m 12s"],
  ["Main Menu → Talk to HR", "114", "22.7%", "77.3%", "3m 05s"],
];

const toneClasses = {
  blue: "bg-blue-50 text-blue-600",
  teal: "bg-teal-50 text-teal-600",
  green: "bg-emerald-50 text-emerald-600",
  red: "bg-red-50 text-red-500",
  purple: "bg-violet-50 text-violet-600",
  coral: "bg-orange-50 text-orange-500",
};

function FilterButton({
  icon: Icon,
  children,
}: {
  icon: typeof CalendarDays;
  children: React.ReactNode;
}) {
  return (
    <button className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground shadow-sm">
      <Icon className="size-4 text-muted-foreground" />
      <span>{children}</span>
      <ChevronDown className="ml-1 size-3.5 text-muted-foreground" />
    </button>
  );
}

function KpiCard({
  label,
  value,
  change,
  comparison,
  icon: Icon,
  tone,
}: (typeof kpis)[number]) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            toneClasses[tone as keyof typeof toneClasses]
          }`}
        >
          <Icon className="size-5" />
        </div>
      </div>
      <p className="mt-4 text-xs font-medium text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground">
        {value}
      </p>
      <p className="mt-2 text-[10px] text-muted-foreground">
        <span className="font-semibold text-emerald-600">↑ {change}</span>{" "}
        {comparison}
      </p>
      <div className="mt-4 flex h-7 items-end gap-1">
        {[28, 42, 32, 52, 38, 58, 45, 62, 48, 35, 50, 42].map(
          (height, index) => (
            <div
              key={index}
              className="w-1 rounded-t-sm bg-primary/60"
              style={{ height: `${height}%` }}
            />
          ),
        )}
      </div>
    </div>
  );
}

export function AnalyticsWorkspace() {
  return (
    <div className="flex h-full min-h-dvh flex-col overflow-y-auto bg-[#f7f9fc]">
      <div className="space-y-4 p-5">
        {/* Header */}
        <header className="flex items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-foreground">
                HR Operations
              </h1>
              <span className="text-muted-foreground">›</span>
              <h2 className="text-lg font-semibold text-foreground">
                Analytics
              </h2>
            </div>

            <p className="mt-1 text-xs text-muted-foreground">
              Monitor employee conversations, HR usage, escalations, and chatbot
              performance.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <FilterButton icon={CalendarDays}>
              May 22 – Jun 20, 2025
            </FilterButton>
            <FilterButton icon={Users}>All Departments</FilterButton>
            <FilterButton icon={Grid2X2}>All Services</FilterButton>
            <button className="flex h-10 items-center gap-2 rounded-lg border border-border bg-card px-4 text-xs font-medium shadow-sm">
              <RefreshCw className="size-4" />
              Refresh
            </button>
            <button className="flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-medium text-primary-foreground shadow-sm">
              <Download className="size-4" />
              Export
            </button>
          </div>
        </header>

        <div className="flex flex-row items-center justify-end text-[10px] text-muted-foreground">
          Last updated: 2 min ago
          <span className="ml-1 size-1.5 rounded-full bg-emerald-500" />
        </div>

        {/* KPI cards */}
        <section className="grid grid-cols-6 gap-3">
          {" "}
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </section>

        {/* Conversation Activity + Services */}
        <section className="grid gap-3 xl:grid-cols-[1.65fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Conversation Activity</h3>
                <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
                  <span>● Conversations</span>
                  <span>● Completed (Bot)</span>
                  <span>● Escalated to HR</span>
                </div>
              </div>

              <div className="flex rounded-lg border border-border p-0.5 text-xs">
                <button className="rounded-md bg-primary/10 px-3 py-1.5 font-medium text-primary">
                  Daily
                </button>
                <button className="px-3 py-1.5 text-muted-foreground">
                  Weekly
                </button>
                <button className="px-3 py-1.5 text-muted-foreground">
                  Monthly
                </button>
              </div>
            </div>

            <div className="mt-5 flex h-48 items-end gap-1 border-b border-border px-2">
              {Array.from({ length: 30 }).map((_, index) => (
                <div key={index} className="flex flex-1 items-end gap-0.5">
                  <div
                    className="w-1/3 rounded-t bg-primary/80"
                    style={{
                      height: `${35 + ((index * 17) % 45)}%`,
                    }}
                  />
                  <div
                    className="w-1/3 rounded-t bg-teal-400/80"
                    style={{
                      height: `${20 + ((index * 13) % 35)}%`,
                    }}
                  />
                  <div
                    className="w-1/3 rounded-t bg-red-400/70"
                    style={{
                      height: `${8 + ((index * 7) % 18)}%`,
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="mt-2 flex justify-between text-[9px] text-muted-foreground">
              <span>May 22</span>
              <span>May 27</span>
              <span>Jun 1</span>
              <span>Jun 6</span>
              <span>Jun 11</span>
              <span>Jun 16</span>
              <span>Jun 20</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Most Used HR Services</h3>
              <button className="text-lg text-muted-foreground">⋮</button>
            </div>

            <div className="mt-5 space-y-5">
              {services.map(([service, value, percentage], index) => (
                <div key={service}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-medium">{service}</span>
                    <span className="text-muted-foreground">
                      {value} ({percentage})
                    </span>
                  </div>

                  <div className="mt-2 h-2 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${100 - index * 14}%`,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Lower analytics */}
        <section className="grid gap-3 xl:grid-cols-[1.35fr_0.85fr_1.3fr]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Conversation Journey</h3>

            <div className="mt-5 grid grid-cols-6 gap-1">
              {journey.map(([label, value, percentage], index) => (
                <div key={label} className="text-center">
                  <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {index + 1}
                  </div>

                  <p className="mt-2 text-[9px] font-medium leading-3">
                    {label}
                  </p>

                  <p className="mt-2 text-sm font-semibold">{value}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {percentage}
                  </p>

                  {index < journey.length - 1 ? (
                    <p className="mt-2 text-[9px] text-red-500">Drop-off</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-6 grid grid-cols-2 border-t pt-4">
              <div>
                <p className="text-[10px] text-muted-foreground">
                  Conversion to Bot Completion
                </p>
                <p className="mt-1 text-xl font-semibold text-emerald-600">
                  76.4%
                </p>
              </div>

              <div className="text-right">
                <p className="text-[10px] text-muted-foreground">
                  Conversion to Escalation
                </p>
                <p className="mt-1 text-xl font-semibold text-red-500">18.6%</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Escalation Analytics</h3>
              <button className="text-lg text-muted-foreground">⋮</button>
            </div>

            <div className="mt-6 flex justify-center">
              <div className="flex size-36 items-center justify-center rounded-full border-18 border-primary">
                <div className="text-center">
                  <p className="text-lg font-semibold">2,328</p>
                  <p className="text-[9px] text-muted-foreground">Total</p>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 text-[10px]">
              <div className="flex justify-between">
                <span>Talk to HR</span>
                <span>752 (32.3%)</span>
              </div>
              <div className="flex justify-between">
                <span>Unrecognized Input</span>
                <span>684 (29.4%)</span>
              </div>
              <div className="flex justify-between">
                <span>Workflow Requires HR</span>
                <span>612 (26.3%)</span>
              </div>
              <div className="flex justify-between">
                <span>Other / System Issue</span>
                <span>280 (12.0%)</span>
              </div>
            </div>

            <div className="mt-5 border-t pt-4">
              <p className="text-[10px] text-muted-foreground">
                Avg. Escalations / Day
              </p>
              <p className="mt-1 text-xl font-semibold">77</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Top Conversation Paths</h3>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-120 text-left text-[9px]">
                <thead className="border-b text-muted-foreground">
                  <tr>
                    <th className="pb-2 font-medium">Conversation Path</th>
                    <th className="pb-2 text-right font-medium">
                      Conversations
                    </th>
                    <th className="pb-2 text-right font-medium">Completion</th>
                    <th className="pb-2 text-right font-medium">Escalation</th>
                    <th className="pb-2 text-right font-medium">
                      Avg. Duration
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {paths.map((path) => (
                    <tr key={path[0]} className="border-b last:border-0">
                      <td className="py-3 pr-2 font-medium">{path[0]}</td>
                      <td className="py-3 text-right">{path[1]}</td>
                      <td className="py-3 text-right text-emerald-600">
                        {path[2]}
                      </td>
                      <td className="py-3 text-right text-red-500">
                        {path[3]}
                      </td>
                      <td className="py-3 text-right text-muted-foreground">
                        {path[4]}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-3 flex items-center justify-between text-[9px] text-muted-foreground">
              <span>Showing 1 to 5 of 5 entries</span>
              <div className="flex gap-1">
                <button className="rounded border px-2 py-1">‹</button>
                <button className="rounded border border-primary px-2 py-1 text-primary">
                  1
                </button>
                <button className="rounded border px-2 py-1">›</button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
