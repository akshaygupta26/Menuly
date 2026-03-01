"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  UtensilsCrossed,
  CalendarDays,
  ShoppingCart,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const navItems: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Recipes", href: "/recipes", icon: UtensilsCrossed },
  { label: "Meal Plan", href: "/plan", icon: CalendarDays },
  { label: "Grocery", href: "/grocery", icon: ShoppingCart },
  { label: "Settings", href: "/settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-dvh bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 border-r border-border bg-sidebar">
        {/* Sidebar Header */}
        <div className="flex h-16 items-center px-6 border-b border-sidebar-border">
          <Link href="/" className="flex items-center gap-2">
            <UtensilsCrossed className="size-6 text-primary" />
            <span className="text-xl font-bold text-sidebar-foreground tracking-tight">
              Menuly
            </span>
          </Link>
        </div>

        {/* Sidebar Navigation */}
        <nav className="flex-1 flex flex-col gap-1 p-3">
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-primary"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className={cn("size-5", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-60">
        <div className="mx-auto max-w-4xl px-4 py-6 pb-24 md:px-8 md:py-8 md:pb-8">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex md:hidden border-t border-border bg-background/95 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center gap-1 py-2 pt-2.5 text-[11px] font-medium transition-colors",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className="size-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
