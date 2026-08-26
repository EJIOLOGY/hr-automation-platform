"use client";

import { BarChart3, ClipboardList, MessageSquareText, TriangleAlert, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavigationItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const navigationItems: NavigationItem[] = [
  { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
  { label: "Conversations", href: "/dashboard/conversations", icon: MessageSquareText },
  { label: "Escalations", href: "/dashboard/escalations", icon: TriangleAlert },
  { label: "HR Requests", href: "/dashboard/hr-requests", icon: ClipboardList },
];

export function NavigationRail() {
  const pathname = usePathname();

  return (
    <nav className="flex min-h-dvh flex-col border-r bg-sidebar px-2 py-3" aria-label="Primary navigation">
      <div className="flex size-10 items-center justify-center self-center rounded-xl bg-primary text-sm font-bold text-primary-foreground" aria-label="HR Operations">
        HR
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
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[10px] font-medium leading-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isActive && "bg-accent text-accent-foreground shadow-sm",
              )}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t pt-3">
        <div className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[10px] leading-3 text-muted-foreground" aria-label="HR Officer account">
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          <span className="font-medium text-foreground">HR Officer</span>
        </div>
      </div>
    </nav>
  );
}
