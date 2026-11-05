// Node の標準の http だけで動く Todo の画面1枚と JSON の API。
import { createServer as createHttpServer } from "node:http";
import { completeTodo, createTodo, MAX_TITLE_LENGTH } from "todo-core";

const page = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<title>Todo</title>
<style>
  body { font-family: sans-serif; max-width: 32rem; margin: 2rem auto; }
  li.done span { text-decoration: line-through; color: #888; }
  #error { color: #c00; }
</style>
</head>
<body>
<h1>Todo</h1>
<form id="add">
  <input name="title" maxlength="${MAX_TITLE_LENGTH}" placeholder="やること" required>
  <button>追加</button>
</form>
<p id="error"></p>
<ul id="list"></ul>
<script>
const list = document.getElementById("list");
const error = document.getElementById("error");
async function load() {
  const todos = await (await fetch("/api/todos")).json();
  list.replaceChildren(...todos.map((todo) => {
    const li = document.createElement("li");
    li.className = todo.done ? "done" : "";
    const span = document.createElement("span");
    span.textContent = todo.title;
    li.append(span);
    if (!todo.done) {
      const button = document.createElement("button");
      button.textContent = "完了";
      button.onclick = async () => {
        await fetch("/api/todos/" + todo.id + "/done", { method: "POST" });
        load();
      };
      li.append(" ", button);
    }
    return li;
  }));
}
document.getElementById("add").onsubmit = async (event) => {
  event.preventDefault();
  const form = event.target;
  const res = await fetch("/api/todos", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: form.title.value }),
  });
  if (res.ok) { form.reset(); error.textContent = ""; load(); }
  else { error.textContent = (await res.json()).error; }
};
load();
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
        sendJson(res, 200, todos);
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
