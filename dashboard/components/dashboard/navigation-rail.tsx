"use client";

import {
  BarChart3,
  ClipboardList,
  MessageSquareText,
  TriangleAlert,
  ChevronDown,
  UserRound,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navigationItems: NavigationItem[] = [
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  {
    label: "Conversations",
    href: "/dashboard/conversations",
    icon: MessageSquareText,
  },
  { label: "Escalations", href: "/dashboard/escalations", icon: TriangleAlert },
  { label: "HR Requests", href: "/dashboard/hr-requests", icon: ClipboardList },
];

export function NavigationRail() {
  const pathname = usePathname();

  return (
    <nav
      className="flex min-h-dvh flex-col border border-dashed border-white/10 bg-brand-blue px-3 py-4 text-white"
      aria-label="Primary navigation"
    >
      <div className="flex min-h-2 items-center justify-center rounded-xl bg-white px-3 py-3">
        <Image
          src="/icon/intertech-icon.png"
          alt="InterTech Systems"
          width={50}
          height={50}
          className="h-auto w-full max-w-full object-contain shadow-5xl"
          priority
        />
      </div>
      <div className="mt-6 flex flex-col gap-1">
        {navigationItems.map(({ label, href, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(`${href}/`);

          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[10px] font-medium leading-3 text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70",
                isActive &&
                  "bg-white/20 text-white shadow-sm ring-1 ring-white/10 hover:bg-white/20 hover:text-white",
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t border-white/15 pt-4">
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-xl py-2 text-left text-white transition-colors hover:bg-white/10"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-brand-blue">
            TG
          </span>

          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              HR Officer
            </span>

            <span className="block truncate text-xs text-white/75">
              Administrator
            </span>

            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-white/80">
              <span className="size-2 shrink-0 rounded-full bg-success" />
              Online
            </span>
          </span>

          <ChevronDown className="size-3.5 shrink-0 text-white/80" />
        </button>
      </div>
    </nav>
  );
}
