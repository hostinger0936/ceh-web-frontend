// build:2026-09-29
/**
 * CF Pages Function — proxy all /proxy/* requests to the backend.
 * BACKEND_URL and BACKEND_API_KEY are set as CF Pages env vars (no VITE_ prefix).
 * They are never visible in the browser bundle.
 * Auth is handled entirely by the backend — this proxy only injects the API key.
 */

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const backendUrl = env.BACKEND_URL;
  const apiKey = env.BACKEND_API_KEY;

  if (!backendUrl) {
    return new Response(
      JSON.stringify({ success: false, error: "BACKEND_URL not configured" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  // Strip /proxy prefix to get actual backend path
  const backendPath = url.pathname.replace(/^\/proxy/, "") || "/";
  const targetUrl = backendUrl.replace(/\/$/, "") + backendPath + url.search;

  // Copy request headers, inject API key, remove origin (server-to-server)
  const headers = new Headers(request.headers);
  if (apiKey) headers.set("x-api-key", apiKey);
  headers.delete("origin");
  headers.delete("host");

  const isBodyMethod = !["GET", "HEAD", "OPTIONS"].includes(request.method);

  try {
    const upstream = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: isBodyMethod ? request.body : undefined,
    });

    // Forward response with CORS header for the frontend origin
    const respHeaders = new Headers(upstream.headers);
    respHeaders.set("Access-Control-Allow-Origin", url.origin);
    respHeaders.set("Access-Control-Allow-Credentials", "true");

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: respHeaders,
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: "proxy_error", detail: String(err) }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function onRequestOptions(context) {
  const url = new URL(context.request.url);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": url.origin,
      "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,PATCH,OPTIONS",
      "Access-Control-Allow-Headers":
        "Content-Type,x-admin,x-device-id,x-session-id,x-master-bypass",
      "Access-Control-Max-Age": "86400",
    },
  });
}
