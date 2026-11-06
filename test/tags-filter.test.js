import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createServer } from "../server.js";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

const post = (body) =>
  fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const put = (id, body) =>
  fetch(`${base}/api/todos/${id}/tags`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const list = async (query = "") => {
  const res = await fetch(`${base}/api/todos${query}`);
  return { res, body: await res.json() };
};
const titles = (body) => body.todos.map((t) => t.title);

let ids = {};

test("条件なしは全部と全部の件数を返す", async () => {
  assert.deepEqual((await list()).body, { todos: [], total: 0 });
  const ra = await post({ title: "Buy Milk", tags: ["Home", "home", " Shop "] });
  assert.equal(ra.status, 201);
  const ta = await ra.json();
  assert.deepEqual(ta.tags, ["home", "shop"]);
  ids.a = ta.id;
  ids.b = (await (await post({ title: "report", tags: ["work"] })).json()).id;
  const rc = await post({ title: "plain" });
  assert.equal(rc.status, 201);
  const tc = await rc.json();
  assert.equal(tc.tags, undefined);
  ids.c = tc.id;
  await fetch(`${base}/api/todos/${ids.b}/done`, { method: "POST" });
  const { res, body } = await list();
  assert.equal(res.status, 200);
  assert.equal(body.todos.length, 3);
  assert.equal(body.total, 3);
});

test("tags 付きの追加は整えたタグを持ち、tags なしはタグなし", async () => {
  const { body } = await list();
  assert.deepEqual(body.todos[0].tags, ["home", "shop"]);
  assert.equal(body.todos[2].tags, undefined);
});

test("外れた tags の追加は 400", async () => {
  const res = await post({ title: "x", tags: ["a".repeat(21)] });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /20文字/);
  const bad = await post({ title: "x", tags: "home" });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /文字の並び/);
});

test("期限が正しくない追加は 400", async () => {
  const res = await post({ title: "x", dueDate: "2020-13-45" });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /期限/);
});

test("status・tag・text で絞り、total は変わらない", async () => {
  let r = await list("?status=open");
  assert.deepEqual(titles(r.body), ["Buy Milk", "plain"]);
  assert.equal(r.body.total, 3);
  r = await list("?status=done");
  assert.deepEqual(titles(r.body), ["report"]);
  r = await list("?status=all");
  assert.equal(r.body.todos.length, 3);
  r = await list("?tag=work");
  assert.deepEqual(titles(r.body), ["report"]);
  assert.equal(r.body.total, 3);
  r = await list("?text=PLA");
  assert.deepEqual(titles(r.body), ["plain"]);
});

test("tag は整えてから比べ、text は半角の大小を区別しない", async () => {
  assert.deepEqual(titles((await list("?tag=HOME")).body), ["Buy Milk"]);
  assert.deepEqual(titles((await list("?text=buy%20MILK")).body), ["Buy Milk"]);
});

test("3つを同時に付けるとすべてを満たす項目だけ", async () => {
  assert.deepEqual(titles((await list("?status=open&tag=shop&text=milk")).body), ["Buy Milk"]);
  assert.deepEqual((await list("?status=done&tag=shop&text=milk")).body.todos, []);
});

test("知らない名前は無視する", async () => {
  const { res, body } = await list("?foo=1");
  assert.equal(res.status, 200);
  assert.equal(body.todos.length, 3);
});

test("2回付けると 400", async () => {
  for (const q of ["?status=open&status=done", "?tag=a&tag=b", "?text=a&text=b"]) {
    const { res, body } = await list(q);
    assert.equal(res.status, 400, q);
    assert.ok(body.error, q);
  }
});

test("理由が2つなら「。」でつなぐ", async () => {
  const { res, body } = await list(`?status=xyz&tag=${"a".repeat(21)}`);
  assert.equal(res.status, 400);
  assert.equal(body.error.split("。").length, 2);
  assert.match(body.error, /状態/);
  assert.match(body.error, /20文字/);
});

test("タグの付け直し", async () => {
  const res = await put(ids.c, { tags: ["New", "x"] });
  assert.equal(res.status, 200);
  assert.deepEqual((await res.json()).tags, ["new", "x"]);
  assert.deepEqual(titles((await list("?tag=new")).body), ["plain"]);
  const cleared = await put(ids.c, { tags: [] });
  assert.equal(cleared.status, 200);
  assert.equal((await cleared.json()).tags, undefined);
});

test("付け直しの誤り", async () => {
  assert.equal((await put(999, { tags: [] })).status, 404);
  for (const [body, reason] of [
    [{}, /文字の並び/],
    [{ tags: "a" }, /文字の並び/],
    [{ tags: ["a".repeat(21)] }, /20文字/],
  ]) {
    const res = await put(ids.c, body);
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.match((await res.json()).error, reason);
  }
});

test("/todo-core.js は共通の入口のファイルを返す", async () => {
  const res = await fetch(`${base}/todo-core.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
  const file = fileURLToPath(import.meta.resolve("todo-core"));
  assert.equal(await res.text(), readFileSync(file, "utf8"));
});

test("画面の HTML に必要な部品がある", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /import\s*\{/);
  assert.match(html, /<form id="add">[\s\S]*name="tags"[\s\S]*<\/form>/);
  assert.match(html, /id="f-status"/);
  assert.match(html, /id="f-tag"/);
  assert.match(html, /id="f-text"/);
  assert.match(html, /id="count"/);
});

test("画面のスクリプトが import する名前はすべて共通の公開名にある", async () => {
  const js = await (await fetch(`${base}/app.js`)).text();
  const all = [...js.matchAll(/import\s*\{([^}]*)\}\s*from\s*"([^"]*)"/g)];
  const fromCore = all.filter((m) => m[2] === "/todo-core.js");
  assert.ok(fromCore.length > 0);
  const core = await import("todo-core");
  for (const m of fromCore) {
    const names = m[1].split(",").map((n) => n.trim()).filter(Boolean);
    assert.ok(names.length > 0);
    for (const name of names) assert.ok(name in core, name);
  }
});
