"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const LAST_MAP_STORAGE_KEY = "huginn:last-map";
const DEFAULT_BACK_HREF = "/map";

function subscribeToLastMap() {
  return () => {};
}

function getLastMapHref(): string {
  try {
    const lastMap = window.localStorage.getItem(LAST_MAP_STORAGE_KEY);

    if (lastMap === null || lastMap === "") {
      return DEFAULT_BACK_HREF;
    }

    const slug = lastMap.startsWith("map-") ? lastMap.slice(4) : lastMap;
    return `${DEFAULT_BACK_HREF}?server=${encodeURIComponent(slug)}`;
  } catch {
    return DEFAULT_BACK_HREF;
  }
}

function getServerBackHref(): string {
  return DEFAULT_BACK_HREF;
}

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

export function AdminBackToMapLink() {
  const href = useSyncExternalStore(subscribeToLastMap, getLastMapHref, getServerBackHref);

  return (
    <Link className="admin-btn admin-btn--ghost admin-btn--small admin-topbar-back" href={href}>
      ← Back to map
    </Link>
  );
}
