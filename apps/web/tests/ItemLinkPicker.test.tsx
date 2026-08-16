import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemLinkPicker } from "@/components/ItemLinkPicker";
import { api } from "@/lib/api-client";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    api: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

const itemA = { id: "a", space_id: "s1", kind: "note", title: "Item A", body: "", url: null, created_by: "u1", created_at: "now", updated_at: "now" };
const itemB = { id: "b", space_id: "s1", kind: "note", title: "Item B", body: "", url: null, created_by: "u1", created_at: "now", updated_at: "now" };

describe("ItemLinkPicker", () => {
  beforeEach(() => {
    vi.mocked(api.get).mockReset();
    vi.mocked(api.post).mockReset();
    vi.mocked(api.delete).mockReset();
  });

  it("shows existing links and lets you link an unlinked item", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links")) return Promise.resolve([]);
      return Promise.resolve([itemA, itemB]);
    });
    const newLink = { link_id: "link1", created_at: "now", item: itemB };
    vi.mocked(api.post).mockResolvedValueOnce(newLink);

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);

    expect(await screen.findByText("Not linked to anything yet.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item B" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox"), "b");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Item B" })).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links", { other_item_id: "b" });
  });

  it("unlinks an item", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links")) return Promise.resolve([{ link_id: "link1", created_at: "now", item: itemB }]);
      return Promise.resolve([itemA, itemB]);
    });

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);

    expect(await screen.findByRole("link", { name: "Item B" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links/link1"));
    expect(screen.queryByRole("link", { name: "Item B" })).not.toBeInTheDocument();
  });
});
