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
    vi.mocked(api.patch).mockReset();
  });

  it("shows existing links and lets you link an unlinked item", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links")) return Promise.resolve([]);
      return Promise.resolve([itemA, itemB]);
    });
    const newLink = { link_id: "link1", created_at: "now", relation: "related", direction_out: "none", item: itemB };
    vi.mocked(api.post).mockResolvedValueOnce(newLink);

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);

    expect(await screen.findByText("Not linked to anything yet.")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Item B" })).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Link to item" }), "b");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() => expect(screen.getByRole("link", { name: "Item B" })).toBeInTheDocument());
    expect(api.post).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links", {
      other_item_id: "b",
      relation: "related",
    });
  });

  it("unlinks an item", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links"))
        return Promise.resolve([
          { link_id: "link1", created_at: "now", relation: "related", direction_out: "none", item: itemB },
        ]);
      return Promise.resolve([itemA, itemB]);
    });

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);

    expect(await screen.findByRole("link", { name: "Item B" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Unlink" }));

    await waitFor(() => expect(api.delete).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links/link1"));
    expect(screen.queryByRole("link", { name: "Item B" })).not.toBeInTheDocument();
  });

  it("links with a chosen relation type", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links")) return Promise.resolve([]);
      return Promise.resolve([itemA, itemB]);
    });
    vi.mocked(api.post).mockResolvedValueOnce({
      link_id: "link1",
      created_at: "now",
      relation: "supersedes",
      direction_out: "out",
      item: itemB,
    });

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);
    await screen.findByText("Not linked to anything yet.");

    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Link to item" }), "b");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Relation type" }), "supersedes");
    await userEvent.click(screen.getByRole("button", { name: "Link" }));

    await waitFor(() =>
      expect(api.post).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links", {
        other_item_id: "b",
        relation: "supersedes",
      })
    );
    expect(await screen.findByText("Supersedes", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the inverse label when the relation points at this item", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links"))
        return Promise.resolve([
          { link_id: "link1", created_at: "now", relation: "references", direction_out: "in", item: itemB },
        ]);
      return Promise.resolve([itemA, itemB]);
    });

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);

    expect(await screen.findByText("Referenced by", { selector: "span" })).toBeInTheDocument();
    expect(screen.queryByText("References", { selector: "span" })).not.toBeInTheDocument();
  });

  it("retypes an existing link through PATCH", async () => {
    vi.mocked(api.get).mockImplementation((path: string) => {
      if (path.includes("/links"))
        return Promise.resolve([
          { link_id: "link1", created_at: "now", relation: "related", direction_out: "none", item: itemB },
        ]);
      return Promise.resolve([itemA, itemB]);
    });
    vi.mocked(api.patch).mockResolvedValueOnce({
      link_id: "link1",
      created_at: "now",
      relation: "depends_on",
      direction_out: "out",
      item: itemB,
    });

    render(<ItemLinkPicker spaceId="s1" itemId="a" />);
    await screen.findByRole("link", { name: "Item B" });

    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Change relation for Item B" }),
      "depends_on"
    );

    await waitFor(() =>
      expect(api.patch).toHaveBeenCalledWith("/api/v1/spaces/s1/items/a/links/link1", {
        relation: "depends_on",
      })
    );
    expect(await screen.findByText("Depends on", { selector: "span" })).toBeInTheDocument();
  });
});
