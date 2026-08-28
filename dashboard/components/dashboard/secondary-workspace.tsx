"use client";

import { Search } from "lucide-react";

interface SecondaryWorkspaceProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

export function SecondaryWorkspace({
  title,
  description,
  children,
}: SecondaryWorkspaceProps) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <header className="shrink-0 border-b px-1 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-foreground">
              {title}
            </h2>

            {description ? (
              <p className="mt-0.5 truncate text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="relative mt-4">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />

          <input
            type="search"
            placeholder="Search"
            aria-label={`Search ${title}`}
            className="h-9 w-full rounded-2xl border border-border bg-background pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-info focus:ring-2 focus:ring-info/20"
          />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
