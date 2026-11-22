import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/** Open a HeroUI/TopoSelect trigger and choose an option by accessible name. */
export async function selectTopoOption(
  user: UserEvent,
  triggerName: string | RegExp,
  optionName: string | RegExp,
  scope?: HTMLElement,
) {
  const root = scope ? within(scope) : screen;
  await user.click(root.getByRole("button", { name: triggerName }));
  await user.click(await screen.findByRole("option", { name: optionName }));
}
