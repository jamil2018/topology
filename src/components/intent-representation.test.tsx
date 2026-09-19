import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  deriveIntentRepresentation,
  IntentRepresentationPanel,
} from "./intent-representation";

const caseId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("deriveIntentRepresentation", () => {
  it("prefers traditional case steps over behavior text", () => {
    expect(
      deriveIntentRepresentation({
        steps: "1. [Given] signed in\n2. [When] opens settings",
        expectedResult: "settings page loads",
        behavior: "Given something else. When ignored. Then ignored.",
      }),
    ).toEqual({
      given: ["signed in"],
      when: ["opens settings"],
      then: ["settings page loads"],
    });
  });

  it("parses behavior when no case steps exist", () => {
    expect(
      deriveIntentRepresentation({
        behavior: ["Given a user", "When they log in", "Then they see the hub"].join(
          "\n",
        ),
      }),
    ).toEqual({
      given: ["a user"],
      when: ["they log in"],
      then: ["they see the hub"],
    });
  });
});

describe("IntentRepresentationPanel", () => {
  it("toggles Traditional / BDD / Natural / Structured projections", async () => {
    const user = userEvent.setup();
    const steps =
      "1. [Given] the user is logged out\n2. [When] they submit a bad password 5 times";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === `/api/cases/${caseId}`) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              id: caseId,
              steps,
              expectedResult: "the account is locked",
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IntentRepresentationPanel
        intentTitle="Account lockout"
        behavior=""
        linkedCaseId={caseId}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Traditional steps")).toHaveValue(steps);
    });

    await user.click(screen.getByRole("button", { name: "BDD" }));
    expect(screen.getByTestId("representation-bdd")).toHaveTextContent(
      "Scenario: Account lockout",
    );
    expect(screen.getByTestId("representation-bdd")).toHaveTextContent(
      "Given the user is logged out",
    );
    expect(screen.getByTestId("representation-bdd")).toHaveTextContent(
      "Then the account is locked",
    );

    await user.click(screen.getByRole("button", { name: "Natural" }));
    expect(screen.getByTestId("representation-natural")).toHaveTextContent(
      /Given the user is logged out\. When they submit a bad password 5 times\. Then the account is locked\./,
    );

    await user.click(screen.getByRole("button", { name: "Structured" }));
    expect(screen.getByTestId("representation-structured")).toHaveTextContent(
      "Given",
    );
    expect(screen.getByTestId("representation-structured")).toHaveTextContent(
      "the user is logged out",
    );
    expect(screen.getByTestId("representation-structured")).toHaveTextContent(
      "display-first",
    );
  });

  it("saves traditional steps via PATCH on the linked case", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === `/api/cases/${caseId}` && (!init || !init.method || init.method === "GET")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              id: caseId,
              steps: "1. open",
              expectedResult: "ok",
            },
          }),
        };
      }
      if (url === `/api/cases/${caseId}` && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        return {
          ok: true,
          status: 200,
          json: async () => ({
            case: {
              id: caseId,
              steps: body.steps,
              expectedResult: body.expectedResult,
            },
          }),
        };
      }
      return { ok: false, status: 404, json: async () => ({ error: "missing" }) };
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <IntentRepresentationPanel
        intentTitle="Smoke"
        behavior=""
        linkedCaseId={caseId}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Traditional steps")).toHaveValue("1. open");
    });

    const nextSteps = "1. [When] click save";
    fireEvent.change(screen.getByLabelText("Traditional steps"), {
      target: { value: nextSteps },
    });
    await user.click(screen.getByRole("button", { name: "Save steps" }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/cases/${caseId}`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({
            steps: nextSteps,
            expectedResult: "ok",
          }),
        }),
      );
    });
    expect(await screen.findByText("Saved")).toBeInTheDocument();
  });
});
