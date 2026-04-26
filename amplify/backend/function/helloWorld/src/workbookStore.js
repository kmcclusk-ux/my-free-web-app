"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbookStore = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ENTITY_KEYS = [
    "tab#investments",
    "tab#tickers",
    "tab#taxTreatment",
    "tab#accounts",
    "tab#accountTaxType",
    "tab#investmentType",
    "settings#federal",
    "settings#state",
    "settings#planner",
    "settings#ui",
];
const TAB_TO_ENTITY = {
    investments: "tab#investments",
    tickers: "tab#tickers",
    taxTreatment: "tab#taxTreatment",
    accounts: "tab#accounts",
    accountTaxType: "tab#accountTaxType",
    investmentType: "tab#investmentType",
    federalSettings: "settings#federal",
    stateSettings: "settings#state",
    plannerSettings: "settings#planner",
    uiSettings: "settings#ui",
};
const ENTITY_TO_RESPONSE_KEY = {
    "tab#investments": { group: "tabs", key: "investments" },
    "tab#tickers": { group: "tabs", key: "tickers" },
    "tab#taxTreatment": { group: "tabs", key: "taxTreatment" },
    "tab#accounts": { group: "tabs", key: "accounts" },
    "tab#accountTaxType": { group: "tabs", key: "accountTaxType" },
    "tab#investmentType": { group: "tabs", key: "investmentType" },
    "settings#federal": { group: "settings", key: "federal" },
    "settings#state": { group: "settings", key: "state" },
    "settings#planner": { group: "settings", key: "planner" },
    "settings#ui": { group: "settings", key: "ui" },
};
function getRequiredEnv(name) {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}
function toEntityKey(tabName) {
    return TAB_TO_ENTITY[tabName] ?? null;
}
function toNowIso() {
    return new Date().toISOString();
}
class WorkbookStore {
    constructor() {
        this.tableName = getRequiredEnv("WORKBOOK_TABLE_NAME");
        const baseClient = new client_dynamodb_1.DynamoDBClient({});
        this.client = lib_dynamodb_1.DynamoDBDocumentClient.from(baseClient, {
            marshallOptions: {
                removeUndefinedValues: true,
            },
        });
    }
    async getWorkspace(workspaceId) {
        const response = await this.client.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "workspaceId = :workspaceId",
            ExpressionAttributeValues: {
                ":workspaceId": workspaceId,
            },
        }));
        const tabs = {};
        const settings = {};
        let updatedAt = null;
        for (const rawItem of response.Items ?? []) {
            const item = rawItem;
            const mapping = ENTITY_TO_RESPONSE_KEY[item.entityKey];
            if (!mapping)
                continue;
            if (mapping.group === "tabs") {
                tabs[mapping.key] = item.data;
            }
            else {
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
    async getTab(workspaceId, tabName) {
        const entityKey = toEntityKey(tabName);
        if (!entityKey) {
            throw new Error(`Unsupported workbook tab: ${tabName}`);
        }
        const workspace = await this.getWorkspace(workspaceId);
        const mapping = ENTITY_TO_RESPONSE_KEY[entityKey];
        const data = mapping.group === "tabs"
            ? workspace.tabs[mapping.key]
            : workspace.settings[mapping.key];
        return {
            workspaceId,
            tab: tabName,
            data: data ?? null,
            updatedAt: workspace.updatedAt,
        };
    }
    async putTab(workspaceId, tabName, data) {
        const entityKey = toEntityKey(tabName);
        if (!entityKey) {
            throw new Error(`Unsupported workbook tab: ${tabName}`);
        }
        const updatedAt = toNowIso();
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                workspaceId,
                entityKey,
                data,
                updatedAt,
            },
        }));
        return { workspaceId, tab: tabName, updatedAt };
    }
    async saveWorkspace(workspaceId, payload) {
        const updatedAt = toNowIso();
        const items = [];
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
            return { workspaceId, updatedAt, savedKeys: [] };
        }
        await this.client.send(new lib_dynamodb_1.BatchWriteCommand({
            RequestItems: {
                [this.tableName]: items.map((item) => ({
                    PutRequest: { Item: item },
                })),
            },
        }));
        return {
            workspaceId,
            updatedAt,
            savedKeys: items.map((item) => item.entityKey),
        };
    }
}
exports.WorkbookStore = WorkbookStore;
