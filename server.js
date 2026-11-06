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
<script type="module">
import { parseFilter, parseTagInput, validateTags } from "/todo-core.js";
const list = document.getElementById("list");
const error = document.getElementById("error");
const filterError = document.getElementById("filter-error");
const count = document.getElementById("count");
const fStatus = document.getElementById("f-status");
const fTag = document.getElementById("f-tag");
const fText = document.getElementById("f-text");

function readFilter() {
  return { status: fStatus.value, tag: fTag.value, text: fText.value };
}

function toQuery(f) {
  const params = new URLSearchParams();
  if (f.status !== "all") params.set("status", f.status);
  if (f.tag.trim() !== "") params.set("tag", f.tag);
  if (f.text.trim() !== "") params.set("text", f.text);
  const query = params.toString();
  return query === "" ? "" : "?" + query;
}

function writeUrl() {
  history.replaceState(null, "", location.pathname + toQuery(readFilter()));
}

let latest = 0;
async function load() {
  latest += 1;
  const mine = latest;
  const res = await fetch("/api/todos" + toQuery(readFilter()));
  const data = await res.json();
  if (mine !== latest) return;
  if (!res.ok) {
    filterError.textContent = data.error;
    return;
  }
  filterError.textContent = "";
  count.textContent = data.todos.length + " / " + data.total + " 件";
  list.replaceChildren(...data.todos.map(renderTodo));
}

async function changed() {
  const parsed = parseFilter(readFilter());
  if (parsed.problems.length > 0) {
    filterError.textContent = parsed.problems.join("。");
    return;
  }
  writeUrl();
  await load();
}

function setTagFilter(tag) {
  fTag.value = tag;
  changed();
}

function renderTodo(todo) {
  const li = document.createElement("li");
  li.className = todo.done ? "done" : "";
  const span = document.createElement("span");
  span.textContent = todo.title;
  li.append(span);
  for (const tag of todo.tags ?? []) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag";
    chip.textContent = tag;
    chip.addEventListener("click", () => setTagFilter(tag));
    li.append(" ", chip);
  }
  if (!todo.done) {
    const button = document.createElement("button");
    button.textContent = "完了";
    button.addEventListener("click", async () => {
      await fetch("/api/todos/" + todo.id + "/done", { method: "POST" });
      load();
    });
    li.append(" ", button);
  }
  const edit = document.createElement("button");
  edit.type = "button";
  edit.textContent = "タグを直す";
  edit.addEventListener("click", () => openEditor(li, edit, todo));
  li.append(" ", edit);
  return li;
}

function openEditor(li, editButton, todo) {
  editButton.disabled = true;
  const box = document.createElement("span");
  const input = document.createElement("input");
  input.value = (todo.tags ?? []).join(", ");
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "保存";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "取り消し";
  const reason = document.createElement("span");
  reason.className = "reason";
  box.append(" ", input, " ", save, " ", cancel, " ", reason);
  li.append(box);
  cancel.addEventListener("click", () => {
    box.remove();
    editButton.disabled = false;
  });
  save.addEventListener("click", async () => {
    const tags = parseTagInput(input.value);
    const problems = validateTags(tags);
    if (problems.length > 0) {
      reason.textContent = problems.join("。");
      return;
    }
    const res = await fetch("/api/todos/" + todo.id + "/tags", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tags }),
    });
    if (res.ok) { load(); }
    else { reason.textContent = (await res.json()).error; }
  });
}

let timer = null;
fStatus.addEventListener("change", changed);
fTag.addEventListener("input", changed);
fText.addEventListener("input", () => {
  clearTimeout(timer);
  timer = setTimeout(changed, 300);
});

document.getElementById("add").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;
  const tags = parseTagInput(form.tags.value);
  const problems = validateTags(tags);
  if (problems.length > 0) {
    error.textContent = problems.join("。");
    return;
  }
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: form.title.value, tags }),
  });
  if (res.ok) { form.reset(); error.textContent = ""; load(); }
  else { error.textContent = (await res.json()).error; }
});

async function init() {
  const query = new URLSearchParams(location.search);
  const parsed = parseFilter({
    status: query.get("status") ?? undefined,
    tag: query.get("tag") ?? undefined,
    text: query.get("text") ?? undefined,
  });
  if (parsed.problems.length > 0) {
    fStatus.value = "all";
    fTag.value = "";
    fText.value = "";
    history.replaceState(null, "", location.pathname);
    await load();
    filterError.textContent = parsed.problems.join("。");
    return;
  }
  fStatus.value = parsed.filter.status;
  fTag.value = parsed.filter.tag ?? "";
  fText.value = parsed.filter.text ?? "";
  await load();
}
init();
</script>
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

export function createServer() {
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
      if (req.method === "POST" && url.pathname === "/api/todos") {
        const input = await readJson(req);
        let todo;
        try {
          todo = createTodo(input, { id: nextId });
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
