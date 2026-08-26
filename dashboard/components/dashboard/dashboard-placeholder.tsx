interface DashboardPlaceholderProps {
  title: string;
}

export function DashboardPlaceholder({ title }: DashboardPlaceholderProps) {
  return (
    <div className="flex h-full min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <p className="text-sm font-semibold text-primary">HR Operations</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This workspace is ready for its operational interface.
        </p>
      </div>
    </div>
  );
}
