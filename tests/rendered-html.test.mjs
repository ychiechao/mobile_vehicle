import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, {
      headers: { accept: "text/html" },
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
  assert.match(html, /掃描推車 QR Code 後快速報修/);
  assert.match(html, /新增報修單/);
  assert.match(html, /報修進度/);
  assert.match(html, /可借用推車與健康度/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders the school admin page with QR management", async () => {
  const response = await render("/school-admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /各校系統管理者頁面/);
  assert.match(html, /學校管理者登入/);
  assert.match(html, /Firebase Auth/);
  assert.match(html, /學校端申請使用/);
  assert.match(html, /管理者信箱/);
  assert.match(html, /密碼/);
  assert.match(html, /學校設備 Google Sheet 網址/);
  assert.match(html, /送出申請/);
  assert.match(html, /新增推車並自動產生 QR Code/);
  assert.match(html, /最新 QR Code/);
  assert.match(html, /網址載入中/);
  assert.match(html, /推車管理清單/);
  assert.match(html, /編輯、刪除與調整推車狀態/);
  assert.match(html, /編輯推車/);
  assert.match(html, /刪除推車/);
  assert.match(html, /下載 QR Code/);
  assert.match(html, /推車狀態/);
  assert.match(html, /關聯案件/);
  assert.match(html, /刪除推車會同步移除案件看板中的關聯案件/);
  assert.match(html, /案件看板/);
  assert.match(html, /等待派工確認/);
  assert.match(html, /等待零件或廠商/);
  assert.match(html, /推車健康度/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("server-renders the super admin page", async () => {
  const response = await render("/super-admin");
  assert.equal(response.status, 200);

  const html = await response.text();
  assert.match(html, /超管頁面/);
  assert.match(html, /Google Sheet 主資料庫與帳號啟用/);
  assert.match(html, /超管 Firebase 登入/);
  assert.match(html, /超管白名單/);
  assert.match(html, /ychao@tmail\.ilc\.edu\.tw/);
  assert.match(html, /學校申請審核/);
  assert.match(html, /啟用帳號/);
  assert.match(html, /退回補件/);
  assert.match(html, /開啟設備表/);
  assert.match(html, /開啟主資料庫/);
  assert.match(html, /各校系統狀態/);
  assert.match(html, /權限與啟用狀態/);
  assert.match(html, /跨校案件看板/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
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
