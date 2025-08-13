import React, { useEffect, useMemo, useState } from "react";

type Priority = "Low" | "Medium" | "High";
type Repeat = "none" | "daily" | "weekly" | "monthly";

type Reminder = {
  id: string;
  minutesBefore: number;
};

type Task = {
  id: string;
  title: string;
  description?: string;
  dueAt?: string;
  priority: Priority;
  tags: string[];
  list: string;
  reminders: Reminder[];
  repeat: Repeat;
  completed: boolean;
  createdAt: string;
  updatedAt: string;
};

type FilterState = {
  query: string;
  list: string | "all";
  tag: string | "all";
  priority: Priority | "all";
  show: "today" | "upcoming" | "overdue" | "all" | "completed";
};

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const nowIso = () => new Date().toISOString();
const isToday = (iso?: string) => {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
};
const isOverdue = (iso?: string) => (iso ? new Date(iso).getTime() < Date.now() : false);

const formatDateTime = (iso?: string) => {
  if (!iso) return "No due date";
  const d = new Date(iso);
  return d.toLocaleString();
};

const storageKey = "todo_reminder_app_v1";

function useNotificationEngine(tasks: Task[]) {
  useEffect(() => {
    let timer: number | undefined;

    const tick = () => {
      const now = Date.now();
      const upcoming = tasks.filter((t) => t.dueAt && !t.completed);
      for (const t of upcoming) {
        const due = new Date(t.dueAt!).getTime();
        const secondsToDue = Math.floor((due - now) / 1000);
        for (const r of t.reminders) {
          const remindAt = due - r.minutesBefore * 60 * 1000;
          const delta = Math.floor((remindAt - now) / 1000);
          if (delta <= 0 && delta > -5) notify(`Reminder: ${t.title}`, `${r.minutesBefore} min before due (${formatDateTime(t.dueAt)})`);
        }
        if (secondsToDue <= 0 && secondsToDue > -5) notify(`Due now: ${t.title}`, t.description || "Task is due");
      }
    };

    timer = window.setInterval(tick, 1000);
    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, [tasks]);
}

function notify(title: string, body?: string) {
  const containerId = "toast-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    container.className = "fixed top-4 right-4 z-50 flex flex-col gap-2";
    document.body.appendChild(container);
  }
  const el = document.createElement("div");
  el.className = "bg-white shadow-lg rounded-2xl px-4 py-3 border border-gray-200 max-w-sm";
  el.innerHTML = `<div class="text-sm font-semibold">${title}</div><div class="text-xs text-gray-600">${body || ""}</div>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 4000);

  if ("Notification" in window) {
    if (Notification.permission === "granted") {
      try { new Notification(title, { body }); } catch {}
    }
  }
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>(() => {
    try { return JSON.parse(localStorage.getItem(storageKey) || "[]"); } catch { return []; }
  });
  const [filters, setFilters] = useState<FilterState>({ query: "", list: "all", tag: "all", priority: "all", show: "today" });
  const [lists, setLists] = useState<string[]>(() => {
    const unique = Array.from(new Set((JSON.parse(localStorage.getItem(storageKey) || "[]") as Task[]).map(t => t.list).concat(["Personal", "Work"])));
    return unique;
  });
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  React.useEffect(() => { localStorage.setItem(storageKey, JSON.stringify(tasks)); }, [tasks]);

  useNotificationEngine(tasks);

  const allTags = React.useMemo(() => Array.from(new Set(tasks.flatMap(t => t.tags))).sort(), [tasks]);

  const filtered = React.useMemo(() => {
    return tasks.filter(t => {
      if (filters.list !== "all" && t.list !== filters.list) return false;
      if (filters.tag !== "all" && !t.tags.includes(filters.tag)) return false;
      if (filters.priority !== "all" && t.priority !== filters.priority) return false;
      if (filters.query && !(t.title.toLowerCase().includes(filters.query.toLowerCase()) || (t.description || "").toLowerCase().includes(filters.query.toLowerCase()))) return false;
      if (filters.show === "today" && !isToday(t.dueAt)) return false;
      if (filters.show === "overdue" && !isOverdue(t.dueAt)) return false;
      if (filters.show === "upcoming" && (isOverdue(t.dueAt) || isToday(t.dueAt) || !t.dueAt)) return false;
      if (filters.show === "completed" && !t.completed) return false;
      if (filters.show !== "completed" && t.completed) return false;
      return true;
    }).sort((a,b)=>{
      const aTime = a.dueAt ? new Date(a.dueAt).getTime() : Infinity;
      const bTime = b.dueAt ? new Date(b.dueAt).getTime() : Infinity;
      if (aTime !== bTime) return aTime - bTime;
      const prioRank = (p: Priority) => ({High:0, Medium:1, Low:2}[p]);
      return prioRank(a.priority) - prioRank(b.priority);
    });
  }, [tasks, filters]);

  const counts = React.useMemo(() => ({
    today: tasks.filter(t => !t.completed && isToday(t.dueAt)).length,
    overdue: tasks.filter(t => !t.completed && isOverdue(t.dueAt)).length,
    upcoming: tasks.filter(t => !t.completed && t.dueAt && !isToday(t.dueAt) && !isOverdue(t.dueAt)).length,
    completed: tasks.filter(t => t.completed).length,
    all: tasks.filter(t => !t.completed).length,
  }), [tasks]);

  const upsertTask = (input: Partial<Task>) => {
    if (!input.title || !input.title.trim()) return;
    const now = nowIso();
    if (input.id) {
      setTasks(prev => prev.map(t => t.id === input.id ? { ...t, ...input, updatedAt: now } as Task : t));
    } else {
      const newTask: Task = {
        id: uid(),
        title: input.title!.trim(),
        description: input.description || "",
        dueAt: input.dueAt || undefined,
        priority: (input.priority as Priority) || "Medium",
        tags: input.tags || [],
        list: (input.list as string) || "Personal",
        reminders: (input.reminders as Reminder[]) || [],
        repeat: (input.repeat as Repeat) || "none",
        completed: false,
        createdAt: now,
        updatedAt: now,
      };
      setTasks(prev => [newTask, ...prev]);
    }
    setShowForm(false);
    setEditing(null);
  };

  const toggleComplete = (id: string) => setTasks(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed, updatedAt: nowIso() } : t));
  const removeTask = (id: string) => setTasks(prev => prev.filter(t => t.id !== id));

  const applyQuickSnooze = (id: string, minutes: number) => setTasks(prev => prev.map(t => {
    if (t.id !== id) return t;
    const base = t.dueAt ? new Date(t.dueAt) : new Date();
    base.setMinutes(base.getMinutes() + minutes);
    return { ...t, dueAt: base.toISOString(), updatedAt: nowIso() };
  }));

  const duplicateTask = (id: string) => setTasks(prev => {
    const src = prev.find(t => t.id === id);
    if (!src) return prev;
    const copy: Task = { ...src, id: uid(), title: src.title + " (copy)", createdAt: nowIso(), updatedAt: nowIso(), completed: false };
    return [copy, ...prev];
  });

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tasks_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (Array.isArray(data)) setTasks(data);
      } catch {}
    };
    reader.readAsText(file);
  };

  const addList = (name: string) => {
    if (!name.trim()) return;
    setLists(prev => prev.includes(name) ? prev : [...prev, name]);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-black text-white grid place-items-center text-sm font-bold">TR</div>
            <div>
              <h1 className="text-xl font-semibold leading-tight">To‑Do Task Reminder</h1>
              <p className="text-xs text-gray-500">Quickly add tasks. Get timely reminders. Stay on track.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowForm(true)} className="px-3 py-2 rounded-xl bg-black text-white text-sm shadow hover:opacity-90">+ New Task</button>
            <button onClick={exportJson} className="px-3 py-2 rounded-xl border text-sm">Export</button>
            <label className="px-3 py-2 rounded-xl border text-sm cursor-pointer">
              Import
              <input type="file" accept="application/json" className="hidden" onChange={(e)=> e.target.files && importJson(e.target.files[0])} />
            </label>
            <button onClick={() => (window as any).Notification?.requestPermission?.()} className="px-3 py-2 rounded-xl border text-sm">Enable Push</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        <aside className="md:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border p-4 space-y-4">
            <input
              placeholder="Search tasks…"
              className="w-full border rounded-xl px-3 py-2 text-sm"
              value={filters.query}
              onChange={(e)=> setFilters({...filters, query: e.target.value})}
            />

            <div className="grid grid-cols-2 gap-2">
              {[
                ["today","Today",counts.today],
                ["upcoming","Upcoming",counts.upcoming],
                ["overdue","Overdue",counts.overdue],
                ["all","All",counts.all],
              ].map(([key,label,count]) => (
                <button key={key as string}
                        onClick={()=> setFilters({...filters, show: key as FilterState["show"]})}
                        className={`px-3 py-2 rounded-xl text-sm border ${filters.show===key? "bg-black text-white":"bg-white"}`}>
                  {label as string} <span className="text-xs opacity-70">({count as number})</span>
                </button>
              ))}
              <button onClick={()=> setFilters({...filters, show: "completed"})} className={`px-3 py-2 rounded-xl text-sm border ${filters.show==="completed"?"bg-black text-white":"bg-white"}`}>Completed <span className="text-xs opacity-70">({counts.completed})</span></button>
            </div>

            <div>
              <label className="text-xs text-gray-500">List</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={filters.list} onChange={(e)=> setFilters({...filters, list: e.target.value as any})}>
                <option value="all">All</option>
                {lists.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
              <div className="flex gap-2 mt-2">
                <input id="newList" placeholder="New list name" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
                <button onClick={()=>{
                  const el = document.getElementById("newList") as HTMLInputElement;
                  addList(el.value); el.value="";
                }} className="px-3 py-2 rounded-xl border text-sm">Add</button>
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">Tag</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={filters.tag} onChange={(e)=> setFilters({...filters, tag: e.target.value as any})}>
                <option value="all">All</option>
                {Array.from(new Set(tasks.flatMap(t => t.tags))).sort().map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Priority</label>
              <select className="w-full border rounded-xl px-3 py-2 text-sm" value={filters.priority} onChange={(e)=> setFilters({...filters, priority: e.target.value as any})}>
                <option value="all">All</option>
                {(["High","Medium","Low"] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
        </aside>

        <section className="md:col-span-9">
          {filtered.length === 0 ? (
            <div className="bg-white rounded-2xl border shadow-sm p-8 grid place-items-center text-center">
              <div className="max-w-md">
                <h2 className="text-lg font-semibold">No tasks match your filters</h2>
                <p className="text-sm text-gray-500">Try changing the filters or add a new task.</p>
                <button onClick={()=> setShowForm(true)} className="mt-4 px-3 py-2 rounded-xl bg-black text-white text-sm">Add Task</button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(task => <TaskCard key={task.id}
                                              task={task}
                                              onToggle={()=> setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed, updatedAt: nowIso() } : t))}
                                              onDelete={()=> setTasks(prev => prev.filter(t => t.id !== task.id))}
                                              onEdit={()=> { setEditing(task); setShowForm(true); }}
                                              onSnooze={(m)=> setTasks(prev => prev.map(t => t.id !== task.id ? t : (() => { const base = t.dueAt ? new Date(t.dueAt) : new Date(); base.setMinutes(base.getMinutes() + m); return { ...t, dueAt: base.toISOString(), updatedAt: nowIso() }; })()))}
                                              onDuplicate={()=> setTasks(prev => { const copy: Task = { ...task, id: uid(), title: task.title + " (copy)", createdAt: nowIso(), updatedAt: nowIso(), completed: false }; return [copy, ...prev]; })}
              />)}
            </div>
          )}
        </section>
      </main>

      {showForm && (
        <TaskForm
          initial={editing || undefined}
          lists={lists}
          onCancel={()=>{ setShowForm(false); setEditing(null); }}
          onSave={upsertTask}
        />
      )}

      <footer className="max-w-6xl mx-auto px-4 py-8 text-xs text-gray-500">
        <div className="flex flex-wrap items-center gap-2">
          <span>Local-only prototype. Export JSON to back up tasks.</span>
          <span>Deploy to enable push notifications cleanly.</span>
        </div>
      </footer>
    </div>
  );
}

function TaskCard({ task, onToggle, onDelete, onEdit, onSnooze, onDuplicate }:{
  task: Task;
  onToggle: ()=>void;
  onDelete: ()=>void;
  onEdit: ()=>void;
  onSnooze: (m:number)=>void;
  onDuplicate: ()=>void;
}){
  const overdue = isOverdue(task.dueAt);
  const soon = task.dueAt ? (!overdue && (new Date(task.dueAt).getTime() - Date.now()) < 60*60*1000) : false;

  return (
    <div className={`bg-white border rounded-2xl shadow-sm p-4 flex flex-col md:flex-row md:items-center gap-3 ${overdue?"border-red-300": soon?"border-yellow-300":"border-gray-200"}`}>
      <div className="flex items-start gap-3 flex-1">
        <input type="checkbox" checked={task.completed} onChange={onToggle} className="mt-1 w-4 h-4" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className={`font-medium ${task.completed?"line-through text-gray-400":""}`}>{task.title}</h3>
            <PriorityBadge p={task.priority} />
            {task.tags.map(tag => <span key={tag} className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border">#{tag}</span>)}
            {task.repeat !== "none" && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 border">{task.repeat}</span>}
          </div>
          {task.description && (
            <p className="text-sm text-gray-600 truncate">{task.description}</p>
          )}
          <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-full border bg-gray-50">{task.list}</span>
            <span>{task.dueAt ? formatDateTime(task.dueAt) : "No due date"}</span>
            {overdue && <span className="text-red-600 font-medium">Overdue</span>}
            {soon && <span className="text-yellow-700 font-medium">Due within 1h</span>}
            {task.reminders.length>0 && <span>{task.reminders.map(r=>`${r.minutesBefore}m`).join(", ")} before</span>}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <MenuButton label="Snooze 15m" onClick={()=> onSnooze(15)} />
        <MenuButton label="Snooze 1h" onClick={()=> onSnooze(60)} />
        <MenuButton label="Edit" onClick={onEdit} />
        <MenuButton label="Duplicate" onClick={onDuplicate} />
        <button onClick={onDelete} className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50">Delete</button>
      </div>
    </div>
  );
}

function MenuButton({label, onClick}:{label:string; onClick:()=>void}){
  return <button onClick={onClick} className="px-3 py-2 rounded-xl border text-sm hover:bg-gray-50">{label}</button>;
}

function PriorityBadge({p}:{p:Priority}){
  const style = p === "High" ? "bg-red-600 text-white" : p === "Medium" ? "bg-yellow-500 text-black" : "bg-green-600 text-white";
  return <span className={`text-[10px] px-2 py-0.5 rounded-full ${style}`}>{p}</span>;
}

function TaskForm({ initial, lists, onCancel, onSave }:{
  initial?: Task;
  lists: string[];
  onCancel: ()=>void;
  onSave: (t: Partial<Task>)=>void;
}){
  const [title, setTitle] = useState(initial?.title || "");
  const [desc, setDesc] = useState(initial?.description || "");
  const [list, setList] = useState(initial?.list || lists[0] || "Personal");
  const [priority, setPriority] = useState<Priority>(initial?.priority || "Medium");
  const [dueAt, setDueAt] = useState<string | "">(initial?.dueAt ? initial!.dueAt!.slice(0,16) : "");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>(initial?.tags || []);
  const [reminders, setReminders] = useState<Reminder[]>(initial?.reminders || []);
  const [repeat, setRepeat] = useState<Repeat>(initial?.repeat || "none");

  const addReminder = (mStr: string) => {
    const minutes = parseInt(mStr, 10);
    if (!isFinite(minutes) || minutes <= 0) return;
    setReminders(prev => [...prev, { id: uid(), minutesBefore: minutes }]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initial?.id,
      title,
      description: desc,
      list,
      priority,
      dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
      tags,
      reminders,
      repeat,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 grid place-items-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-[min(720px,95vw)]">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h3 className="text-lg font-semibold">{initial?"Edit Task":"New Task"}</h3>
          <button onClick={onCancel} className="text-sm px-3 py-2 rounded-xl border">Close</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-600">Title *</label>
            <input required value={title} onChange={(e)=> setTitle(e.target.value)} className="w-full mt-1 border rounded-xl px-3 py-2" placeholder="e.g., Submit report" />
          </div>
          <div>
            <label className="text-xs text-gray-600">Description</label>
            <textarea value={desc} onChange={(e)=> setDesc(e.target.value)} className="w-full mt-1 border rounded-xl px-3 py-2" rows={3} placeholder="Notes, links, steps…" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-gray-600">List</label>
              <select value={list} onChange={(e)=> setList(e.target.value)} className="w-full mt-1 border rounded-xl px-3 py-2">
                {lists.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Priority</label>
              <select value={priority} onChange={(e)=> setPriority(e.target.value as Priority)} className="w-full mt-1 border rounded-xl px-3 py-2">
                {(["High","Medium","Low"] as Priority[]).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Due date & time</label>
              <input type="datetime-local" value={dueAt} onChange={(e)=> setDueAt(e.target.value)} className="w-full mt-1 border rounded-xl px-3 py-2" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-600">Tags</label>
            <div className="flex gap-2 mt-1">
              <input value={tagInput} onChange={(e)=> setTagInput(e.target.value)} className="flex-1 border rounded-xl px-3 py-2" placeholder="Type a tag and press Add" />
              <button type="button" onClick={()=>{ if(tagInput.trim()){ setTags(prev=> [...new Set([...prev, tagInput.trim()])]); setTagInput(""); } }} className="px-3 py-2 rounded-xl border">Add</button>
            </div>
            <div className="flex gap-2 mt-2 flex-wrap">
              {tags.map(t => (
                <span key={t} className="text-xs px-2 py-1 rounded-full border bg-gray-50">
                  #{t}
                  <button type="button" className="ml-1 text-gray-400 hover:text-gray-700" onClick={()=> setTags(prev=> prev.filter(x=> x!==t))}>×</button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
            <div>
              <label className="text-xs text-gray-600">Repeat</label>
              <select value={repeat} onChange={(e)=> setRepeat(e.target.value as Repeat)} className="w-full mt-1 border rounded-xl px-3 py-2">
                <option value="none">None</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600">Add reminder (minutes before)</label>
              <div className="flex gap-2">
                <input id="remMin" type="number" min={1} step={1} className="flex-1 border rounded-xl px-3 py-2" placeholder="e.g., 15" />
                <button type="button" className="px-3 py-2 rounded-xl border" onClick={()=>{
                  const el = document.getElementById("remMin") as HTMLInputElement;
                  const minutes = parseInt(el.value, 10);
                  if (!isNaN(minutes) && minutes > 0) {
                    setReminders(prev => [...prev, { id: uid(), minutesBefore: minutes }]);
                  }
                  el.value = "";
                }}>Add</button>
              </div>
            </div>
            <div className="text-sm">
              {reminders.length>0 && (
                <div className="flex gap-2 flex-wrap">
                  {reminders.map(r => (
                    <span key={r.id} className="px-2 py-1 rounded-full border bg-gray-50 text-xs">
                      {r.minutesBefore}m
                      <button type="button" className="ml-1 text-gray-400 hover:text-gray-700" onClick={()=> setReminders(prev=> prev.filter(x=> x.id!==r.id))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button type="button" onClick={onCancel} className="px-3 py-2 rounded-xl border">Cancel</button>
            <button type="submit" className="px-4 py-2 rounded-xl bg-black text-white">Save Task</button>
          </div>
        </form>
      </div>
    </div>
  );
}
