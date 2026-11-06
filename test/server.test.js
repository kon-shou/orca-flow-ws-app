import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";
import { readFileSync } from "node:fs";
import { MAX_TITLE_LENGTH } from "todo-core";

let server;
let base;

before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  base = `http://localhost:${server.address().port}`;
});

after(() => server.close());

test("画面1枚を返す", async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<h1>Todo<\/h1>/);
});

test("追加して一覧に出て、完了にできる", async () => {
  const created = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "牛乳を買う" }),
  });
  assert.equal(created.status, 201);
  const todo = await created.json();
  assert.equal(todo.title, "牛乳を買う");

  const list = (await (await fetch(`${base}/api/todos`)).json()).todos;
  assert.deepEqual(
    list.map((t) => t.title),
    ["牛乳を買う"],
  );

  const done = await fetch(`${base}/api/todos/${todo.id}/done`, { method: "POST" });
  assert.equal(done.status, 200);
  assert.equal((await done.json()).done, true);
});

test("空の題は共通の確かめで断る", async () => {
  const res = await fetch(`${base}/api/todos`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "" }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /題が空です/);
});

test("ない項目の完了は404", async () => {
  const res = await fetch(`${base}/api/todos/999/done`, { method: "POST" });
  assert.equal(res.status, 404);
});

test("/app.js が配られ、HTML から読まれる", async () => {
  const res = await fetch(`${base}/app.js`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /javascript/);
  const file = new URL("../public/app.js", import.meta.url);
  assert.equal(await res.text(), readFileSync(file, "utf8"));
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, /<script type="module" src="\/app\.js"><\/script>/);
  assert.doesNotMatch(html, /import\s*\{/);
});

test("題の入力に共通の MAX_TITLE_LENGTH が maxlength で入る", async () => {
  const html = await (await fetch(`${base}/`)).text();
  assert.match(html, new RegExp(`name="title" maxlength="${MAX_TITLE_LENGTH}"`));
});

async function withClock(initial, fn) {
  let current = initial;
  const s = createServer({ now: () => current });
  await new Promise((resolve) => s.listen(0, resolve));
  const url = `http://localhost:${s.address().port}`;
  const post = (body) =>
    fetch(`${url}/api/todos`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  try {
    await fn({ post, set: (d) => (current = d) });
  } finally {
    s.close();
  }
}

test("渡した時刻で作られ、要求ごとに呼ばれる", async () => {
  const t1 = new Date("2030-01-01T00:00:00.000Z");
  const t2 = new Date("2030-01-02T12:30:00.000Z");
  await withClock(t1, async ({ post, set }) => {
    assert.equal((await (await post({ title: "a" })).json()).createdAt, t1.toISOString());
    set(t2);
    assert.equal((await (await post({ title: "b" })).json()).createdAt, t2.toISOString());
  });
});

test("日本の日付でその日より前の期限は400、同じ日は201", async () => {
  // 日本時間 2030-01-02 09:00
  await withClock(new Date("2030-01-02T00:00:00.000Z"), async ({ post }) => {
    const past = await post({ title: "x", dueDate: "2030-01-01" });
    assert.equal(past.status, 400);
    assert.match((await past.json()).error, /今日以降/);
    assert.equal((await post({ title: "y", dueDate: "2030-01-02" })).status, 201);
  });
});
