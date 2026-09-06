import {
  listAuditHistory,
  listAuditHistoryFilterOptions,
  type AuditHistoryActionGroup,
  type AuditHistoryOrder
} from "@/lib/audit-history/audit-history";
import { createAuditHistoryDependencies } from "@/lib/audit-history/database";
import { getCurrentViewer } from "@/lib/auth/current-viewer";
import { AdminAccessDenied } from "../admin-access-denied";
import type { AuditHistoryFilterValues } from "./audit-history-filters";
import { AuditHistoryView } from "./audit-history-view";

type SearchParams = {
  action?: string | string[];
  before?: string | string[];
  map?: string | string[];
  sort?: string | string[];
  user?: string | string[];
};

type AdminHistoryPageProps = {
  searchParams?: Promise<SearchParams>;
};

const ACTION_GROUPS: readonly AuditHistoryActionGroup[] = ["add", "edit", "delete", "other"];

export default async function AdminHistoryPage({ searchParams }: AdminHistoryPageProps) {
  const viewer = await getCurrentViewer();

  if (viewer === null) {
    return <AdminAccessDenied title="History" />;
  }

  const dependencies = createAuditHistoryDependencies();
  const options = await listAuditHistoryFilterOptions({ actor: viewer }, dependencies);

  if (!options.ok) {
    return <AdminAccessDenied title="History" message={options.error} />;
  }

  const params = await searchParams;
  const filters = parseFilters(params, options.value);
  const result = await listAuditHistory(
    {
      actionGroup: filters.actionGroup === "" ? undefined : filters.actionGroup,
      actor: viewer,
      actorUserId: filters.actorUserId === "" ? undefined : filters.actorUserId,
      before: getSingleSearchParam(params?.before),
      mapId: filters.mapId === "" ? undefined : filters.mapId,
      order: filters.order
    },
    dependencies
  );

  if (!result.ok) {
    return <AdminAccessDenied title="History" message={result.error} />;
  }

  return (
    <AuditHistoryView
      events={result.value.events}
      filters={filters}
      maps={options.value.maps}
      nextCursor={result.value.nextCursor}
      users={options.value.users}
    />
  );
}

function parseFilters(
  params: SearchParams | undefined,
  options: { maps: { id: string }[]; users: { id: string }[] }
): AuditHistoryFilterValues {
  const user = getSingleSearchParam(params?.user);
  const action = getSingleSearchParam(params?.action);
  const map = getSingleSearchParam(params?.map);
  const sort = getSingleSearchParam(params?.sort);

  return {
    actionGroup: ACTION_GROUPS.includes(action as AuditHistoryActionGroup)
      ? (action as AuditHistoryActionGroup)
      : "",
    actorUserId: user !== undefined && options.users.some((entry) => entry.id === user) ? user : "",
    mapId: map !== undefined && options.maps.some((entry) => entry.id === map) ? map : "",
    order: parseOrder(sort)
  };
}

function parseOrder(sort: string | undefined): AuditHistoryOrder {
  return sort === "asc" ? "asc" : "desc";
}

function getSingleSearchParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
