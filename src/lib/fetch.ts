import { EnvHttpProxyAgent, fetch as undiciFetch, type Dispatcher } from "undici";

let proxyDispatcher: Dispatcher | undefined;

/** True when the environment asks for an HTTP(S) proxy (the usual sandbox / CI setup). */
export function proxyFromEnv(): string | undefined {
  return (
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    undefined
  );
}

/**
 * fetch that honours HTTPS_PROXY / HTTP_PROXY / NO_PROXY.
 *
 * Node's built-in fetch ignores those variables (unless NODE_USE_ENV_PROXY=1 on
 * newer Nodes), so inside sandboxes and CI every request died with the proxy's
 * own 403 — and we labelled it an "OpenMail API error". When a proxy is set we
 * route through undici's EnvHttpProxyAgent; otherwise we use the platform fetch
 * untouched so tests that stub `globalThis.fetch` keep working.
 */
export async function proxyAwareFetch(url: string, init?: RequestInit): Promise<Response> {
  const proxy = proxyFromEnv();
  if (!proxy) {
    return fetch(url, init);
  }
  proxyDispatcher ??= new EnvHttpProxyAgent();
  try {
    return (await undiciFetch(url, {
      ...(init as Parameters<typeof undiciFetch>[1]),
      dispatcher: proxyDispatcher,
    })) as unknown as Response;
  } catch (err) {
    // undici collapses everything into "fetch failed"; the useful part
    // (e.g. "Proxy response (403) !== 200 when HTTP Tunneling") is on `cause`.
    const cause = (err as { cause?: { message?: string } }).cause?.message?.replace(/\.$/, "");
    throw new Error(
      `Could not reach ${safeHost(url)} via proxy ${proxy}${cause ? `: ${cause}` : ""}. ` +
        "The request never got an OpenMail API response; check the proxy's allowlist / egress rules.",
      { cause: err },
    );
  }
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
