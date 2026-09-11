import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  GetCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
  TransactGetCommand,
  TransactWriteCommand,
  type TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";

export type WorkbookEntityKey =
  | "tab#investments"
  | "tab#tickers"
  | "tab#categories"
  | "tab#taxTreatment"
  | "tab#accounts"
  | "tab#accountTaxType"
  | "tab#accountType"
  | "tab#investmentType"
  | "settings#federal"
  | "settings#state"
  | "settings#local"
  | "settings#planner"
  | "settings#formulas"
  | "settings#ui"
  | "auth#mcpToken";

export type WorkbookPayload = {
  tabs?: Partial<Record<string, unknown>>;
  settings?: Partial<Record<string, unknown>>;
  expectedRevision?: number;
};

export class WorkbookConflictError extends Error {
  readonly statusCode = 409;
  constructor() {
    super("This workbook changed in another session. Reload the latest version before saving; your changes were not applied.");
    this.name = "WorkbookConflictError";
  }
}

const REVISION_KEY = "meta#revision";
const MAX_ITEM_BYTES = 240_000;

function validateItemSize(item: Record<string, unknown>) {
  const serialized = JSON.stringify(item);
  if (Buffer.byteLength(serialized, "utf8") > MAX_ITEM_BYTES) {
    throw new Error(`Workbook item ${String(item.entityKey)} exceeds the ${MAX_ITEM_BYTES}-byte safety limit. Reduce saved versions or formula data before saving.`);
  }
}

type WorkbookItem = {
  workspaceId: string;
  entityKey: WorkbookEntityKey;
  data: unknown;
  updatedAt: string;
};

export type McpTokenRecord = {
  tokenId: string;
  tokenHash: string;
  ownerSub: string;
  ownerEmail?: string;
  workspaceId: string;
  label?: string;
  createdAt: string;
  revokedAt?: string;
};

export type PublicReportRecord = {
  reportId: string;
  slug: string;
  name: string;
  ownerSub: string;
  payload: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

type PublicReportAlias = {
  reportId: string;
  slug: string;
  redirectSlug: string;
  ownerSub: string;
  createdAt: string;
  updatedAt: string;
};

export type PublicUsernameRecord = {
  username: string;
  ownerSub: string;
  createdAt: string;
  updatedAt: string;
};

export type AnalyticsVisitorEvent = {
  eventId: string;
  eventName: string;
  at: string;
  date: string;
  path: string;
  title?: string;
  referrer?: string;
  visitorId?: string;
  ipHash?: string;
  userAgent?: string;
  bot: boolean;
  botName?: string;
  browser?: string;
  device?: string;
  language?: string;
  timezone?: string;
  screen?: {
    width?: number;
    height?: number;
  };
};

const ENTITY_KEYS: WorkbookEntityKey[] = [
  "tab#investments",
  "tab#tickers",
  "tab#categories",
  "tab#taxTreatment",
  "tab#accounts",
  "tab#accountTaxType",
  "tab#accountType",
  "tab#investmentType",
  "settings#federal",
  "settings#state",
  "settings#local",
  "settings#planner",
  "settings#formulas",
  "settings#ui",
];

const TAB_TO_ENTITY: Record<string, WorkbookEntityKey> = {
  investments: "tab#investments",
  tickers: "tab#tickers",
  categories: "tab#categories",
  taxTreatment: "tab#taxTreatment",
  accounts: "tab#accounts",
  accountTaxType: "tab#accountTaxType",
  accountType: "tab#accountType",
  investmentType: "tab#investmentType",
  federalSettings: "settings#federal",
  stateSettings: "settings#state",
  localSettings: "settings#local",
  plannerSettings: "settings#planner",
  formulaSettings: "settings#formulas",
  uiSettings: "settings#ui",
};

const ENTITY_TO_RESPONSE_KEY: Partial<Record<WorkbookEntityKey, { group: "tabs" | "settings"; key: string }>> = {
  "tab#investments": { group: "tabs", key: "investments" },
  "tab#tickers": { group: "tabs", key: "tickers" },
  "tab#categories": { group: "tabs", key: "categories" },
  "tab#taxTreatment": { group: "tabs", key: "taxTreatment" },
  "tab#accounts": { group: "tabs", key: "accounts" },
  "tab#accountTaxType": { group: "tabs", key: "accountTaxType" },
  "tab#accountType": { group: "tabs", key: "accountType" },
  "tab#investmentType": { group: "tabs", key: "investmentType" },
  "settings#federal": { group: "settings", key: "federal" },
  "settings#state": { group: "settings", key: "state" },
  "settings#local": { group: "settings", key: "local" },
  "settings#planner": { group: "settings", key: "planner" },
  "settings#formulas": { group: "settings", key: "formulas" },
  "settings#ui": { group: "settings", key: "ui" },
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function toEntityKey(tabName: string): WorkbookEntityKey | null {
  return TAB_TO_ENTITY[tabName] ?? null;
}

function toNowIso(): string {
  return new Date().toISOString();
}

function mcpTokenLookupWorkspaceId(tokenHash: string) {
  return `mcpToken#${tokenHash}`;
}

function mcpTokenUserWorkspaceId(ownerSub: string) {
  return `mcpTokens#user#${ownerSub}`;
}

function publicReportLookupWorkspaceId(slug: string) {
  return `publicReport#${slug}`;
}

function publicReportUserWorkspaceId(ownerSub: string) {
  return `publicReports#user#${ownerSub}`;
}

function publicUsernameLookupWorkspaceId(username: string) {
  return `publicUsername#${username}`;
}

function analyticsEventWorkspaceId(date: string) {
  return `analytics#event#${date}`;
}

export class WorkbookStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(options?: { client?: DynamoDBDocumentClient; tableName?: string }) {
    this.tableName = options?.tableName ?? getRequiredEnv("WORKBOOK_TABLE_NAME");
    if (options?.client) {
      this.client = options.client;
      return;
    }
    const baseClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  private async queryPartition(workspaceId: string) {
    const items: Record<string, unknown>[] = [];
    let cursor: Record<string, unknown> | undefined;
    do {
      const response = await this.client.send(new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "workspaceId = :workspaceId",
        ExpressionAttributeValues: { ":workspaceId": workspaceId },
        ExclusiveStartKey: cursor,
        ConsistentRead: true,
      }));
      items.push(...(response.Items ?? []));
      cursor = response.LastEvaluatedKey;
    } while (cursor && Object.keys(cursor).length > 0);
    return items;
  }

  private async transact(items: NonNullable<TransactWriteCommandInput["TransactItems"]>) {
    for (const item of items) {
      if (item.Put?.Item) validateItemSize(item.Put.Item);
    }
    await this.client.send(new TransactWriteCommand({ TransactItems: items }));
  }

  async getRevision(workspaceId: string) {
    const response = await this.client.send(new GetCommand({
      TableName: this.tableName,
      Key: { workspaceId, entityKey: REVISION_KEY },
      ConsistentRead: true,
    }));
    return {
      workspaceId,
      revision: Number(response.Item?.revision ?? 0),
      updatedAt: (response.Item?.updatedAt as string | undefined) ?? null,
    };
  }

  async getWorkspace(workspaceId: string) {
    const response = await this.client.send(
      new TransactGetCommand({
        TransactItems: [...ENTITY_KEYS, REVISION_KEY].map((entityKey) => ({
          Get: { TableName: this.tableName, Key: { workspaceId, entityKey } },
        })),
      })
    );

    const tabs: Record<string, unknown> = {};
    const settings: Record<string, unknown> = {};
    let updatedAt: string | null = null;

    let revision = 0;
    for (const entry of response.Responses ?? []) {
      const rawItem = entry.Item;
      if (!rawItem) continue;
      if (rawItem.entityKey === REVISION_KEY) {
        revision = Number(rawItem.revision ?? 0);
        continue;
      }
      const item = rawItem as WorkbookItem;
      const mapping = ENTITY_TO_RESPONSE_KEY[item.entityKey];
      if (!mapping) continue;

      if (mapping.group === "tabs") {
        tabs[mapping.key] = item.data;
      } else {
        settings[mapping.key] = item.data;
      }

      if (!updatedAt || item.updatedAt > updatedAt) {
        updatedAt = item.updatedAt;
      }
    }

    return {
      workspaceId,
      tabs,
      settings,
      updatedAt,
      revision,
    };
  }

  async getTab(workspaceId: string, tabName: string) {
    const entityKey = toEntityKey(tabName);
    if (!entityKey) {
      throw new Error(`Unsupported workbook tab: ${tabName}`);
    }

    const response = await this.client.send(new TransactGetCommand({
      TransactItems: [entityKey, REVISION_KEY].map((key) => ({
        Get: { TableName: this.tableName, Key: { workspaceId, entityKey: key } },
      })),
    }));
    const item = response.Responses?.[0]?.Item;
    const metadata = response.Responses?.[1]?.Item;

    return {
      workspaceId,
      tab: tabName,
      data: item?.data ?? null,
      updatedAt: metadata?.updatedAt ?? item?.updatedAt ?? null,
      revision: Number(metadata?.revision ?? 0),
    };
  }

  async putTab(workspaceId: string, tabName: string, data: unknown, expectedRevision = 0) {
    const entityKey = toEntityKey(tabName);
    if (!entityKey) {
      throw new Error(`Unsupported workbook tab: ${tabName}`);
    }

    const mapping = ENTITY_TO_RESPONSE_KEY[entityKey]!;
    const result = await this.saveWorkspace(workspaceId, {
      [mapping.group]: { [mapping.key]: data },
      expectedRevision,
    });
    return { workspaceId, tab: tabName, updatedAt: result.updatedAt, revision: result.revision };
  }

  async saveWorkspace(workspaceId: string, payload: WorkbookPayload) {
    const expectedRevision = payload.expectedRevision ?? 0;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw new Error("expectedRevision must be a non-negative safe integer.");
    }
    for (const group of ["tabs", "settings"] as const) {
      const source = payload[group];
      if (source === undefined) continue;
      if (!source || Array.isArray(source) || typeof source !== "object") {
        throw new Error(`${group} must be an object.`);
      }
      const allowed = new Set(Object.values(ENTITY_TO_RESPONSE_KEY).filter((mapping) => mapping?.group === group).map((mapping) => mapping!.key));
      for (const key of Object.keys(source)) {
        if (!allowed.has(key)) throw new Error(`Unsupported workbook ${group} field: ${key}`);
        if (source[key] === undefined) throw new Error(`Workbook ${group}.${key} cannot be undefined.`);
      }
    }
    const updatedAt = toNowIso();
    const items: WorkbookItem[] = [];

    for (const key of ENTITY_KEYS) {
      const mapping = ENTITY_TO_RESPONSE_KEY[key];
      if (!mapping) continue;
      const source = mapping.group === "tabs" ? payload.tabs : payload.settings;
      if (!source || !(mapping.key in source)) {
        continue;
      }

      items.push({
        workspaceId,
        entityKey: key,
        data: source[mapping.key],
        updatedAt,
      });
    }

    if (items.length === 0) {
      return { ...await this.getRevision(workspaceId), savedKeys: [] as string[] };
    }

    const revision = expectedRevision + 1;
    try {
      await this.transact([
        ...items.map((item) => ({ Put: { TableName: this.tableName, Item: item } })),
        { Put: {
          TableName: this.tableName,
          Item: { workspaceId, entityKey: REVISION_KEY, revision, updatedAt },
          ConditionExpression: expectedRevision === 0 ? "attribute_not_exists(#revision) OR #revision = :expected" : "#revision = :expected",
          ExpressionAttributeNames: { "#revision": "revision" },
          ExpressionAttributeValues: { ":expected": expectedRevision },
        } },
      ]);
    } catch (error) {
      const failure = error as { name?: string; CancellationReasons?: { Code?: string }[] };
      if (failure.name === "ConditionalCheckFailedException" || failure.CancellationReasons?.some((reason) => reason.Code === "ConditionalCheckFailed")) {
        throw new WorkbookConflictError();
      }
      throw error;
    }

    return {
      workspaceId,
      updatedAt,
      revision,
      savedKeys: items.map((item) => item.entityKey),
    };
  }

  async putMcpToken(record: McpTokenRecord) {
    await this.transact([
      { Put: { TableName: this.tableName, Item: {
        workspaceId: mcpTokenLookupWorkspaceId(record.tokenHash), entityKey: "auth#mcpToken",
        data: record, updatedAt: record.createdAt,
      } } },
      { Put: { TableName: this.tableName, Item: {
        workspaceId: mcpTokenUserWorkspaceId(record.ownerSub), entityKey: `token#${record.tokenId}`,
        data: record, updatedAt: record.createdAt,
      } } },
    ]);

    return {
      tokenId: record.tokenId,
      workspaceId: record.workspaceId,
      createdAt: record.createdAt,
      label: record.label,
    };
  }

  async getMcpToken(tokenHash: string): Promise<McpTokenRecord | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          workspaceId: mcpTokenLookupWorkspaceId(tokenHash),
          entityKey: "auth#mcpToken",
        },
      })
    );

    const item = response.Item as WorkbookItem | undefined;
    return item?.data && typeof item.data === "object" ? item.data as McpTokenRecord : null;
  }

  async listMcpTokensForUser(ownerSub: string): Promise<McpTokenRecord[]> {
    const items = await this.queryPartition(mcpTokenUserWorkspaceId(ownerSub));
    return items
      .map((rawItem) => (rawItem as WorkbookItem).data)
      .filter((data): data is McpTokenRecord => Boolean(data) && typeof data === "object");
  }

  async revokeMcpTokenForUser(ownerSub: string, tokenId: string) {
    const tokens = await this.listMcpTokensForUser(ownerSub);
    const token = tokens.find((record) => record.tokenId === tokenId);
    if (!token) return null;

    const revoked: McpTokenRecord = {
      ...token,
      revokedAt: token.revokedAt || toNowIso(),
    };

    await this.transact([
      { Put: { TableName: this.tableName, Item: {
        workspaceId: mcpTokenLookupWorkspaceId(revoked.tokenHash), entityKey: "auth#mcpToken",
        data: revoked, updatedAt: revoked.revokedAt,
      } } },
      { Put: { TableName: this.tableName, Item: {
        workspaceId: mcpTokenUserWorkspaceId(ownerSub), entityKey: `token#${revoked.tokenId}`,
        data: revoked, updatedAt: revoked.revokedAt,
      } } },
    ]);

    return {
      tokenId: revoked.tokenId,
      workspaceId: revoked.workspaceId,
      revokedAt: revoked.revokedAt,
    };
  }

  async putAnalyticsEvent(record: AnalyticsVisitorEvent): Promise<AnalyticsVisitorEvent> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          workspaceId: analyticsEventWorkspaceId(record.date),
          entityKey: `${record.at}#${record.eventId}`,
          eventId: record.eventId,
          eventDate: record.date,
          data: record,
          updatedAt: record.at,
        },
      })
    );
    return record;
  }

  async listAnalyticsEvents(startDate: string, endDate: string): Promise<AnalyticsVisitorEvent[]> {
    const events: AnalyticsVisitorEvent[] = [];
    const cursor = new Date(`${startDate}T00:00:00.000Z`);
    const last = new Date(`${endDate}T00:00:00.000Z`);

    while (cursor <= last) {
      const date = cursor.toISOString().slice(0, 10);
      const items = await this.queryPartition(analyticsEventWorkspaceId(date));
      for (const item of items) {
        const record = item.data as AnalyticsVisitorEvent | undefined;
        if (record?.eventId && record?.at) events.push(record);
      }

      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return events.sort((left, right) => right.at.localeCompare(left.at));
  }

  async getPublicUsernameOwner(username: string): Promise<string | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: {
          workspaceId: publicUsernameLookupWorkspaceId(username),
          entityKey: "profile#username",
        },
      })
    );
    const record = response.Item?.data as PublicUsernameRecord | undefined;
    return record?.ownerSub || null;
  }

  async claimPublicUsername(username: string, ownerSub: string): Promise<PublicUsernameRecord> {
    const now = toNowIso();
    const record: PublicUsernameRecord = {
      username,
      ownerSub,
      createdAt: now,
      updatedAt: now,
    };
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          workspaceId: publicUsernameLookupWorkspaceId(username),
          entityKey: "profile#username",
          ownerSub,
          data: record,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(workspaceId) OR ownerSub = :ownerSub",
        ExpressionAttributeValues: {
          ":ownerSub": ownerSub,
        },
      })
    );
    return record;
  }

  async getPublicReport(slug: string): Promise<PublicReportRecord | null> {
    const readLookup = async (lookupSlug: string) => {
      const response = await this.client.send(
        new GetCommand({
          TableName: this.tableName,
          Key: {
            workspaceId: publicReportLookupWorkspaceId(lookupSlug),
            entityKey: "report#public",
          },
        })
      );
      return response.Item?.data as PublicReportRecord | PublicReportAlias | undefined;
    };

    const first = await readLookup(slug);
    if (!first) return null;
    if ("redirectSlug" in first) {
      const redirected = await readLookup(first.redirectSlug);
      return redirected && !("redirectSlug" in redirected) ? redirected : null;
    }
    return first;
  }

  async listPublicReportsForUser(ownerSub: string): Promise<PublicReportRecord[]> {
    const items = await this.queryPartition(publicReportUserWorkspaceId(ownerSub));
    return items
      .map((item) => item.data as PublicReportRecord | undefined)
      .filter((record): record is PublicReportRecord => Boolean(record?.reportId && record?.payload))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async putPublicReport(record: PublicReportRecord, previousSlug?: string): Promise<PublicReportRecord> {
    const ownerKey = {
      workspaceId: publicReportUserWorkspaceId(record.ownerSub),
      entityKey: `report#${record.reportId}`,
    };
    const existingResponse = await this.client.send(new GetCommand({ TableName: this.tableName, Key: ownerKey }));
    const existing = existingResponse.Item?.data as PublicReportRecord | undefined;
    const savedRecord: PublicReportRecord = {
      ...record,
      createdAt: existing?.createdAt || record.createdAt,
    };

    const writes: NonNullable<TransactWriteCommandInput["TransactItems"]> = [{
      Put: {
        TableName: this.tableName,
        Item: {
          workspaceId: publicReportLookupWorkspaceId(savedRecord.slug),
          entityKey: "report#public",
          reportId: savedRecord.reportId,
          ownerSub: savedRecord.ownerSub,
          data: savedRecord,
          updatedAt: savedRecord.updatedAt,
        },
        ConditionExpression: "attribute_not_exists(workspaceId) OR (reportId = :reportId AND ownerSub = :ownerSub)",
        ExpressionAttributeValues: {
          ":reportId": savedRecord.reportId,
          ":ownerSub": savedRecord.ownerSub,
        },
      },
    }, { Put: {
        TableName: this.tableName,
        Item: {
          ...ownerKey,
          reportId: savedRecord.reportId,
          ownerSub: savedRecord.ownerSub,
          data: savedRecord,
          updatedAt: savedRecord.updatedAt,
        },
      },
    }];

    if (previousSlug && previousSlug !== savedRecord.slug) {
      const alias: PublicReportAlias = {
        reportId: savedRecord.reportId,
        slug: previousSlug,
        redirectSlug: savedRecord.slug,
        ownerSub: savedRecord.ownerSub,
        createdAt: savedRecord.createdAt,
        updatedAt: savedRecord.updatedAt,
      };
      writes.push({ Put: {
          TableName: this.tableName,
          Item: {
            workspaceId: publicReportLookupWorkspaceId(previousSlug),
            entityKey: "report#public",
            reportId: savedRecord.reportId,
            ownerSub: savedRecord.ownerSub,
            data: alias,
            updatedAt: savedRecord.updatedAt,
          },
          ConditionExpression: "reportId = :reportId AND ownerSub = :ownerSub",
          ExpressionAttributeValues: {
            ":reportId": savedRecord.reportId,
            ":ownerSub": savedRecord.ownerSub,
          },
        },
      });
    }

    await this.transact(writes);
    return savedRecord;
  }

  async deletePublicReport(ownerSub: string, reportId: string): Promise<boolean> {
    const ownerKey = {
      workspaceId: publicReportUserWorkspaceId(ownerSub),
      entityKey: `report#${reportId}`,
    };
    const existingResponse = await this.client.send(new GetCommand({ TableName: this.tableName, Key: ownerKey }));
    const existing = existingResponse.Item?.data as PublicReportRecord | undefined;
    if (!existing || existing.ownerSub !== ownerSub || existing.reportId !== reportId) return false;

    await this.transact([
      { Delete: { TableName: this.tableName, Key: ownerKey } },
      { Delete: { TableName: this.tableName, Key: { workspaceId: publicReportLookupWorkspaceId(existing.slug), entityKey: "report#public" } } },
    ]);
    return true;
  }
}
