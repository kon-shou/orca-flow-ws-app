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
    latest += 1;
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
