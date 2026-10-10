export function getRoleLabel(role: string | undefined | null): string {
  if (role === "ADMIN") return "Administrator";
  if (role === "OFFICER") return "HR Officer";
  return role ?? "HR Officer";
}
