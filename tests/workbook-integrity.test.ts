import { describe, expect, test, vi } from "vitest";
import { WorkbookConflictError, WorkbookStore } from "../amplify/backend/function/helloWorld/src/workbookStore";

type Item = Record<string, unknown>;
type Operation = { Put?: { Item: Item; ExpressionAttributeValues?: Record<string, unknown> }; Delete?: { Key: Item } };
type Command = { constructor: { name: string }; input: { Key?: Item; TransactItems?: Array<Operation & { Get?: { Key: Item } }> } };

function fakeStore() {
  const records = new Map<string, Item>();
  const key = (item: Item) => `${item.workspaceId}/${item.entityKey}`;
  let failNextTransaction = false;
  const send = vi.fn(async (command: Command) => {
    if (command.constructor.name === "GetCommand") return { Item: records.get(key(command.input.Key!)) };
    if (command.constructor.name === "TransactGetCommand") {
      return { Responses: command.input.TransactItems!.map((operation) => ({ Item: records.get(key(operation.Get!.Key)) })) };
    }
    if (command.constructor.name === "TransactWriteCommand") {
      if (failNextTransaction) {
        failNextTransaction = false;
        throw Object.assign(new Error("Temporary throttling"), { name: "ProvisionedThroughputExceededException" });
      }
      const operations = command.input.TransactItems!;
      for (const operation of operations) {
        const expected = operation.Put?.ExpressionAttributeValues?.[":expected"];
        if (expected !== undefined && (records.get(key(operation.Put!.Item))?.revision ?? 0) !== expected) {
          throw Object.assign(new Error("Conditional check failed"), {
            name: "TransactionCanceledException", CancellationReasons: [{ Code: "ConditionalCheckFailed" }],
          });
        }
      }
      for (const operation of operations) {
        if (operation.Put) records.set(key(operation.Put.Item), structuredClone(operation.Put.Item));
        if (operation.Delete) records.delete(key(operation.Delete.Key));
      }
      return {};
    }
    throw new Error(`Unexpected command ${command.constructor.name}`);
  });
  return {
    store: new WorkbookStore({ tableName: "test-workbooks", client: { send } as never }),
    records, send, fail: () => { failNextTransaction = true; },
  };
}

describe("atomic workbook persistence", () => {
  test("round trips every supported tab and setting, including local taxes and account types", async () => {
    const { store, send } = fakeStore();
    const payload = {
      tabs: { investments: [{ id: 1, includeIncome: true }], accountType: [{ id: 1, name: "W2 income" }] },
      settings: { local: { enabled: true, localityId: "custom", customRate: 0.02 }, ui: { whatIfActive: false } },
      expectedRevision: 0,
    };
    const saved = await store.saveWorkspace("user#alice", payload);
    expect(saved.revision).toBe(1);
    const loaded = await store.getWorkspace("user#alice");
    expect(loaded.tabs).toEqual(payload.tabs);
    expect(loaded.settings).toEqual(payload.settings);
    expect(loaded.revision).toBe(1);
    expect(send.mock.calls.map(([command]) => command.constructor.name)).toEqual(["TransactWriteCommand", "TransactGetCommand"]);
  });

  test("a legacy workbook reads revision zero and upgrades without dropping untouched tabs", async () => {
    const { store, records } = fakeStore();
    records.set("alice/tab#accounts", { workspaceId: "alice", entityKey: "tab#accounts", data: [{ id: 1 }], updatedAt: "2025-01-01" });
    expect((await store.getWorkspace("alice")).revision).toBe(0);
    await store.saveWorkspace("alice", { settings: { local: { enabled: false } }, expectedRevision: 0 });
    expect((await store.getWorkspace("alice")).tabs.accounts).toEqual([{ id: 1 }]);
  });

  test("two readers cannot overwrite one another with a stale snapshot", async () => {
    const { store } = fakeStore();
    await store.saveWorkspace("alice", { tabs: { investments: [{ id: 1 }] }, expectedRevision: 0 });
    const firstReader = await store.getWorkspace("alice");
    const secondReader = await store.getWorkspace("alice");
    await store.saveWorkspace("alice", { tabs: { investments: [{ id: 1, includeIncome: false }] }, expectedRevision: firstReader.revision });
    await expect(store.saveWorkspace("alice", { tabs: secondReader.tabs, expectedRevision: secondReader.revision })).rejects.toBeInstanceOf(WorkbookConflictError);
    expect((await store.getWorkspace("alice")).tabs.investments).toEqual([{ id: 1, includeIncome: false }]);
  });

  test("omitting the revision cannot bypass conflict protection on a revisioned workbook", async () => {
    const { store } = fakeStore();
    await store.saveWorkspace("alice", { settings: { federal: {} } });
    await expect(store.saveWorkspace("alice", { settings: { federal: { extraOrdinaryIncome: 100 } } })).rejects.toMatchObject({ statusCode: 409 });
  });

  test("failed multi-tab transactions preserve both data and refresh revision", async () => {
    const { store, fail } = fakeStore();
    await store.saveWorkspace("alice", { tabs: { investments: [], accounts: [] }, expectedRevision: 0 });
    const before = await store.getWorkspace("alice");
    fail();
    await expect(store.saveWorkspace("alice", { tabs: { investments: [{ id: 1 }], accounts: [{ id: 1 }] }, expectedRevision: 1 })).rejects.toThrow("throttling");
    expect(await store.getWorkspace("alice")).toEqual(before);
  });

  test("known tab reads only the tab and metadata together", async () => {
    const { store, send } = fakeStore();
    await store.putTab("alice", "localSettings", { enabled: true }, 0);
    expect(await store.getTab("alice", "localSettings")).toMatchObject({ data: { enabled: true }, revision: 1 });
    expect(send.mock.calls.at(-1)?.[0].input.TransactItems).toHaveLength(2);
  });

  test("revision polling uses one strongly consistent metadata read", async () => {
    const { store, send } = fakeStore();
    expect(await store.getRevision("alice")).toEqual({ workspaceId: "alice", revision: 0, updatedAt: null });
    expect(send.mock.calls[0][0]).toMatchObject({ input: { ConsistentRead: true, Key: { entityKey: "meta#revision" } } });
  });

  test("oversized and unknown items fail before any write", async () => {
    const { store, send } = fakeStore();
    await expect(store.saveWorkspace("alice", { settings: { formulas: { text: "x".repeat(240_001) } } })).rejects.toThrow("settings#formulas");
    await expect(store.saveWorkspace("alice", { settings: { typo: {} } })).rejects.toThrow("Unsupported workbook settings field");
    expect(send).not.toHaveBeenCalled();
  });

  test.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("invalid revision %s is rejected before storage", async (revision) => {
    const { store, send } = fakeStore();
    await expect(store.saveWorkspace("alice", { settings: { federal: {} }, expectedRevision: revision })).rejects.toThrow("expectedRevision");
    expect(send).not.toHaveBeenCalled();
  });

  test("workspaces remain isolated", async () => {
    const { store } = fakeStore();
    await store.saveWorkspace("alice", { tabs: { investments: [{ id: 1 }] } });
    expect((await store.getWorkspace("bob")).tabs).toEqual({});
  });
});

describe("paginated secondary records and atomic deletion", () => {
  test("token listing follows even an empty first page to its cursor", async () => {
    const cursor = { workspaceId: "mcpTokens#user#alice", entityKey: "token#first" };
    const token = { tokenId: "last", ownerSub: "alice" };
    const send = vi.fn().mockResolvedValueOnce({ Items: [], LastEvaluatedKey: cursor }).mockResolvedValueOnce({ Items: [{ data: token }] });
    const store = new WorkbookStore({ tableName: "test", client: { send } as never });
    expect(await store.listMcpTokensForUser("alice")).toEqual([token]);
    expect(send.mock.calls[1][0].input.ExclusiveStartKey).toEqual(cursor);
  });

  test("reports and analytics read all pages", async () => {
    const report = { reportId: "r1", payload: {}, updatedAt: "2025-01-01" };
    const event = { eventId: "e1", at: "2025-01-01T01:00:00Z" };
    const send = vi.fn().mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { entityKey: "first" } })
      .mockResolvedValueOnce({ Items: [{ data: report }] })
      .mockResolvedValueOnce({ Items: [], LastEvaluatedKey: { entityKey: "first" } })
      .mockResolvedValueOnce({ Items: [{ data: event }] });
    const store = new WorkbookStore({ tableName: "test", client: { send } as never });
    expect(await store.listPublicReportsForUser("alice")).toEqual([report]);
    expect(await store.listAnalyticsEvents("2025-01-01", "2025-01-01")).toEqual([event]);
  });

  test("report deletion fails rather than acknowledges a partial operation", async () => {
    const send = vi.fn().mockResolvedValueOnce({ Item: { data: { ownerSub: "alice", reportId: "r1", slug: "alice-report" } } })
      .mockRejectedValueOnce(new Error("Transaction cancelled"));
    const store = new WorkbookStore({ tableName: "test", client: { send } as never });
    await expect(store.deletePublicReport("alice", "r1")).rejects.toThrow("Transaction cancelled");
    expect(send.mock.calls[1][0].constructor.name).toBe("TransactWriteCommand");
    expect(send.mock.calls[1][0].input.TransactItems).toHaveLength(2);
  });
});
