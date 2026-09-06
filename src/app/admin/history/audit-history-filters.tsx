"use client";

import { useRouter } from "next/navigation";
import type { AuditHistoryActionGroup, AuditHistoryOrder } from "@/lib/audit-history/audit-history";

export type AuditHistoryFilterValues = {
  actionGroup: AuditHistoryActionGroup | "";
  actorUserId: string;
  mapId: string;
  order: AuditHistoryOrder;
};

type AuditHistoryFiltersProps = {
  maps: { id: string; name: string }[];
  users: { id: string; username: string }[];
  values: AuditHistoryFilterValues;
};

export function AuditHistoryFilters({ maps, users, values }: AuditHistoryFiltersProps) {
  const router = useRouter();

  const applyFilters = (next: AuditHistoryFilterValues) => {
    const params = new URLSearchParams();

    if (next.actorUserId !== "") {
      params.set("user", next.actorUserId);
    }

    if (next.actionGroup !== "") {
      params.set("action", next.actionGroup);
    }

    if (next.mapId !== "") {
      params.set("map", next.mapId);
    }

    if (next.order !== "desc") {
      params.set("sort", next.order);
    }

    const query = params.toString();
    router.replace(query.length > 0 ? `/admin/history?${query}` : "/admin/history");
  };

  return (
    <div className="admin-toolbar">
      <label>
        User{" "}
        <select
          aria-label="Filter by user"
          className="admin-select"
          value={values.actorUserId}
          onChange={(event) => applyFilters({ ...values, actorUserId: event.target.value })}
        >
          <option value="">All users</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>{user.username}</option>
          ))}
        </select>
      </label>
      <label>
        Action{" "}
        <select
          aria-label="Filter by action"
          className="admin-select"
          value={values.actionGroup}
          onChange={(event) => applyFilters({
            ...values,
            actionGroup: event.target.value as AuditHistoryActionGroup | ""
          })}
        >
          <option value="">All actions</option>
          <option value="add">Add</option>
          <option value="edit">Edit</option>
          <option value="delete">Delete</option>
          <option value="other">Other</option>
        </select>
      </label>
      <label>
        Map{" "}
        <select
          aria-label="Filter by map"
          className="admin-select"
          value={values.mapId}
          onChange={(event) => applyFilters({ ...values, mapId: event.target.value })}
        >
          <option value="">All maps</option>
          {maps.map((map) => (
            <option key={map.id} value={map.id}>{map.name}</option>
          ))}
        </select>
      </label>
      <label>
        Sort{" "}
        <select
          aria-label="Sort by date"
          className="admin-select"
          value={values.order}
          onChange={(event) => applyFilters({
            ...values,
            order: event.target.value as AuditHistoryOrder
          })}
        >
          <option value="desc">Newest first</option>
          <option value="asc">Oldest first</option>
        </select>
      </label>
    </div>
  );
}
