"use client";

import {
  BarChart3,
  ClipboardList,
  MessageSquareText,
  TriangleAlert,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/auth/auth-provider";

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

interface NavigationRailProps {
  isAccountMenuOpen: boolean;
  onAccountMenuToggle: () => void;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "HR";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[parts.length - 1][0]}${parts[0][0]}`.toUpperCase();
}

export function NavigationRail({
  isAccountMenuOpen,
  onAccountMenuToggle,
}: NavigationRailProps) {
  const pathname = usePathname();
  const { user } = useAuth();
  const fullName = user?.fullName ?? "";

  return (
    <nav
      className="flex h-dvh flex-col border border-dashed rounded border-white/10 bg-brand-blue px-3 py-4 text-white"
      aria-label="Primary navigation"
    >
      <div className="flex min-h-2 items-center justify-center rounded-xl bg-white px-3 py-3">
        <Image
          src="/icon/intertech-icon-noBg.png"
          alt="InterTech Systems"
          width={50}
          height={50}
          className="h-20 w-auto max-w-full object-contain shadow-5xl"
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
                "flex min-h-17 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-[12px] font-semibold leading-3 text-white/80 outline-none transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/70",
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
          onClick={onAccountMenuToggle}
          aria-expanded={isAccountMenuOpen}
          aria-controls="account-menu"
          className="flex w-full items-center justify-center gap-1 rounded-xl py-2 text-white transition-colors hover:bg-white/10"
        >
          <div className="flex flex-col items-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-white text-base font-semibold text-brand-blue">
              {getInitials(fullName)}
            </span>

            <span className="mt-2 text-center">
              <span className="block text-sm font-semibold leading-tight">
                Administrator
              </span>
            </span>
          </div>

          {isAccountMenuOpen ? (
            <ChevronUp className="size-3.5 shrink-0 text-white/80" />
          ) : (
            <ChevronDown className="size-3.5 shrink-0 text-white/80" />
          )}
        </button>
      </div>
    </nav>
  );
}
