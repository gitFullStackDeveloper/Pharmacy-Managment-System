import { ReactNode, useState } from "react";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth, type Role } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Pill, LogOut, LayoutDashboard, Package, ShoppingCart, Users, ClipboardList, BarChart3, Boxes, Percent, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; roles: Role[] };

const NAV: NavItem[] = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, roles: ["admin", "manager", "counter"] },
  { to: "/products", label: "Products", icon: Package, roles: ["admin", "manager"] },
  { to: "/inventory", label: "Inventory", icon: Boxes, roles: ["admin", "manager"] },
  { to: "/discounts", label: "Discounts", icon: Percent, roles: ["admin", "manager"] },
  { to: "/pos", label: "Point of Sale", icon: ShoppingCart, roles: ["admin", "counter"] },
  { to: "/sales", label: "Sales", icon: ClipboardList, roles: ["admin", "manager", "counter"] },
  { to: "/reports", label: "Reports", icon: BarChart3, roles: ["admin", "manager"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
  { to: "/audit", label: "Audit Logs", icon: ClipboardList, roles: ["admin"] },
];

export function DashboardLayout({ children, title }: { children: ReactNode; title: string }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("sidebar-collapsed") === "1";
  });

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      if (typeof window !== "undefined") {
        window.localStorage.setItem("sidebar-collapsed", next ? "1" : "0");
      }
      return next;
    });
  };

  const items = NAV.filter((n) => role && n.roles.includes(role));

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-border bg-card transition-[width] duration-200",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <div className={cn("flex items-center gap-2 border-b border-border", collapsed ? "px-2 py-4 justify-center" : "px-6 py-5")}>
          <div className="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
            <Pill className="h-5 w-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="font-bold text-foreground leading-tight truncate">PharmaCare</p>
              <p className="text-xs text-muted-foreground capitalize truncate">{role} portal</p>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 shrink-0", collapsed && "absolute -right-3 top-6 h-6 w-6 rounded-full border border-border bg-card shadow-sm")}
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </Button>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {items.map((item) => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  collapsed && "justify-center px-2",
                  active
                    ? "bg-primary text-primary-foreground shadow-[var(--shadow-soft)]"
                    : "text-foreground/70 hover:bg-secondary hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border">
          {!collapsed && <p className="text-xs text-muted-foreground truncate mb-2">{user?.email}</p>}
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            title={collapsed ? "Sign out" : undefined}
            onClick={async () => {
              await signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOut className={cn("h-4 w-4", !collapsed && "mr-2")} />
            {!collapsed && "Sign out"}
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="border-b border-border bg-card/60 backdrop-blur px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          <div className="md:hidden">
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); navigate({ to: "/login" }); }}>
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>

        {/* mobile bottom nav */}
        <nav className="md:hidden border-t border-border bg-card flex overflow-x-auto">
          {items.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = path === item.to;
            return (
              <Link key={item.to} to={item.to} className={cn("flex-1 flex flex-col items-center gap-1 py-2 text-xs", active ? "text-primary" : "text-muted-foreground")}>
                <Icon className="h-4 w-4" />
                {item.label.split(" ")[0]}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export function RequireRole({ children, allow }: { children: ReactNode; allow: Role[] }) {
  const { role, loading, user } = useAuth();
  const navigate = useNavigate();

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Loading…</div>;
  }
  if (!user) {
    setTimeout(() => navigate({ to: "/login" }), 0);
    return null;
  }
  if (!role || !allow.includes(role)) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="text-center max-w-sm">
          <h2 className="text-2xl font-semibold mb-2">Access denied</h2>
          <p className="text-muted-foreground mb-4">Your role ({role ?? "none"}) cannot access this page.</p>
          <Button onClick={() => navigate({ to: "/dashboard" })}>Go to dashboard</Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}