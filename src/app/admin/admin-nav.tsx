"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/deleted-markers", label: "Deleted Markers" },
  { href: "/admin/discord", label: "Discord" },
  { href: "/admin/history", label: "History Log" },
  { href: "/admin/security", label: "Security" }
] as const;

function getActiveHref(pathname: string): string {
  if (pathname === "/admin") {
    return "/admin";
  }

  const match = navItems.find((item) => item.href !== "/admin" && pathname.startsWith(item.href));
  return match?.href ?? "/admin";
}

export function AdminNav() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);

  return (
    <>
      <Link className="admin-brand" href="/admin">Huginn</Link>
      <nav aria-label="Admin sections" className="admin-nav">
        {navItems.map((item) => {
          const isActive = activeHref === item.href;
          return (
            <Link
              key={item.href}
              aria-current={isActive ? "page" : undefined}
              className={`admin-nav-link${isActive ? " admin-nav-link--active" : ""}`}
              href={item.href}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function AdminTopbarTitle() {
  const pathname = usePathname();
  const activeHref = getActiveHref(pathname);
  const activeItem = navItems.find((item) => item.href === activeHref);

  return (
    <span className="admin-topbar-title">
      <span className="admin-topbar-crumb">Admin /</span> {activeItem?.label ?? "Dashboard"}
    </span>
  );
}
