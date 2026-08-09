"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkbookStore = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ENTITY_KEYS = [
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
const TAB_TO_ENTITY = {
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
const ENTITY_TO_RESPONSE_KEY = {
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
function mcpTokenLookupWorkspaceId(tokenHash) {
    return `mcpToken#${tokenHash}`;
}
function mcpTokenUserWorkspaceId(ownerSub) {
    return `mcpTokens#user#${ownerSub}`;
}
function publicReportLookupWorkspaceId(slug) {
    return `publicReport#${slug}`;
}
function publicReportUserWorkspaceId(ownerSub) {
    return `publicReports#user#${ownerSub}`;
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
        if (!mapping) {
            throw new Error(`Unsupported workbook tab: ${tabName}`);
        }
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
            if (!mapping)
                continue;
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
    async putMcpToken(record) {
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                workspaceId: mcpTokenLookupWorkspaceId(record.tokenHash),
                entityKey: "auth#mcpToken",
                data: record,
                updatedAt: record.createdAt,
            },
        }));
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                workspaceId: mcpTokenUserWorkspaceId(record.ownerSub),
                entityKey: `token#${record.tokenId}`,
                data: record,
                updatedAt: record.createdAt,
            },
        }));
        return {
            tokenId: record.tokenId,
            workspaceId: record.workspaceId,
            createdAt: record.createdAt,
            label: record.label,
        };
    }
    async getMcpToken(tokenHash) {
        const response = await this.client.send(new lib_dynamodb_1.GetCommand({
            TableName: this.tableName,
            Key: {
                workspaceId: mcpTokenLookupWorkspaceId(tokenHash),
                entityKey: "auth#mcpToken",
            },
        }));
        const item = response.Item;
        return item?.data && typeof item.data === "object" ? item.data : null;
    }
    async listMcpTokensForUser(ownerSub) {
        const response = await this.client.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "workspaceId = :workspaceId",
            ExpressionAttributeValues: {
                ":workspaceId": mcpTokenUserWorkspaceId(ownerSub),
            },
        }));
        return (response.Items ?? [])
            .map((rawItem) => rawItem.data)
            .filter((data) => Boolean(data) && typeof data === "object");
    }
    async revokeMcpTokenForUser(ownerSub, tokenId) {
        const tokens = await this.listMcpTokensForUser(ownerSub);
        const token = tokens.find((record) => record.tokenId === tokenId);
        if (!token)
            return null;
        const revoked = {
            ...token,
            revokedAt: token.revokedAt || toNowIso(),
        };
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                workspaceId: mcpTokenLookupWorkspaceId(revoked.tokenHash),
                entityKey: "auth#mcpToken",
                data: revoked,
                updatedAt: revoked.revokedAt,
            },
        }));
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                workspaceId: mcpTokenUserWorkspaceId(ownerSub),
                entityKey: `token#${revoked.tokenId}`,
                data: revoked,
                updatedAt: revoked.revokedAt,
            },
        }));
        return {
            tokenId: revoked.tokenId,
            workspaceId: revoked.workspaceId,
            revokedAt: revoked.revokedAt,
        };
    }
    async getPublicReport(slug) {
        const readLookup = async (lookupSlug) => {
            const response = await this.client.send(new lib_dynamodb_1.GetCommand({
                TableName: this.tableName,
                Key: {
                    workspaceId: publicReportLookupWorkspaceId(lookupSlug),
                    entityKey: "report#public",
                },
            }));
            return response.Item?.data;
        };
        const first = await readLookup(slug);
        if (!first)
            return null;
        if ("redirectSlug" in first) {
            const redirected = await readLookup(first.redirectSlug);
            return redirected && !("redirectSlug" in redirected) ? redirected : null;
        }
        return first;
    }
    async listPublicReportsForUser(ownerSub) {
        const response = await this.client.send(new lib_dynamodb_1.QueryCommand({
            TableName: this.tableName,
            KeyConditionExpression: "workspaceId = :workspaceId",
            ExpressionAttributeValues: {
                ":workspaceId": publicReportUserWorkspaceId(ownerSub),
            },
        }));
        return (response.Items ?? [])
            .map((item) => item.data)
            .filter((record) => Boolean(record?.reportId && record?.payload))
            .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    }
    async putPublicReport(record, previousSlug) {
        const ownerKey = {
            workspaceId: publicReportUserWorkspaceId(record.ownerSub),
            entityKey: `report#${record.reportId}`,
        };
        const existingResponse = await this.client.send(new lib_dynamodb_1.GetCommand({ TableName: this.tableName, Key: ownerKey }));
        const existing = existingResponse.Item?.data;
        const savedRecord = {
            ...record,
            createdAt: existing?.createdAt || record.createdAt,
        };
        await this.client.send(new lib_dynamodb_1.PutCommand({
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
        }));
        await this.client.send(new lib_dynamodb_1.PutCommand({
            TableName: this.tableName,
            Item: {
                ...ownerKey,
                reportId: savedRecord.reportId,
                ownerSub: savedRecord.ownerSub,
                data: savedRecord,
                updatedAt: savedRecord.updatedAt,
            },
        }));
        if (previousSlug && previousSlug !== savedRecord.slug) {
            const alias = {
                reportId: savedRecord.reportId,
                slug: previousSlug,
                redirectSlug: savedRecord.slug,
                ownerSub: savedRecord.ownerSub,
                createdAt: savedRecord.createdAt,
                updatedAt: savedRecord.updatedAt,
            };
            await this.client.send(new lib_dynamodb_1.PutCommand({
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
            }));
        }
        return savedRecord;
    }
}
exports.WorkbookStore = WorkbookStore;
