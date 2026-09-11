"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestLimitError = void 0;
exports.analyticsRoute = analyticsRoute;
exports.analyticsReferrer = analyticsReferrer;
exports.validateRequestSize = validateRequestSize;
exports.validateRequestStructure = validateRequestStructure;
const ANALYTICS_ROUTES = new Set([
    '/', '/index.html', '/app', '/app/', '/admin.html', '/privacy.html', '/terms.html',
    '/calculator.html', '/after-tax-calculator.html', '/after-tax-investment-calculator.html',
    '/after-tax-yield-calculator.html', '/federal-state-local-tax-calculator.html',
    '/roth-vs-taxable-calculator.html', '/taxable-income-calculator.html',
    '/snapshot-calculator', '/snapshot-calculator/', '/api/hello', '/hello',
]);
function analyticsRoute(value) {
    if (typeof value !== 'string' || value.length > 8192)
        return '/other';
    try {
        const url = new URL(value, 'https://aftertaxus.com');
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return '/other';
        const path = url.pathname;
        if (ANALYTICS_ROUTES.has(path))
            return path;
        if (/^\/mcp(?:\/|$)/.test(path))
            return '/mcp';
        if (/^\/report(?:s)?\//.test(path))
            return '/report';
        if (/^\/app\//.test(path))
            return '/app/';
        return '/other';
    }
    catch {
        return '/other';
    }
}
function analyticsReferrer(value) {
    if (typeof value !== 'string' || value.length > 8192)
        return undefined;
    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' && url.protocol !== 'http:')
            return undefined;
        return url.origin;
    }
    catch {
        return undefined;
    }
}
class RequestLimitError extends Error {
    constructor() {
        super(...arguments);
        this.statusCode = 413;
    }
}
exports.RequestLimitError = RequestLimitError;
function validateRequestSize(body, base64Encoded = false) {
    if (!body)
        return;
    const maximumBytes = 1024 * 1024;
    if (body.length > (base64Encoded ? Math.ceil(maximumBytes / 3) * 4 : maximumBytes)) {
        throw new RequestLimitError('Request exceeds the 1 MiB application limit.');
    }
    const bytes = base64Encoded ? Buffer.from(body, 'base64').length : Buffer.byteLength(body, 'utf8');
    if (bytes > maximumBytes)
        throw new RequestLimitError('Request exceeds the 1 MiB application limit.');
}
function validateRequestStructure(body) {
    const pending = [{ value: body, depth: 0 }];
    let entries = 0;
    while (pending.length) {
        const { value, depth } = pending.pop();
        entries += 1;
        if (depth > 16 || entries > 50000)
            throw new RequestLimitError('Request structure exceeds application limits.');
        if (!value || typeof value !== 'object')
            continue;
        const values = Object.values(value);
        if (values.length > 5000)
            throw new RequestLimitError('A request collection cannot contain more than 5000 entries.');
        for (const child of values)
            pending.push({ value: child, depth: depth + 1 });
    }
}
