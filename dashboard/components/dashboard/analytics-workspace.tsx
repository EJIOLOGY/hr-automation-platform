"use client";

import { useMemo, useState } from "react";
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
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipContentProps } from "recharts";
import type {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

const toneColors = {
  blue: "#0057b8",
  teal: "#19b5ae",
  green: "#059669",
  red: "var(--color-danger)",
  purple: "#7c3aed",
  coral: "#f97316",
};

const kpis = [
  {
    label: "Total Conversations",
    value: "1,248",
    change: "14.8%",
    comparison: "vs May 21 – Jun 19",
    icon: MessageSquare,
    tone: "blue",
    trend: [72, 78, 74, 82, 88, 84, 92, 96, 90, 100, 104, 110],
  },
  {
    label: "Active Employees",
    value: "600",
    change: "8.2%",
    comparison: "vs May 21 – Jun 19",
    icon: Users,
    tone: "teal",
    trend: [58, 60, 59, 63, 66, 64, 70, 74, 72, 78, 82, 86],
  },
  {
    label: "Bot Resolution Rate",
    value: "76.4%",
    change: "5.7%",
    comparison: "vs May 21 – Jun 19",
    icon: Bot,
    tone: "green",
    trend: [60, 62, 64, 63, 66, 68, 70, 69, 72, 74, 73, 76],
  },
  {
    label: "Escalation Rate",
    value: "18.6%",
    change: "3.4%",
    comparison: "vs May 21 – Jun 19",
    icon: AlertTriangle,
    tone: "red",
    trend: [15, 14, 16, 15, 17, 16, 18, 17, 19, 18, 20, 19],
  },
  {
    label: "Average First Response",
    value: "1m 42s",
    change: "18.3%",
    comparison: "vs May 21 – Jun 19",
    icon: Timer,
    tone: "purple",
    trend: [50, 55, 52, 58, 60, 57, 63, 65, 62, 68, 70, 74],
  },
  {
    label: "HR Escalations",
    value: "114",
    change: "7.6%",
    comparison: "vs May 21 – Jun 19",
    icon: Users,
    tone: "coral",
    trend: [70, 74, 72, 78, 80, 77, 83, 85, 82, 88, 90, 94],
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

const escalationBreakdown = [
  { name: "Talk to HR", value: 752, percentage: "32.3%", color: "#0057b8" },
  {
    name: "Unrecognized Input",
    value: 684,
    percentage: "29.4%",
    color: "#19b5ae",
  },
  {
    name: "Workflow Requires HR",
    value: 612,
    percentage: "26.3%",
    color: "#7c3aed",
  },
  {
    name: "Other / System Issue",
    value: 280,
    percentage: "12.0%",
    color: "var(--color-danger)",
  },
];

function EscalationTooltip({
  active,
  payload,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const item = escalationBreakdown.find((e) => e.name === entry.name);

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <div className="flex items-center gap-2 text-xs">
        <span
          className="size-1.5 rounded-full"
          style={{ background: item?.color }}
        />
        <span className="font-semibold text-foreground">{entry.name}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {entry.value} conversations ({item?.percentage})
      </p>
    </div>
  );
}

const funnelData = journey.map(([label, value, percentage], index) => ({
  label,
  value: Number(value.replace(/,/g, "")),
  percentage,
  isEscalation: index === journey.length - 1,
}));

const paths = [
  ["Main Menu → Leave Balance", "396", "94.2%", "5.8%", "1m 38s"],
  ["Main Menu → Policy FAQ", "336", "91.6%", "8.4%", "1m 22s"],
  ["Main Menu → Benefits", "234", "88.3%", "11.7%", "1m 45s"],
  ["Main Menu → HR Document Requests", "168", "78.1%", "21.9%", "2m 12s"],
  ["Main Menu → Talk to HR", "114", "22.7%", "77.3%", "3m 05s"],
];

type ActivityPoint = {
  label: string;
  conversations: number;
  completed: number;
  escalated: number;
};

const activityDaily: ActivityPoint[] = [
  { label: "May 22", conversations: 34, completed: 24, escalated: 6 },
  { label: "May 23", conversations: 38, completed: 27, escalated: 7 },
  { label: "May 24", conversations: 31, completed: 22, escalated: 6 },
  { label: "May 25", conversations: 29, completed: 21, escalated: 5 },
  { label: "May 26", conversations: 42, completed: 30, escalated: 8 },
  { label: "May 27", conversations: 47, completed: 34, escalated: 9 },
  { label: "May 28", conversations: 45, completed: 33, escalated: 8 },
  { label: "May 29", conversations: 51, completed: 38, escalated: 9 },
  { label: "May 30", conversations: 49, completed: 36, escalated: 10 },
  { label: "May 31", conversations: 54, completed: 40, escalated: 10 },
  { label: "Jun 1", conversations: 58, completed: 43, escalated: 11 },
  { label: "Jun 2", conversations: 56, completed: 41, escalated: 12 },
  { label: "Jun 3", conversations: 61, completed: 46, escalated: 12 },
  { label: "Jun 4", conversations: 64, completed: 48, escalated: 13 },
  { label: "Jun 5", conversations: 60, completed: 45, escalated: 12 },
  { label: "Jun 6", conversations: 67, completed: 51, escalated: 14 },
  { label: "Jun 7", conversations: 71, completed: 54, escalated: 15 },
  { label: "Jun 8", conversations: 69, completed: 52, escalated: 14 },
  { label: "Jun 9", conversations: 74, completed: 56, escalated: 16 },
  { label: "Jun 10", conversations: 78, completed: 60, escalated: 16 },
  { label: "Jun 11", conversations: 76, completed: 58, escalated: 17 },
  { label: "Jun 12", conversations: 81, completed: 62, escalated: 18 },
  { label: "Jun 13", conversations: 85, completed: 65, escalated: 19 },
  { label: "Jun 14", conversations: 83, completed: 63, escalated: 18 },
  { label: "Jun 15", conversations: 88, completed: 68, escalated: 20 },
  { label: "Jun 16", conversations: 92, completed: 71, escalated: 21 },
  { label: "Jun 17", conversations: 90, completed: 69, escalated: 20 },
  { label: "Jun 18", conversations: 95, completed: 73, escalated: 22 },
  { label: "Jun 19", conversations: 98, completed: 76, escalated: 23 },
  { label: "Jun 20", conversations: 94, completed: 72, escalated: 22 },
];

const activityWeekly: ActivityPoint[] = [
  { label: "Wk of May 22", conversations: 210, completed: 158, escalated: 41 },
  { label: "Wk of May 29", conversations: 268, completed: 202, escalated: 53 },
  { label: "Wk of Jun 5", conversations: 314, completed: 240, escalated: 66 },
  { label: "Wk of Jun 12", conversations: 356, completed: 274, escalated: 80 },
  { label: "Wk of Jun 19", conversations: 100, completed: 79, escalated: 23 },
];

const activityMonthly: ActivityPoint[] = [
  { label: "Jan", conversations: 812, completed: 598, escalated: 168 },
  { label: "Feb", conversations: 874, completed: 641, escalated: 179 },
  { label: "Mar", conversations: 940, completed: 702, escalated: 186 },
  { label: "Apr", conversations: 1026, completed: 774, escalated: 201 },
  { label: "May", conversations: 1108, completed: 838, escalated: 214 },
  { label: "Jun", conversations: 1248, completed: 953, escalated: 232 },
];

const activityPeriods = [
  { key: "daily" as const, label: "Daily", data: activityDaily },
  { key: "weekly" as const, label: "Weekly", data: activityWeekly },
  { key: "monthly" as const, label: "Monthly", data: activityMonthly },
];

const activitySeries = [
  {
    key: "conversations" as const,
    name: "Conversations",
    color: "var(--chart-1)",
  },
  {
    key: "completed" as const,
    name: "Completed (Bot)",
    color: "var(--chart-3)",
  },
  {
    key: "escalated" as const,
    name: "Escalated to HR",
    color: "var(--color-danger)",
  },
];

function ActivityTooltip({
  active,
  payload,
  label,
}: TooltipContentProps<ValueType, NameType>) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 shadow-lg">
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="mt-1.5 space-y-1">
        {payload.map((entry) => {
          const series = activitySeries.find((s) => s.name === entry.name);
          return (
            <div key={entry.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-1.5 rounded-full"
                style={{ background: series?.color }}
              />
              <span className="text-muted-foreground">{entry.name}</span>
              <span className="ml-auto font-semibold text-foreground">
                {entry.value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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
  trend,
}: (typeof kpis)[number]) {
  const sparkId = `kpi-spark-${label.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
  const color = toneColors[tone as keyof typeof toneColors];
  const data = trend.map((v, i) => ({ i, v }));

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
      <p className="mt-2 text-xs text-muted-foreground">
        <span className="font-semibold text-emerald-600">↑ {change}</span>{" "}
        {comparison}
      </p>
      <div className="mt-3 h-8 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id={sparkId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="v"
              stroke={color}
              strokeWidth={1.75}
              fill={`url(#${sparkId})`}
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function AnalyticsWorkspace() {
  const [activityPeriod, setActivityPeriod] =
    useState<(typeof activityPeriods)[number]["key"]>("daily");

  const activeActivity = useMemo(
    () =>
      activityPeriods.find((period) => period.key === activityPeriod) ??
      activityPeriods[0],
    [activityPeriod],
  );

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

        <div className="flex flex-row items-center justify-end text-xs text-muted-foreground">
          Last updated: 2 min ago
          <span className="ml-1 size-1.5 rounded-full bg-emerald-500" />
        </div>

        {/* KPI cards */}
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.label} {...kpi} />
          ))}
        </section>

        {/* Conversation Activity + Services */}
        <section className="grid gap-3 lg:grid-cols-[1.65fr_1fr]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Conversation Activity</h3>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  {activitySeries.map((series) => (
                    <span
                      key={series.key}
                      className="flex items-center gap-1.5"
                    >
                      <span
                        className="size-1.5 rounded-full"
                        style={{ background: series.color }}
                      />
                      {series.name}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex rounded-lg border border-border p-0.5 text-xs">
                {activityPeriods.map((period) => (
                  <button
                    key={period.key}
                    onClick={() => setActivityPeriod(period.key)}
                    className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                      activityPeriod === period.key
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {period.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 h-52  w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={activeActivity.data}
                  margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
                >
                  <defs>
                    {activitySeries.map((series) => (
                      <linearGradient
                        key={series.key}
                        id={`fill-${series.key}`}
                        x1="0"
                        y1="0"
                        x2="0"
                        y2="1"
                      >
                        <stop
                          offset="5%"
                          stopColor={series.color}
                          stopOpacity={0.28}
                        />
                        <stop
                          offset="95%"
                          stopColor={series.color}
                          stopOpacity={0}
                        />
                      </linearGradient>
                    ))}
                  </defs>

                  <CartesianGrid
                    vertical={false}
                    stroke="var(--color-border)"
                    strokeDasharray="3 3"
                  />

                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    interval="preserveStartEnd"
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-muted-foreground)",
                    }}
                    tickMargin={10}
                  />

                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={32}
                    tick={{
                      fontSize: 11,
                      fill: "var(--color-muted-foreground)",
                    }}
                  />

                  <Tooltip
                    content={(props) => <ActivityTooltip {...props} />}
                    cursor={{
                      stroke: "var(--color-border)",
                      strokeWidth: 1,
                    }}
                  />

                  {activitySeries.map((series) => (
                    <Area
                      key={series.key}
                      type="monotone"
                      dataKey={series.key}
                      name={series.name}
                      stroke={series.color}
                      strokeWidth={2}
                      fill={`url(#fill-${series.key})`}
                      dot={false}
                      activeDot={{ r: 3.5, strokeWidth: 0 }}
                    />
                  ))}
                </AreaChart>
              </ResponsiveContainer>
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
        <section className="grid gap-3 lg:grid-cols-[1.35fr_0.85fr] xl:grid-cols-[1.35fr_0.85fr_1.3fr]">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Conversation Journey</h3>

            <div className="mt-4 grid grid-cols-6 gap-2">
              {journey.map(([label, value, percentage], index) => (
                <div key={label} className="text-center">
                  <div className="mx-auto flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                    {index + 1}
                  </div>

                  <p className="mt-2 text-xs font-medium leading-snug">
                    {label}
                  </p>

                  <p className="mt-2 text-sm font-semibold">{value}</p>
                  <p className="text-xs text-muted-foreground">{percentage}</p>

                  {index < journey.length - 1 ? (
                    <p className="mt-2 text-xs text-red-500">Drop-off</p>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 border-t pt-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Conversion to Bot Completion
                </p>
                <p className="mt-1 text-xl font-semibold text-emerald-600">
                  76.4%
                </p>
              </div>

              <div className="text-right">
                <p className="text-xs text-muted-foreground">
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

            <div className="relative mt-3 h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    content={(props) => <EscalationTooltip {...props} />}
                  />
                  <Pie
                    data={escalationBreakdown}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={52}
                    outerRadius={72}
                    paddingAngle={2}
                    cornerRadius={4}
                    stroke="none"
                  >
                    {escalationBreakdown.map((entry) => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-lg font-semibold">2,328</p>
                  <p className="text-xs text-muted-foreground">Total</p>
                </div>
              </div>
            </div>

            <div className="mt-3 space-y-2 text-sm">
              {escalationBreakdown.map((entry) => (
                <div
                  key={entry.name}
                  className="flex items-center justify-between"
                >
                  <span className="flex items-center gap-1.5">
                    <span
                      className="size-1.5 rounded-full"
                      style={{ background: entry.color }}
                    />
                    {entry.name}
                  </span>
                  <span className="text-muted-foreground">
                    {entry.value} ({entry.percentage})
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-3 border-t pt-3">
              <p className="text-xs text-muted-foreground">
                Avg. Escalations / Day
              </p>
              <p className="mt-1 text-xl font-semibold">77</p>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
            <h3 className="text-sm font-semibold">Top Conversation Paths</h3>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-120 text-left text-sm">
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

            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
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
