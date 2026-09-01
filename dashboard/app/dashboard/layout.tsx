import { AuthProvider } from "@/components/auth/auth-provider";
import { AppShell } from "@/components/dashboard/app-shell";

export default function DashboardLayout({
  children,
}: LayoutProps<"/dashboard">) {
  return (
    <AuthProvider>
      <AppShell>{children}</AppShell>
    </AuthProvider>
  );
}
