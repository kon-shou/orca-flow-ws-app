import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.js";

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
