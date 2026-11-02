import {
  Award, BarChart3, BookOpen, CalendarDays, ClipboardCheck, FileText, Globe, Inbox, LayoutDashboard, Megaphone,
  MessagesSquare, ScrollText, Settings, Shield, UserCog, Users, UsersRound,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: typeof LayoutDashboard; module?: string };
export type NavGroup = { label: string; items: NavItem[] };

/** Sidebar: each item shows only when the user can view its module. */
export const NAV: NavGroup[] = [
  { label: "Overview", items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "Learning",
    items: [
      { href: "/courses", label: "Courses", icon: BookOpen, module: "courses" },
      { href: "/submissions", label: "Task reviews", icon: ClipboardCheck, module: "submissions" },
      { href: "/batches", label: "Batches", icon: UsersRound, module: "batches" },
      { href: "/certificates", label: "Certificates", icon: Award, module: "certificates" },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/students", label: "Students", icon: Users, module: "students" },
      { href: "/staff", label: "Staff", icon: UserCog, module: "users" },
      { href: "/roles", label: "Roles & permissions", icon: Shield, module: "roles" },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/live", label: "Live sessions", icon: CalendarDays, module: "live" },
      { href: "/announcements", label: "Announcements", icon: Megaphone, module: "announcements" },
      { href: "/comments", label: "Video Q&A", icon: MessagesSquare, module: "comments" },
    ],
  },
  {
    label: "Website",
    items: [
      { href: "/website", label: "Landing page", icon: Globe, module: "cms" },
      { href: "/leads", label: "Leads", icon: Inbox, module: "leads" },
      { href: "/blog", label: "Blog", icon: FileText, module: "blog" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3, module: "analytics" },
      { href: "/audit", label: "Audit log", icon: ScrollText, module: "audit" },
      { href: "/settings", label: "Settings", icon: Settings, module: "settings" },
    ],
  },
];
