type FirebaseRuntimeEnv = Partial<Record<"FIREBASE_PROJECT_ID", string>>;

type FirebaseTokenHeader = {
  alg?: unknown;
  kid?: unknown;
};

type FirebaseTokenPayload = {
  aud?: unknown;
  auth_time?: unknown;
  email?: unknown;
  exp?: unknown;
  iat?: unknown;
  iss?: unknown;
  sub?: unknown;
};

type FirebaseJwksResponse = {
  keys?: unknown;
};

export type VerifiedFirebaseUser = {
  email: string;
  uid: string;
};

export class FirebaseAuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "FirebaseAuthError";
    this.status = status;
  }
}

const BEARER_PREFIX = "Bearer ";
const FIREBASE_JWKS_URL =
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";

export async function requireFirebaseUser(
  request: Request,
  env?: FirebaseRuntimeEnv,
): Promise<VerifiedFirebaseUser> {
  const token = getBearerToken(request);
  const projectId = getFirebaseProjectId(env);

  if (!projectId) {
    throw new FirebaseAuthError(503, "Firebase 專案 ID 尚未設定。");
  }

  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new FirebaseAuthError(401, "登入權杖格式不正確，請重新登入。");
  }

  const header = decodeJwtSegment<FirebaseTokenHeader>(encodedHeader);
  const payload = decodeJwtSegment<FirebaseTokenPayload>(encodedPayload);
  assertFirebaseClaims(header, payload, projectId);

  const jwk = await fetchFirebaseJwk(String(header.kid));
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    base64UrlToBytes(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );

  if (!verified) {
    throw new FirebaseAuthError(401, "登入權杖驗證失敗，請重新登入。");
  }

  return {
    email: typeof payload.email === "string" ? payload.email : "",
    uid: String(payload.sub),
  };
}

function getBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith(BEARER_PREFIX)) {
    throw new FirebaseAuthError(401, "請先使用 Google 帳號登入。");
  }

  const token = authorization.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    throw new FirebaseAuthError(401, "請先使用 Google 帳號登入。");
  }

  return token;
}

function getFirebaseProjectId(env?: FirebaseRuntimeEnv) {
  return (env?.FIREBASE_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID ?? "")
    .trim();
}

function assertFirebaseClaims(
  header: FirebaseTokenHeader,
  payload: FirebaseTokenPayload,
  projectId: string,
) {
  const now = Math.floor(Date.now() / 1000);

  if (header.alg !== "RS256" || typeof header.kid !== "string") {
    throw new FirebaseAuthError(401, "登入權杖標頭不正確，請重新登入。");
  }

  if (payload.aud !== projectId) {
    throw new FirebaseAuthError(401, "登入權杖專案不符合目前系統。");
  }

  if (payload.iss !== `https://securetoken.google.com/${projectId}`) {
    throw new FirebaseAuthError(401, "登入權杖來源不正確。");
  }

  if (typeof payload.sub !== "string" || !payload.sub.trim()) {
    throw new FirebaseAuthError(401, "登入權杖缺少使用者識別。");
  }

  if (typeof payload.exp !== "number" || payload.exp <= now) {
    throw new FirebaseAuthError(401, "登入已過期，請重新登入。");
  }

  if (typeof payload.iat !== "number" || payload.iat > now) {
    throw new FirebaseAuthError(401, "登入權杖時間不正確。");
  }

  if (typeof payload.auth_time === "number" && payload.auth_time > now) {
    throw new FirebaseAuthError(401, "登入驗證時間不正確。");
  }
}

async function fetchFirebaseJwk(kid: string) {
  const response = await fetch(FIREBASE_JWKS_URL, {
    headers: { accept: "application/json" },
  });

  if (!response.ok) {
    throw new FirebaseAuthError(503, "Firebase 公開金鑰暫時無法取得。");
  }

  const payload = (await response.json()) as FirebaseJwksResponse;
  const keys = Array.isArray(payload.keys) ? payload.keys : [];
  const jwk = keys.find((key): key is JsonWebKey => {
    return (
      Boolean(key) &&
      typeof key === "object" &&
      "kid" in key &&
      key.kid === kid
    );
  });

  if (!jwk) {
    throw new FirebaseAuthError(401, "登入權杖金鑰已更新，請重新登入。");
  }

  return jwk;
}

function decodeJwtSegment<T>(segment: string): T {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlToBytes(segment))) as T;
  } catch {
    throw new FirebaseAuthError(401, "登入權杖無法解析，請重新登入。");
  }
}

function base64UrlToBytes(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(
    base64.length + ((4 - (base64.length % 4)) % 4),
    "=",
  );
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
