import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Button, useOverlayState } from "@heroui/react";
import { ConfirmDialog } from "./confirm-dialog";

afterEach(() => {
  cleanup();
});

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const state = useOverlayState();
  return (
    <>
      <Button onPress={() => state.open()}>Delete</Button>
      <ConfirmDialog
        state={state}
        title="Delete project"
        description="All project data will be removed."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={onConfirm}
      />
    </>
  );
}

describe("ConfirmDialog", () => {
  it("confirms from a dialog instead of window.confirm", async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<Harness onConfirm={onConfirm} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(
      await screen.findByRole("dialog", { name: /Delete project/i }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalled();
  });
});
