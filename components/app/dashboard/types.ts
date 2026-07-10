// Serializable shapes for the dashboard client components. The server page maps
// insights.MemberActivity (which has a `lastActive: Date`) into these plain
// string-only rows before crossing the server→client boundary, so no Date
// objects are ever passed to a Recharts / client component.

export interface DashboardMember {
  userId: string;
  name: string;
  isManager: boolean;
  analyses: number;
  decisionReports: number;
  lastActive: string | null; // pre-computed relative string, e.g. "2d ago"
}
