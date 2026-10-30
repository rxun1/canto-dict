// Shared task renderer for dashboard/index.html and the plan docs.
// Exposes window.CantoRender. Styles live in render.css.
(() => {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const count = (tasks, status) => tasks.filter((t) => t.status === status).length;
  const pct = (tasks) => (tasks.length ? Math.round((100 * count(tasks, "done")) / tasks.length) : 0);

  function list(items, className) {
    return `<ul class="${className}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
  }

  function subtaskList(task) {
    const done = task.status === "done" ? task.subtasks.length : task.progress ?? 0;
    return `<ol class="subtasks">${task.subtasks
      .map((s, i) => `<li class="${i < done ? "checked" : ""}">${esc(s)}</li>`)
      .join("")}</ol>`;
  }

  function renderTask(task) {
    const hasDetail = task.subtasks || task.dod || task.test || task.files?.length;
    const steps = task.subtasks
      ? ` <small>${task.status === "done" ? task.subtasks.length : task.progress ?? 0}/${task.subtasks.length}</small>`
      : "";
    const head = `<span class="chip ${task.status}">${task.status}</span>
      <span class="task-title">${task.id ? `<b>${esc(task.id)}</b> ` : ""}${esc(task.title)}${steps}</span>`;
    if (!hasDetail) return `<div class="task">${head}</div>`;
    return `<details class="task" id="${esc(task.id ?? "")}">
      <summary>${head}</summary>
      <div class="task-body">
        ${task.subtasks ? `<h4>Subtasks</h4>${subtaskList(task)}` : ""}
        ${task.dod ? `<h4>Definition of done</h4>${list(task.dod, "dod")}` : ""}
        ${task.test ? `<h4>How to test</h4><pre class="test">${esc(task.test)}</pre>` : ""}
        ${task.files?.length ? `<h4>Files</h4>${list(task.files, "files")}` : ""}
      </div>
    </details>`;
  }

  function renderPhase(phase, { linkDoc = true } = {}) {
    const done = count(phase.tasks, "done");
    const doc = linkDoc && phase.doc ? ` <a href="${esc(phase.doc)}">open doc ↗</a>` : "";
    return `<section class="phase">
      <h2>${esc(phase.name)}${doc} <small>${done}/${phase.tasks.length} done</small></h2>
      <div class="bar"><div style="width:${pct(phase.tasks)}%"></div></div>
      ${phase.tasks.map(renderTask).join("")}
    </section>`;
  }

  window.CantoRender = { esc, count, pct, renderTask, renderPhase };
})();
