"use client";

import Link from "next/link";

export type AdminRoute =
  | "/admin"
  | "/admin/accounts"
  | "/admin/alerts"
  | "/admin/history"
  | "/admin/deleted-markers"
  | "/admin/watermark-reveal";

const tabs = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/alerts", label: "Alerts" },
  { href: "/admin/accounts", label: "Accounts" },
  { href: "/admin/history", label: "History Log" },
  { href: "/admin/deleted-markers", label: "Deleted Markers" },
  { href: "/admin/watermark-reveal", label: "Watermark" },
] as const;

type AdminTabsProps = {
  currentRoute: AdminRoute;
};

export function AdminTabs({ currentRoute }: AdminTabsProps) {
  return (
    <nav aria-label="Admin sections" className="admin-tabs">
      {tabs.map((tab) => {
        const isActive = currentRoute === tab.href;
        return (
          <Link
            key={tab.href}
            aria-current={isActive ? "page" : undefined}
            className={`admin-tab${isActive ? " admin-tab--active" : ""}`}
            href={tab.href}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
