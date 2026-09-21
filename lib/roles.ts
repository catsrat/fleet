// OWNER > ADMIN > REVIEWER. There is exactly one OWNER, created from the command line (npm run owner:setup),
// never through the web UI. Reviewers verify documents; admins additionally see payroll and payslips;
// only the owner manages staff accounts and their two-factor settings.
export type Role = "RIDER" | "REVIEWER" | "ADMIN" | "OWNER";

export const isStaffRole = (role: string): boolean => role === "REVIEWER" || role === "ADMIN" || role === "OWNER";
export const isAdminRole = (role: string): boolean => role === "ADMIN" || role === "OWNER";
export const isOwnerRole = (role: string): boolean => role === "OWNER";

export const ROLE_LABEL: Record<Role, string> = { RIDER: "Rider", REVIEWER: "Reviewer", ADMIN: "Admin", OWNER: "Owner" };
