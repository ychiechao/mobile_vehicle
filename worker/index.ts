/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import {
  getFirebaseAuthProxyDomain,
  getFirebaseRuntimeSettings,
  type FirebaseRuntimeEnv,
} from "../app/firebase-runtime";

interface Env extends FirebaseRuntimeEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    const firebaseResponse = await handleFirebaseReservedPath(request, env);
    if (firebaseResponse) {
      return firebaseResponse;
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

async function handleFirebaseReservedPath(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/__/firebase/init.json") {
    return serveFirebaseInitConfig(request, env);
  }

  if (url.pathname === "/__/auth" || url.pathname.startsWith("/__/auth/")) {
    return proxyFirebaseAuthRequest(request, env);
  }

  return null;
}

function serveFirebaseInitConfig(request: Request, env: Env) {
  const settings = getFirebaseRuntimeSettings(request, env);

  if (!settings.configured || !settings.config) {
    return Response.json(
      { error: "Firebase runtime config is not configured." },
      { status: 503 },
    );
  }

  return Response.json(settings.config, {
    headers: {
      "cache-control": "no-store, no-cache, max-age=0",
    },
  });
}

async function proxyFirebaseAuthRequest(request: Request, env: Env) {
  const firebaseAuthDomain = getFirebaseAuthProxyDomain(env);

  if (!firebaseAuthDomain) {
    return Response.json(
      { error: "Firebase auth proxy target is not configured." },
      { status: 503 },
    );
  }

  const sourceUrl = new URL(request.url);
  const targetUrl = new URL(request.url);
  targetUrl.protocol = "https:";
  targetUrl.host = firebaseAuthDomain;
  targetUrl.username = "";
  targetUrl.password = "";

  const headers = new Headers(request.headers);
  headers.delete("host");

  const response = await fetch(targetUrl, {
    body:
      request.method === "GET" || request.method === "HEAD"
        ? undefined
        : await request.arrayBuffer(),
    headers,
    method: request.method,
    redirect: "manual",
  });
  const responseHeaders = new Headers(response.headers);
  const location = responseHeaders.get("location");

  if (location) {
    responseHeaders.set(
      "location",
      location.replace(`https://${firebaseAuthDomain}`, sourceUrl.origin),
    );
  }

  responseHeaders.set("cache-control", "no-store, no-cache, max-age=0");

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
