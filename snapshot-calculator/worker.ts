export default {
  async fetch(request: Request, env: { ASSETS: { fetch: (request: Request) => Promise<Response> } }) {
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
