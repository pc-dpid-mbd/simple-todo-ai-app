const STORAGE_KEY = "simple-todo-ai-app/tasks";

const todoForm = document.getElementById("todo-form");
const todoInput = document.getElementById("todo-input");
const todoList = document.getElementById("todo-list");
const filterButtons = document.querySelectorAll(".filter-btn");
const taskSummary = document.getElementById("task-summary");
const assistantForm = document.getElementById("assistant-form");
const assistantInput = document.getElementById("assistant-input");
const assistantResponse = document.getElementById("assistant-response");
const assistantStatus = document.getElementById("assistant-status");
const presetButtons = document.querySelectorAll(".preset-btn");

let tasks = loadTasks();
let currentFilter = "all";

function loadTasks() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) ?? [];
  } catch (error) {
    console.error("Failed to load tasks", error);
    return [];
  }
}

function saveTasks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

function createTask(text) {
  return {
    id: crypto.randomUUID(),
    text: text.trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
}

function addTask(text) {
  const trimmed = text.trim();
  if (!trimmed) return;

  tasks.unshift(createTask(trimmed));
  saveTasks();
  renderTasks();
}

function deleteTask(taskId) {
  tasks = tasks.filter((task) => task.id !== taskId);
  saveTasks();
  renderTasks();
}

function toggleTask(taskId) {
  tasks = tasks.map((task) =>
    task.id === taskId ? { ...task, completed: !task.completed } : task
  );
  saveTasks();
  renderTasks();
}

function getFilteredTasks() {
  if (currentFilter === "active") {
    return tasks.filter((task) => !task.completed);
  }

  if (currentFilter === "completed") {
    return tasks.filter((task) => task.completed);
  }

  return tasks;
}

function updateSummary() {
  const completedCount = tasks.filter((task) => task.completed).length;
  taskSummary.textContent = `全 ${tasks.length} 件 / 完了 ${completedCount} 件 / 未完了 ${tasks.length - completedCount} 件`;
}

function renderEmptyState() {
  todoList.innerHTML = '<li class="empty-state">表示できるタスクがありません。新しいタスクを追加してください。</li>';
}

function renderTasks() {
  const filteredTasks = getFilteredTasks();
  todoList.innerHTML = "";
  updateSummary();

  if (!filteredTasks.length) {
    renderEmptyState();
    return;
  }

  filteredTasks.forEach((task) => {
    const item = document.createElement("li");
    item.className = `todo-item ${task.completed ? "completed" : ""}`;

    const main = document.createElement("div");
    main.className = "todo-main";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "todo-checkbox";
    checkbox.checked = task.completed;
    checkbox.setAttribute("aria-label", `${task.text} を完了状態にする`);
    checkbox.addEventListener("change", () => toggleTask(task.id));

    const text = document.createElement("span");
    text.className = "todo-text";
    text.textContent = task.text;

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-btn";
    deleteButton.textContent = "削除";
    deleteButton.addEventListener("click", () => deleteTask(task.id));

    main.append(checkbox, text);
    item.append(main, deleteButton);
    todoList.appendChild(item);
  });
}

function setFilter(nextFilter) {
  currentFilter = nextFilter;
  filterButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.filter === nextFilter);
  });
  renderTasks();
}

function buildTaskContext() {
  if (!tasks.length) {
    return "現在タスクはありません。";
  }

  return tasks
    .map((task, index) => `${index + 1}. [${task.completed ? "完了" : "未完了"}] ${task.text}`)
    .join("\n");
}

async function getAiAssistantReply(prompt) {
  const apiKey = window.TODO_AI_API_KEY || "";

  if (!apiKey) {
    return generateDemoResponse(prompt);
  }

  assistantStatus.textContent = "実APIモードで応答を取得しています。";

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content:
              "あなたはTodo管理を支援するアシスタントです。ユーザーのタスク一覧を見て、簡潔で実用的な提案を日本語で返してください。",
          },
          {
            role: "user",
            content: `ユーザーの依頼: ${prompt}\n\n現在のタスク一覧:\n${buildTaskContext()}`,
          },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "応答を取得できませんでした。";
  } catch (error) {
    console.error(error);
    assistantStatus.textContent = "API呼び出しに失敗したため、デモモードの回答に切り替えました。";
    return generateDemoResponse(prompt);
  }
}

function generateDemoResponse(prompt) {
  const incompleteTasks = tasks.filter((task) => !task.completed);
  const completedTasks = tasks.filter((task) => task.completed);
  const topTask = incompleteTasks[0]?.text;

  const suggestions = [
    `依頼内容: ${prompt}`,
    "",
    `現在の未完了タスクは ${incompleteTasks.length} 件、完了済みタスクは ${completedTasks.length} 件です。`,
  ];

  if (topTask) {
    suggestions.push(`最初に取り組む候補: 「${topTask}」`);
  }

  if (/優先|priority|優先順位/i.test(prompt)) {
    suggestions.push(
      ...incompleteTasks.slice(0, 3).map((task, index) => `${index + 1}. ${task.text}`)
    );
  } else if (/要約|summary/i.test(prompt)) {
    suggestions.push("タスク一覧の概要:");
    suggestions.push(buildTaskContext());
  } else if (/分解|break/i.test(prompt)) {
    suggestions.push(
      topTask
        ? `「${topTask}」を 3 ステップに分けるなら: 1) 要件確認 2) 小さな作業に分割 3) 完了条件を決める`
        : "分解対象のタスクがまだありません。まずタスクを追加してください。"
    );
  } else {
    suggestions.push("おすすめ: 未完了タスクの中から 1 件選び、完了条件を明確にして着手しましょう。");
  }

  assistantStatus.textContent = "デモモードで応答しました。";
  return suggestions.join("\n");
}

todoForm.addEventListener("submit", (event) => {
  event.preventDefault();
  addTask(todoInput.value);
  todoInput.value = "";
  todoInput.focus();
});

filterButtons.forEach((button) => {
  button.addEventListener("click", () => setFilter(button.dataset.filter));
});

presetButtons.forEach((button) => {
  button.addEventListener("click", () => {
    assistantInput.value = button.dataset.prompt;
    assistantInput.focus();
  });
});

assistantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const prompt = assistantInput.value.trim();
  if (!prompt) return;

  assistantResponse.textContent = "アシスタントが考えています...";
  const reply = await getAiAssistantReply(prompt);
  assistantResponse.textContent = reply;
});

renderTasks();
