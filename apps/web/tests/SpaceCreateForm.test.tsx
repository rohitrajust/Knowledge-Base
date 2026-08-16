import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpaceCreateForm } from "@/components/SpaceCreateForm";
import { api, ApiError } from "@/lib/api-client";

vi.mock("@/lib/api-client", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api-client")>("@/lib/api-client");
  return {
    ...actual,
    api: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
  };
});

describe("SpaceCreateForm", () => {
  beforeEach(() => {
    vi.mocked(api.post).mockReset();
  });

  it("submits the name and calls onCreated with the new space", async () => {
    const space = { id: "1", name: "Demo", slug: "demo-abc", created_by: "u1", created_at: "now" };
    vi.mocked(api.post).mockResolvedValueOnce(space);
    const onCreated = vi.fn();

    render(<SpaceCreateForm onCreated={onCreated} />);
    await userEvent.type(screen.getByPlaceholderText("New space name"), "Demo");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(space));
    expect(api.post).toHaveBeenCalledWith("/api/v1/spaces", { name: "Demo" });
    expect(screen.getByPlaceholderText("New space name")).toHaveValue("");
  });

  it("shows an error message when creation fails", async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new ApiError(400, "domain_error", "Name required"));

    render(<SpaceCreateForm onCreated={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText("New space name"), "x");
    await userEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("Name required")).toBeInTheDocument();
  });

  it("does not submit an empty name", async () => {
    render(<SpaceCreateForm onCreated={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(api.post).not.toHaveBeenCalled();
  });
});
