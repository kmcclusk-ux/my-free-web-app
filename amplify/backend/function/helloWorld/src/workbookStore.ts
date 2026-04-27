import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from "@aws-sdk/lib-dynamodb";

export type WorkbookEntityKey =
  | "tab#investments"
  | "tab#tickers"
  | "tab#categories"
  | "tab#taxTreatment"
  | "tab#accounts"
  | "tab#accountTaxType"
  | "tab#investmentType"
  | "settings#federal"
  | "settings#state"
  | "settings#planner"
  | "settings#formulas"
  | "settings#ui";

export type WorkbookPayload = {
  tabs?: Partial<Record<string, unknown>>;
  settings?: Partial<Record<string, unknown>>;
};

type WorkbookItem = {
  workspaceId: string;
  entityKey: WorkbookEntityKey;
  data: unknown;
  updatedAt: string;
};

const ENTITY_KEYS: WorkbookEntityKey[] = [
  "tab#investments",
  "tab#tickers",
  "tab#categories",
  "tab#taxTreatment",
  "tab#accounts",
  "tab#accountTaxType",
  "tab#investmentType",
  "settings#federal",
  "settings#state",
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
  investmentType: "tab#investmentType",
  federalSettings: "settings#federal",
  stateSettings: "settings#state",
  plannerSettings: "settings#planner",
  formulaSettings: "settings#formulas",
  uiSettings: "settings#ui",
};

const ENTITY_TO_RESPONSE_KEY: Record<WorkbookEntityKey, { group: "tabs" | "settings"; key: string }> = {
  "tab#investments": { group: "tabs", key: "investments" },
  "tab#tickers": { group: "tabs", key: "tickers" },
  "tab#categories": { group: "tabs", key: "categories" },
  "tab#taxTreatment": { group: "tabs", key: "taxTreatment" },
  "tab#accounts": { group: "tabs", key: "accounts" },
  "tab#accountTaxType": { group: "tabs", key: "accountTaxType" },
  "tab#investmentType": { group: "tabs", key: "investmentType" },
  "settings#federal": { group: "settings", key: "federal" },
  "settings#state": { group: "settings", key: "state" },
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

export class WorkbookStore {
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor() {
    this.tableName = getRequiredEnv("WORKBOOK_TABLE_NAME");
    const baseClient = new DynamoDBClient({});
    this.client = DynamoDBDocumentClient.from(baseClient, {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    });
  }

  async getWorkspace(workspaceId: string) {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: "workspaceId = :workspaceId",
        ExpressionAttributeValues: {
          ":workspaceId": workspaceId,
        },
      })
    );

    const tabs: Record<string, unknown> = {};
    const settings: Record<string, unknown> = {};
    let updatedAt: string | null = null;

    for (const rawItem of response.Items ?? []) {
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
    };
  }

  async getTab(workspaceId: string, tabName: string) {
    const entityKey = toEntityKey(tabName);
    if (!entityKey) {
      throw new Error(`Unsupported workbook tab: ${tabName}`);
    }

    const workspace = await this.getWorkspace(workspaceId);
    const mapping = ENTITY_TO_RESPONSE_KEY[entityKey];
    const data =
      mapping.group === "tabs"
        ? workspace.tabs[mapping.key]
        : workspace.settings[mapping.key];

    return {
      workspaceId,
      tab: tabName,
      data: data ?? null,
      updatedAt: workspace.updatedAt,
    };
  }

  async putTab(workspaceId: string, tabName: string, data: unknown) {
    const entityKey = toEntityKey(tabName);
    if (!entityKey) {
      throw new Error(`Unsupported workbook tab: ${tabName}`);
    }

    const updatedAt = toNowIso();
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          workspaceId,
          entityKey,
          data,
          updatedAt,
        },
      })
    );

    return { workspaceId, tab: tabName, updatedAt };
  }

  async saveWorkspace(workspaceId: string, payload: WorkbookPayload) {
    const updatedAt = toNowIso();
    const items: WorkbookItem[] = [];

    for (const key of ENTITY_KEYS) {
      const mapping = ENTITY_TO_RESPONSE_KEY[key];
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
      return { workspaceId, updatedAt, savedKeys: [] as string[] };
    }

    await this.client.send(
      new BatchWriteCommand({
        RequestItems: {
          [this.tableName]: items.map((item) => ({
            PutRequest: { Item: item },
          })),
        },
      })
    );

    return {
      workspaceId,
      updatedAt,
      savedKeys: items.map((item) => item.entityKey),
    };
  }
}
