// Node の標準の http だけで動く Todo の画面1枚と JSON の API。
import { createServer as createHttpServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  completeTodo,
  createTodo,
  MAX_TITLE_LENGTH,
  matchesFilter,
  parseFilter,
  setTodoTags,
} from "todo-core";

const appSource = readFileSync(new URL("./public/app.js", import.meta.url), "utf8");
const coreSource = readFileSync(fileURLToPath(import.meta.resolve("todo-core")), "utf8");

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>Todo</title>
<style>
  body { font-family: sans-serif; max-width: 32rem; margin: 2rem auto; }
  li.done span { text-decoration: line-through; color: #888; }
  #error, #filter-error, .reason { color: #c00; }
  button.tag { font-size: 0.8rem; }
</style>
</head>
<body>
<h1>Todo</h1>
<form id="add">
  <input name="title" maxlength="${MAX_TITLE_LENGTH}" placeholder="やること" required>
  <input name="tags" id="add-tags" placeholder="タグ（カンマ区切り）">
  <button>追加</button>
</form>
<p id="error"></p>
<div id="filter">
  <select id="f-status">
    <option value="all">すべて</option>
    <option value="open">未完了</option>
    <option value="done">済み</option>
  </select>
  <input id="f-tag" placeholder="タグ">
  <input id="f-text" placeholder="題の文字">
  <span id="count"></span>
</div>
<p id="filter-error"></p>
<ul id="list"></ul>
<script type="module" src="/app.js"></script>
</body>
</html>`;

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  let text = "";
  for await (const chunk of req) text += chunk;
  return text === "" ? {} : JSON.parse(text);
}

export function createServer({ now = () => new Date() } = {}) {
  const todos = [];
  let nextId = 1;
  return createHttpServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(page);
        return;
      }
      if (req.method === "GET" && url.pathname === "/api/todos") {
        const reasons = [];
        const raw = {};
        for (const name of ["status", "tag", "text"]) {
          const values = url.searchParams.getAll(name);
          if (values.length > 1) reasons.push(name + " は1回だけ指定してください");
          if (values.length > 0) raw[name] = values[0];
        }
        const parsed = parseFilter(raw);
        reasons.push(...parsed.problems);
        if (reasons.length > 0) {
          sendJson(res, 400, { error: reasons.join("。") });
          return;
        }
        sendJson(res, 200, {
          todos: todos.filter((todo) => matchesFilter(todo, parsed.filter)),
          total: todos.length,
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/todo-core.js") {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(coreSource);
        return;
      }
      if (req.method === "GET" && url.pathname === "/app.js") {
        res.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
        res.end(appSource);
        return;
      }
      if (req.method === "POST" && url.pathname === "/api/todos") {
        const input = await readJson(req);
        let todo;
        try {
          todo = createTodo(input, { id: nextId, now: now() });
        } catch (error) {
          sendJson(res, 400, { error: error.message });
          return;
        }
        nextId += 1;
        todos.push(todo);
        sendJson(res, 201, todo);
        return;
      }
      const done = url.pathname.match(/^\/api\/todos\/(\d+)\/done$/);
      if (req.method === "POST" && done) {
        const index = todos.findIndex((todo) => todo.id === Number(done[1]));
        if (index === -1) {
          sendJson(res, 404, { error: "見つかりません" });
          return;
        }
        todos[index] = completeTodo(todos[index]);
        sendJson(res, 200, todos[index]);
        return;
      }
      const tagsRoute = url.pathname.match(/^\/api\/todos\/(\d+)\/tags$/);
      if (req.method === "PUT" && tagsRoute) {
        const index = todos.findIndex((todo) => todo.id === Number(tagsRoute[1]));
        if (index === -1) {
          sendJson(res, 404, { error: "見つかりません" });
          return;
        }
        const input = await readJson(req);
        try {
          todos[index] = setTodoTags(todos[index], input?.tags);
        } catch (error) {
          sendJson(res, 400, { error: error.message });
          return;
        }
        sendJson(res, 200, todos[index]);
        return;
      }
      sendJson(res, 404, { error: "見つかりません" });
    } catch {
      sendJson(res, 400, { error: "入力が読めません" });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3000);
  createServer().listen(port, () => {
    console.log(`http://localhost:${port}`);
  });
}
