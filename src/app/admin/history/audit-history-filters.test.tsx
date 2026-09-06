import { fireEvent, render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuditHistoryFilters } from "./audit-history-filters";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn()
}));

const useRouterMock = vi.mocked(useRouter);

const defaultProps = {
  maps: [
    { id: "map-wurm", name: "Wurm" },
    { id: "map-xanadu", name: "Xanadu" }
  ],
  users: [
    { id: "user-1", username: "Admin" },
    { id: "user-2", username: "Mako" }
  ],
  values: {
    actionGroup: "" as const,
    actorUserId: "",
    mapId: "",
    order: "desc" as const
  }
};

describe("AuditHistoryFilters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useRouterMock.mockReturnValue({ replace: vi.fn() } as unknown as ReturnType<typeof useRouter>);
  });

  it("renders the four controls with default values", () => {
    render(React.createElement(AuditHistoryFilters, defaultProps));

    expect((screen.getByLabelText("Filter by user") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Filter by action") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Filter by map") as HTMLSelectElement).value).toBe("");
    expect((screen.getByLabelText("Sort by date") as HTMLSelectElement).value).toBe("desc");
    expect(screen.getByRole("option", { name: "Mako" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Xanadu" })).toBeTruthy();
  });

  it("navigates with the selected user and drops the cursor", () => {
    const replace = vi.fn();
    useRouterMock.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
    render(React.createElement(AuditHistoryFilters, defaultProps));

    fireEvent.change(screen.getByLabelText("Filter by user"), {
      target: { value: "user-2" }
    });

    expect(replace).toHaveBeenCalledWith("/admin/history?user=user-2");
  });

  it("keeps the other active filters when one changes", () => {
    const replace = vi.fn();
    useRouterMock.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
    render(React.createElement(AuditHistoryFilters, {
      ...defaultProps,
      values: {
        actionGroup: "edit",
        actorUserId: "user-1",
        mapId: "map-wurm",
        order: "asc"
      }
    }));

    fireEvent.change(screen.getByLabelText("Filter by action"), {
      target: { value: "delete" }
    });

    expect(replace).toHaveBeenCalledWith(
      "/admin/history?user=user-1&action=delete&map=map-wurm&sort=asc"
    );
  });

  it("navigates to the bare history URL when all filters are cleared", () => {
    const replace = vi.fn();
    useRouterMock.mockReturnValue({ replace } as unknown as ReturnType<typeof useRouter>);
    render(React.createElement(AuditHistoryFilters, {
      ...defaultProps,
      values: {
        actionGroup: "",
        actorUserId: "user-1",
        mapId: "",
        order: "desc"
      }
    }));

    fireEvent.change(screen.getByLabelText("Filter by user"), {
      target: { value: "" }
    });

    expect(replace).toHaveBeenCalledWith("/admin/history");
  });
});
