type Env = {
  ASSETS: { fetch: (request: Request) => Promise<Response> };
  WAITLIST_WEBHOOK_URL?: string;
};

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function isEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

async function handleWaitlist(request: Request, env: Env) {
  if (request.method !== "POST") {
    return jsonResponse({ ok: false, message: "Use POST to join the waitlist." }, { status: 405 });
  }

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return jsonResponse({ ok: false, message: "Send a valid email address." }, { status: 400 });
  }

  if (!isEmail(data.email)) {
    return jsonResponse({ ok: false, message: "Enter a valid email address." }, { status: 400 });
  }

  if (!env.WAITLIST_WEBHOOK_URL) {
    return jsonResponse({ ok: false, message: "The waitlist is almost ready. Please try again soon." }, { status: 503 });
  }

  const payload = {
    email: String(data.email).trim(),
    source: typeof data.source === "string" ? data.source : "snapshot-calculator",
    pageUrl: typeof data.pageUrl === "string" ? data.pageUrl : "",
    userAgent: request.headers.get("user-agent") || "",
    submittedAt: new Date().toISOString(),
  };

  const response = await fetch(env.WAITLIST_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    redirect: "follow",
  });

  if (!response.ok) {
    return jsonResponse({ ok: false, message: "Could not save the email. Please try again." }, { status: 502 });
  }

  return jsonResponse({ ok: true });
}

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/waitlist") {
      return handleWaitlist(request, env);
    }

    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;

    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
    headers.set("Pragma", "no-cache");
    headers.set("Expires", "0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};
