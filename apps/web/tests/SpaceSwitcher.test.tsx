import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SpaceSwitcher } from "@/components/SpaceSwitcher";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const spaces = [
  { id: "1", name: "Alpha", slug: "alpha", created_by: "u1", created_at: "now" },
  { id: "2", name: "Beta", slug: "beta", created_by: "u1", created_at: "now" },
];

describe("SpaceSwitcher", () => {
  beforeEach(() => {
    push.mockReset();
  });

  it("lists all spaces and navigates on selection", async () => {
    render(<SpaceSwitcher spaces={spaces} currentSpaceId="1" />);

    const select = screen.getByRole("combobox");
    expect(select).toHaveValue("1");

    await userEvent.selectOptions(select, "2");
    expect(push).toHaveBeenCalledWith("/spaces/2");
  });
});
