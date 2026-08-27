"use client";

import {
  BarChart3,
  ClipboardList,
  MessageSquareText,
  TriangleAlert,
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
      className="flex min-h-dvh flex-col border-r bg-nav px-3 py-4"
      aria-label="Primary navigation"
    >
      <div className="flex h-12 items-center justify-center">
        <Image
          src="/Intertech Logo.png"
          alt="InterTech Systems"
          width={128}
          height={48}
          className="h-auto w-full max-w-32 object-contain"
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
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center text-[10px] font-medium leading-3 text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
                isActive &&
                  "bg-brand-blue text-primary-foreground shadow-sm hover:text-primary-foreground",
              )}
            >
              <Icon className="size-4.5" aria-hidden="true" />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      <div className="mt-auto border-t pt-3">
        <div
          className="flex flex-col items-center gap-1 rounded-lg px-1 py-2 text-center text-[10px] leading-3 text-muted-foreground"
          aria-label="HR Officer account"
        >
          <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
            <UserRound className="size-4" aria-hidden="true" />
          </span>
          <span className="font-medium text-foreground">HR Officer</span>
        </div>
      </div>
    </nav>
  );
}
