import type {
  CreateIssueInput,
  IssueProvider,
  IssueProviderConfig,
  RemoteIssue,
  RemoteIssueStatus,
  TransitionIssueInput,
  UpdateIssueInput,
} from "./types";

type MockStore = Map<string, RemoteIssue>;

const globalStore: MockStore = new Map();

let counter = 1;

export function resetMockIssueStore() {
  globalStore.clear();
  counter = 1;
}

export function createMockIssueProvider(
  config: IssueProviderConfig = {},
): IssueProvider {
  const store = globalStore;
  const baseUrl = (config.baseUrl ?? "https://mock.topology.local").replace(
    /\/$/,
    "",
  );

  function requireStored(idOrKey: string): RemoteIssue {
    const found = [...store.values()].find(
      (i) => i.key === idOrKey || i.id === idOrKey,
    );
    if (!found) throw new Error(`Mock issue not found: ${idOrKey}`);
    return found;
  }

  async function getIssue(idOrKey: string): Promise<RemoteIssue> {
    const byKey = [...store.values()].find(
      (i) => i.key === idOrKey || i.id === idOrKey,
    );
    if (byKey) return { ...byKey };

    // Allow linking a key that was created outside this process
    const issue: RemoteIssue = {
      provider: "mock",
      id: `mock-linked-${idOrKey}`,
      key: idOrKey,
      url: `${baseUrl}/issues/${idOrKey}`,
      title: idOrKey,
      status: "open",
    };
    store.set(issue.id, issue);
    return { ...issue };
  }

  async function updateIssue(
    idOrKey: string,
    input: UpdateIssueInput,
  ): Promise<RemoteIssue> {
    if (config.fetch) {
      const res = await config.fetch(`${baseUrl}/issues/${idOrKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        throw new Error(`Mock HTTP update failed: ${res.status}`);
      }
      const data = (await res.json()) as RemoteIssue;
      store.set(data.id, data);
      return data;
    }

    const stored = requireStored(idOrKey);
    if (input.title) stored.title = input.title;
    if (input.status) stored.status = input.status;
    return { ...stored };
  }

  async function transition(
    idOrKey: string,
    input: TransitionIssueInput,
  ): Promise<RemoteIssue> {
    return updateIssue(idOrKey, { status: input.status });
  }

  return {
    id: "mock",
    async createIssue(input: CreateIssueInput): Promise<RemoteIssue> {
      // Optional network path so tests can assert HTTP shape
      if (config.fetch) {
        const res = await config.fetch(`${baseUrl}/issues`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });
        if (!res.ok) {
          throw new Error(`Mock HTTP create failed: ${res.status}`);
        }
        const data = (await res.json()) as RemoteIssue;
        store.set(data.id, data);
        return data;
      }

      const id = `mock-${counter}`;
      const key = `MOCK-${counter}`;
      counter += 1;
      const issue: RemoteIssue = {
        provider: "mock",
        id,
        key,
        url: `${baseUrl}/issues/${key}`,
        title: input.title,
        status: "open",
      };
      store.set(id, issue);
      return { ...issue };
    },
    getIssue,
    linkExisting: getIssue,
    updateIssue,
    transition,
  };
}

/** Test helper — flip remote status without a real tracker */
export function setMockIssueStatus(
  idOrKey: string,
  status: RemoteIssueStatus,
): RemoteIssue {
  const issue = [...globalStore.values()].find(
    (i) => i.id === idOrKey || i.key === idOrKey,
  );
  if (!issue) throw new Error(`Mock issue not found: ${idOrKey}`);
  issue.status = status;
  return { ...issue };
}
