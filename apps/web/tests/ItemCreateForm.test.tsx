import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ItemCreateForm } from "@/components/ItemCreateForm";
import { api, ApiError } from "@/lib/api-client";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    api: { post: vi.fn(), get: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

describe("ItemCreateForm", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("submits a note and calls onCreated", async () => {
    const item = {
      id: "1",
      space_id: "s1",
      kind: "note",
      title: "My note",
      body: "hello",
      url: null,
      created_by: "u1",
      created_at: "now",
      updated_at: "now",
    };
    vi.mocked(api.post).mockResolvedValueOnce(item);
    const onCreated = vi.fn();

    render(<ItemCreateForm spaceId="s1" onCreated={onCreated} />);
    await userEvent.type(screen.getByPlaceholderText("Title"), "My note");
    await userEvent.type(screen.getByPlaceholderText("Content"), "hello");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(item));
    expect(api.post).toHaveBeenCalledWith("/api/v1/spaces/s1/items", {
      kind: "note",
      title: "My note",
      body: "hello",
      url: undefined,
    });
  });

  it("reveals a URL field for references and blocks submit without one", async () => {
    render(<ItemCreateForm spaceId="s1" onCreated={vi.fn()} />);

    await userEvent.selectOptions(screen.getByRole("combobox"), "reference");
    expect(screen.getByPlaceholderText("https://...")).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText("Title"), "A link");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("A reference needs a URL.")).toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("submits a reference once a URL is provided", async () => {
    const item = {
      id: "2",
      space_id: "s1",
      kind: "reference",
      title: "A link",
      body: "",
      url: "https://example.com",
      created_by: "u1",
      created_at: "now",
      updated_at: "now",
    };
    vi.mocked(api.post).mockResolvedValueOnce(item);
    const onCreated = vi.fn();

    render(<ItemCreateForm spaceId="s1" onCreated={onCreated} />);
    await userEvent.selectOptions(screen.getByRole("combobox"), "reference");
    await userEvent.type(screen.getByPlaceholderText("Title"), "A link");
    await userEvent.type(screen.getByPlaceholderText("https://..."), "https://example.com");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(item));
  });

  it("shows an error message when creation fails", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(400, "domain_error", "Could not create."));

    render(<ItemCreateForm spaceId="s1" onCreated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("Title"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    expect(await screen.findByText("Could not create.")).toBeInTheDocument();
  });
});
