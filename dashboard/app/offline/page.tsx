export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background p-6 text-center">
      <section className="max-w-sm rounded-2xl border bg-card p-8 shadow-sm">
        <p className="text-sm font-semibold text-primary">HR Operations</p>
        <h1 className="mt-2 text-xl font-semibold">You&apos;re offline</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          Reconnect to access live HR information. No employee data is stored for offline use.
        </p>
      </section>
    </main>
  );
}
