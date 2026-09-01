import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/", accept = "text/html") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the role hub", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>平板推車報修系統<\/title>/i);
  assert.match(html, /平板推車報修系統/);
  assert.match(html, /使用者頁面/);
  assert.match(html, /各校系統管理者頁面/);
  assert.match(html, /超管頁面/);
  assert.match(html, /QR Code 會導向使用者頁面/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
  assert.doesNotMatch(html, /react-loading-skeleton/);
});

test("server-renders the user page", async () => {
  const response = await render("/user");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /使用者頁面/);
  assert.match(html, /掃描 QR 後查看推車狀態與上傳紀錄/);
  assert.match(html, /使用者紀錄概況/);
  assert.match(html, /請掃描推車 QR Code/);
  assert.match(html, /目前尚未帶入推車資料/);
  assert.match(html, /等待推車資料/);
  assert.match(html, /掃 QR 後才能拍照撰寫紀錄/);
  assert.match(html, /借用老師流程/);
  assert.match(html, /管理者完成後重置/);
  assert.doesNotMatch(html, /新增報修單/);
  assert.doesNotMatch(html, /優先級/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders the school admin page locked until enabled", async () => {
  const response = await render("/school-admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /各校系統管理者頁面/);
  assert.match(html, /學校 Google 帳號驗證/);
  assert.match(html, /Firebase Auth/);
  assert.match(html, /使用 Google 驗證帳號/);
  assert.match(html, /學校端申請使用/);
  assert.match(html, /Google 驗證信箱/);
  assert.match(html, /請先使用 Google 驗證帳號/);
  assert.match(html, /學校設備 Google Sheet 網址/);
  assert.match(html, /Google 帳號驗證與 Sheet 網址都完成後/);
  assert.match(html, /送出申請/);
  assert.match(html, /請先完成 Google 帳號驗證/);
  assert.match(html, /管理畫面已鎖定/);
  assert.doesNotMatch(html, /登入信箱/);
  assert.doesNotMatch(html, /密碼/);
  assert.doesNotMatch(html, /新增推車並自動產生 QR Code/);
  assert.doesNotMatch(html, /最新 QR Code/);
  assert.doesNotMatch(html, /推車管理清單/);
  assert.doesNotMatch(html, /編輯推車/);
  assert.doesNotMatch(html, /刪除推車/);
  assert.doesNotMatch(html, /下載 QR Code/);
  assert.doesNotMatch(html, /案件看板/);
  assert.doesNotMatch(html, /推車健康度/);
  assert.doesNotMatch(html, /A 棟 3F|B 棟 2F|行政樓備用推車/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders the super admin page", async () => {
  const response = await render("/super-admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /超管頁面/);
  assert.match(html, /Google Sheet 主資料庫與帳號啟用/);
  assert.match(html, /超管 Firebase 登入/);
  assert.match(html, /使用 Google 登入/);
  assert.match(html, /超管白名單/);
  assert.match(html, /ychao@tmail\.ilc\.edu\.tw/);
  assert.match(html, /超管頁面需要先登入|超管功能需要登入後才能使用/);
  assert.doesNotMatch(html, /登入信箱/);
  assert.doesNotMatch(html, /密碼/);
  assert.doesNotMatch(html, /學校申請審核/);
  assert.doesNotMatch(html, /退回補件/);
  assert.doesNotMatch(html, /開啟設備表/);
  assert.doesNotMatch(html, /開啟主資料庫/);
  assert.doesNotMatch(html, /各校系統狀態/);
  assert.doesNotMatch(html, /權限與啟用狀態/);
  assert.doesNotMatch(html, /跨校案件看板/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("serves Firebase config from runtime environment", async () => {
  const previous = {
    FIREBASE_API_KEY: process.env.FIREBASE_API_KEY,
    FIREBASE_AUTH_DOMAIN: process.env.FIREBASE_AUTH_DOMAIN,
    FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID,
    SUPER_ADMIN_EMAIL: process.env.SUPER_ADMIN_EMAIL,
  };

  process.env.FIREBASE_API_KEY = "test-firebase-api-key";
  process.env.FIREBASE_AUTH_DOMAIN = "test-project.firebaseapp.com";
  process.env.FIREBASE_PROJECT_ID = "test-project";
  process.env.SUPER_ADMIN_EMAIL = "super-admin@example.edu.tw";

  try {
    const response = await render("/api/firebase-config", "application/json");
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.configured, true);
    assert.equal(payload.config.apiKey, "test-firebase-api-key");
    assert.equal(payload.config.authDomain, "test-project.firebaseapp.com");
    assert.equal(payload.config.projectId, "test-project");
    assert.equal(payload.superAdminEmail, "super-admin@example.edu.tw");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});

test("starts with no seeded school applications", async () => {
  const roleWorkspace = await readFile(
    new URL("../app/role-workspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(
    roleWorkspace,
    /const initialSchoolApplications: SchoolApplication\[\] = \[\];/,
  );
  assert.match(roleWorkspace, /const initialTickets: Ticket\[\] = \[\];/);
  assert.match(roleWorkspace, /const initialCarts: Cart\[\] = \[\];/);
  assert.match(
    roleWorkspace,
    /currentApplication\?\.status === "已啟用"[\s\S]*?return null;/,
  );
  assert.match(roleWorkspace, /目前尚無學校申請/);
  assert.match(roleWorkspace, /尚無已啟用學校/);
  assert.match(roleWorkspace, /尚無追蹤事項/);
  assert.doesNotMatch(roleWorkspace, /宜蘭示範學校|羅東國小|蘇澳高中|冬山國小/);
});

test("keeps starter preview code out of the app shell", async () => {
  const [page, roleWorkspace, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/role-workspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(page, /SkeletonPreview|_sites-preview|codex-preview/);
  assert.doesNotMatch(
    roleWorkspace,
    /SkeletonPreview|_sites-preview|codex-preview/,
  );
  assert.doesNotMatch(layout, /SkeletonPreview|_sites-preview|codex-preview/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../public/_sites-preview", templateRoot)));
});
