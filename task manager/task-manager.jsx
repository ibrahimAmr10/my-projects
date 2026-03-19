import { useState, useEffect, useRef, useCallback } from "react";

const STORAGE_KEY = "hierarchical-tasks-v2";
const genId = () => Math.random().toString(36).slice(2, 9);

const defaultTasks = [
  {
    id: genId(), text: "الدروس المتراكمة", completed: false, collapsed: false,
    children: [
      {
        id: genId(), text: "كيمياء", completed: false, collapsed: false,
        children: [
          { id: genId(), text: "الكيمياء العضوية - الحصة 1", completed: false, collapsed: false, children: [] },
          { id: genId(), text: "الكيمياء العضوية - الحصة 2", completed: false, collapsed: false, children: [] },
        ]
      },
      {
        id: genId(), text: "فيزياء", completed: false, collapsed: false,
        children: [
          { id: genId(), text: "الموجات - الحصة 1", completed: false, collapsed: false, children: [] },
        ]
      },
    ]
  }
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function findAndUpdate(tasks, id, updater) {
  return tasks.map(t => t.id === id ? updater(t) : { ...t, children: findAndUpdate(t.children, id, updater) });
}
function findAndDelete(tasks, id) {
  return tasks.filter(t => t.id !== id).map(t => ({ ...t, children: findAndDelete(t.children, id) }));
}
function addChildTo(tasks, parentId, newTask) {
  return tasks.map(t => t.id === parentId
    ? { ...t, children: [...t.children, newTask], collapsed: false }
    : { ...t, children: addChildTo(t.children, parentId, newTask) });
}
function moveTask(tasks, id, dir) {
  const idx = tasks.findIndex(t => t.id === id);
  if (idx !== -1) {
    const arr = [...tasks];
    const swap = dir === "up" ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= arr.length) return tasks;
    [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
    return arr;
  }
  return tasks.map(t => ({ ...t, children: moveTask(t.children, id, dir) }));
}
function countStats(tasks) {
  let total = 0, done = 0;
  function walk(list) { for (const t of list) { total++; if (t.completed) done++; walk(t.children); } }
  walk(tasks);
  return { total, done };
}
function flattenTasks(tasks, depth = 0, parentName = "") {
  let rows = [];
  for (const t of tasks) {
    rows.push({ depth, text: t.text, completed: t.completed, parent: parentName });
    rows.push(...flattenTasks(t.children, depth + 1, t.text));
  }
  return rows;
}
function filterByIds(tasks, ids) {
  return tasks.filter(t => ids.has(t.id));
}

// ── Voice Button ─────────────────────────────────────────────────────────────
function VoiceBtn({ onTranscript }) {
  const [state, setState] = useState("idle");
  const [errMsg, setErrMsg] = useState("");
  const recogRef = useRef(null);

  const start = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setErrMsg("المتصفح لا يدعم الصوت — استخدم Chrome");
      setTimeout(() => setErrMsg(""), 3000);
      return;
    }
    try {
      const r = new SR();
      r.lang = "ar-EG";
      r.continuous = false;
      r.interimResults = false;
      r.onstart = () => { setState("listening"); setErrMsg(""); };
      r.onend = () => setState("idle");
      r.onresult = (e) => onTranscript(e.results[0][0].transcript);
      r.onerror = (e) => {
        setState("idle");
        if (e.error === "not-allowed") setErrMsg("الميكروفون محجوب — فعّل الإذن في إعدادات المتصفح");
        else if (e.error === "no-speech") setErrMsg("لم يُكتشف صوت، حاول مرة أخرى");
        else setErrMsg("خطأ: " + e.error);
        setTimeout(() => setErrMsg(""), 4000);
      };
      recogRef.current = r;
      r.start();
    } catch {
      setErrMsg("فشل تشغيل الميكروفون");
      setTimeout(() => setErrMsg(""), 3000);
    }
  };

  const stop = () => { recogRef.current?.stop(); setState("idle"); };

  return (
    <div style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
      <button onClick={state === "listening" ? stop : start}
        title={state === "listening" ? "إيقاف" : "تسجيل صوتي"}
        style={{
          background: state === "listening" ? "#ef4444" : "#1e1e1e",
          border: `1px solid ${state === "listening" ? "#ef4444" : "#333"}`,
          color: state === "listening" ? "#fff" : "#888",
          padding: "4px 8px", borderRadius: 6, cursor: "pointer", fontSize: 14,
          animation: state === "listening" ? "pulse 1s infinite" : "none",
          transition: "all 0.2s"
        }}>
        {state === "listening" ? "⏹" : "🎙"}
      </button>
      {errMsg && (
        <div style={{
          position: "absolute", top: "110%", right: 0, background: "#1a1010",
          border: "1px solid #ef444466", color: "#ef4444", borderRadius: 6,
          padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap", zIndex: 200,
          fontFamily: "monospace", direction: "rtl", minWidth: 200
        }}>
          ⚠ {errMsg}
        </div>
      )}
    </div>
  );
}

// ── Export Modal ─────────────────────────────────────────────────────────────
function ExportModal({ tasks, onClose }) {
  const [selected, setSelected] = useState(new Set(tasks.map(t => t.id)));
  const [format, setFormat] = useState("excel");

  const toggleAll = () => selected.size === tasks.length ? setSelected(new Set()) : setSelected(new Set(tasks.map(t => t.id)));
  const toggle = (id) => { const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };

  const doExport = () => {
    const chosen = filterByIds(tasks, selected);
    if (!chosen.length) { alert("اختر مهمة واحدة على الأقل"); return; }
    if (format === "json") exportJSON(chosen);
    else if (format === "excel") exportCSV(chosen);
    else exportPDF(chosen);
    onClose();
  };

  return (
    <div onClick={e => e.target === e.currentTarget && onClose()}
      style={{ position: "fixed", inset: 0, background: "#000b", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#141414", border: "1px solid #2a2a2a", borderRadius: 12, padding: 24, width: 360, maxWidth: "95vw" }}>
        <h2 style={{ fontFamily: "monospace", color: "#f59e0b", fontSize: 15, marginBottom: 16, direction: "rtl" }}>⬇ تصدير المهام</h2>

        <p style={{ color: "#666", fontSize: 11, marginBottom: 8, direction: "rtl" }}>اختر الصيغة</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          {[["excel","📊 Excel (.csv)"],["pdf","📄 PDF"],["json","🗂 JSON"]].map(([id, label]) => (
            <button key={id} onClick={() => setFormat(id)} style={{
              flex: 1, padding: "8px 4px", borderRadius: 7, cursor: "pointer", fontSize: 11,
              fontFamily: "monospace", border: `1px solid ${format === id ? "#f59e0b" : "#2a2a2a"}`,
              background: format === id ? "#f59e0b1a" : "#0d0d0d",
              color: format === id ? "#f59e0b" : "#555"
            }}>{label}</button>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <p style={{ color: "#666", fontSize: 11, direction: "rtl" }}>المهام الرئيسية</p>
          <button onClick={toggleAll} style={{ background: "none", border: "none", color: "#f59e0b", fontSize: 11, cursor: "pointer", fontFamily: "monospace" }}>
            {selected.size === tasks.length ? "إلغاء الكل" : "تحديد الكل"}
          </button>
        </div>

        <div style={{ maxHeight: 200, overflowY: "auto", marginBottom: 20, display: "flex", flexDirection: "column", gap: 4 }}>
          {tasks.map(t => {
            const st = countStats([t]);
            return (
              <label key={t.id} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7,
                cursor: "pointer", direction: "rtl",
                background: selected.has(t.id) ? "#f59e0b11" : "#0d0d0d",
                border: `1px solid ${selected.has(t.id) ? "#f59e0b44" : "#1e1e1e"}`
              }}>
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)}
                  style={{ accentColor: "#f59e0b", width: 14, height: 14, flexShrink: 0 }} />
                <span style={{ color: "#e5e7eb", fontSize: 13, flex: 1 }}>{t.text}</span>
                <span style={{ color: "#555", fontSize: 10, fontFamily: "monospace" }}>{st.done}/{st.total}</span>
              </label>
            );
          })}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doExport} style={{
            flex: 1, padding: "9px", background: "#f59e0b", border: "none", borderRadius: 7,
            color: "#000", fontFamily: "'Cairo',sans-serif", fontWeight: 700, fontSize: 13, cursor: "pointer"
          }}>تصدير ⬇</button>
          <button onClick={onClose} style={{
            padding: "9px 16px", background: "#1e1e1e", border: "1px solid #333", borderRadius: 7,
            color: "#666", fontFamily: "'Cairo',sans-serif", fontSize: 13, cursor: "pointer"
          }}>إلغاء</button>
        </div>
      </div>
    </div>
  );
}

function exportJSON(tasks) {
  const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: "application/json" });
  triggerDownload(blob, "tasks.json");
}

function exportCSV(tasks) {
  const rows = flattenTasks(tasks);
  const bom = "\uFEFF";
  const header = "المستوى,المهمة,المهمة الأم,الحالة\n";
  const body = rows.map(r =>
    `${r.depth},"${"  ".repeat(r.depth)}${r.text.replace(/"/g, '""')}","${r.parent.replace(/"/g, '""')}","${r.completed ? "مكتملة" : "قيد التنفيذ"}"`
  ).join("\n");
  const blob = new Blob([bom + header + body], { type: "text/csv;charset=utf-8" });
  triggerDownload(blob, "tasks.csv");
}

function exportPDF(tasks) {
  const rows = flattenTasks(tasks);
  const colors = ["#f59e0b", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"];
  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8"><title>قائمة المهام</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&display=swap');
  body { font-family: 'Cairo', Arial, sans-serif; direction: rtl; padding: 32px; color: #111; background: #fff; }
  h1 { font-size: 22px; color: #111; border-bottom: 3px solid #f59e0b; padding-bottom: 10px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #111; color: #f59e0b; padding: 10px 14px; text-align: right; font-weight: 600; }
  td { padding: 8px 14px; border-bottom: 1px solid #f0f0f0; vertical-align: middle; }
  tr:hover { background: #fffbf0; }
  .done { color: #16a34a; font-weight: 600; }
  .pending { color: #dc2626; }
  .indent { display: inline-block; }
  .badge { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }
  @media print { body { padding: 16px; } }
</style>
</head>
<body>
<h1>📋 قائمة المهام</h1>
<table>
  <thead><tr><th>المهمة</th><th style="width:120px">الحالة</th></tr></thead>
  <tbody>
    ${rows.map(r => {
      const c = colors[r.depth % colors.length];
      const indent = r.depth * 20;
      return `<tr>
        <td style="padding-right:${14 + indent}px">
          <span class="badge" style="background:${c}"></span>
          <span style="font-weight:${r.depth === 0 ? 700 : 400};color:${r.depth === 0 ? "#111" : "#444"}">${r.text}</span>
        </td>
        <td class="${r.completed ? "done" : "pending"}">${r.completed ? "✓ مكتملة" : "○ قيد التنفيذ"}</td>
      </tr>`;
    }).join("")}
  </tbody>
</table>
<p style="margin-top:24px;color:#999;font-size:11px;text-align:left">
  تم التصدير: ${new Date().toLocaleDateString("ar-EG")}
</p>
</body></html>`;

  const w = window.open("", "_blank");
  if (!w) { alert("السماح بالـ popups للطباعة"); return; }
  w.document.write(html);
  w.document.close();
  w.onload = () => w.print();
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ── Task Node ─────────────────────────────────────────────────────────────────
const iconBtn = (color) => ({
  background: "transparent", border: "none", color, cursor: "pointer",
  padding: "2px 5px", borderRadius: 4, fontSize: 13, lineHeight: 1,
  display: "flex", alignItems: "center", justifyContent: "center"
});

const inputStyle = {
  background: "#0d0d0d", border: "1px solid #333", borderRadius: 6,
  color: "#e5e7eb", padding: "5px 10px", outline: "none",
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 13
};

function TaskNode({ task, depth, onToggle, onDelete, onAddChild, onMove, onRename, isFirst, isLast }) {
  const [adding, setAdding] = useState(false);
  const [newText, setNewText] = useState("");
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const inputRef = useRef(null);

  useEffect(() => { if (adding && inputRef.current) inputRef.current.focus(); }, [adding]);

  const indentColor = ["#f59e0b", "#34d399", "#60a5fa", "#f472b6", "#a78bfa"][depth % 5];

  const submitAdd = () => {
    if (!newText.trim()) { setAdding(false); return; }
    onAddChild(task.id, { id: genId(), text: newText.trim(), completed: false, collapsed: false, children: [] });
    setNewText(""); setAdding(false);
  };

  const submitEdit = () => {
    if (editText.trim()) onRename(task.id, editText.trim());
    setEditing(false);
  };

  return (
    <div style={{ marginLeft: depth === 0 ? 0 : 20, borderLeft: depth > 0 ? `2px solid ${indentColor}22` : "none", paddingLeft: depth > 0 ? 12 : 0 }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6, padding: "7px 8px",
        borderRadius: 8, margin: "3px 0", transition: "all 0.15s",
        background: task.completed ? "#1a1a1a" : depth === 0 ? "#1e1e1e" : "#181818",
        border: `1px solid ${task.completed ? "#2a2a2a" : indentColor + "33"}`,
        opacity: task.completed ? 0.55 : 1,
      }}>
        {task.children.length > 0
          ? <button onClick={() => onToggle(task.id, "collapse")} style={iconBtn("#555")}>
              <span style={{ fontSize: 10, display: "inline-block", transform: task.collapsed ? "rotate(-90deg)" : "rotate(0)", transition: "0.2s" }}>▼</span>
            </button>
          : <span style={{ width: 22 }} />}

        <button onClick={() => onToggle(task.id, "complete")} style={{
          width: 18, height: 18, borderRadius: 4, flexShrink: 0,
          border: `2px solid ${indentColor}`, background: task.completed ? indentColor : "transparent",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0
        }}>
          {task.completed && <span style={{ fontSize: 10, color: "#000", fontWeight: "bold" }}>✓</span>}
        </button>

        {editing ? (
          <div style={{ display: "flex", gap: 4, flex: 1, alignItems: "center" }}>
            <input value={editText} onChange={e => setEditText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitEdit(); if (e.key === "Escape") setEditing(false); }}
              style={{ ...inputStyle, flex: 1 }} autoFocus />
            <VoiceBtn onTranscript={t => setEditText(prev => (prev + " " + t).trim())} />
            <button onClick={submitEdit} style={iconBtn("#34d399")}>✓</button>
            <button onClick={() => setEditing(false)} style={iconBtn("#ef4444")}>✕</button>
          </div>
        ) : (
          <span onDoubleClick={() => { setEditText(task.text); setEditing(true); }}
            style={{ flex: 1, fontSize: depth === 0 ? 14 : 13, color: task.completed ? "#555" : "#e5e7eb",
              textDecoration: task.completed ? "line-through" : "none", cursor: "text",
              fontWeight: depth === 0 ? 600 : 400, direction: "rtl", textAlign: "right",
              fontFamily: "'Cairo', sans-serif" }}>
            {task.text}
          </span>
        )}

        <div style={{ display: "flex", gap: 2, flexShrink: 0 }}>
          {!isFirst && <button onClick={() => onMove(task.id, "up")} style={iconBtn("#555")}>↑</button>}
          {!isLast  && <button onClick={() => onMove(task.id, "down")} style={iconBtn("#555")}>↓</button>}
          <button onClick={() => setAdding(v => !v)} style={iconBtn("#60a5fa")} title="مهمة فرعية">+</button>
          <button onClick={() => onDelete(task.id)} style={iconBtn("#ef444488")}>✕</button>
        </div>
      </div>

      {adding && (
        <div style={{ display: "flex", gap: 6, marginLeft: 32, marginBottom: 4, alignItems: "center" }}>
          <input ref={inputRef} value={newText} onChange={e => setNewText(e.target.value)} placeholder="اسم المهمة..."
            onKeyDown={e => { if (e.key === "Enter") submitAdd(); if (e.key === "Escape") { setAdding(false); setNewText(""); } }}
            style={{ ...inputStyle, flex: 1, direction: "rtl", textAlign: "right", borderColor: indentColor + "88" }} />
          <VoiceBtn onTranscript={t => setNewText(prev => (prev + " " + t).trim())} />
          <button onClick={submitAdd} style={{ background: "#f59e0b", border: "none", color: "#000", padding: "5px 12px", borderRadius: 6, cursor: "pointer", fontFamily: "'Cairo',sans-serif", fontSize: 13, fontWeight: 600 }}>إضافة</button>
          <button onClick={() => { setAdding(false); setNewText(""); }} style={iconBtn("#555")}>✕</button>
        </div>
      )}

      {!task.collapsed && task.children.map((child, i) => (
        <TaskNode key={child.id} task={child} depth={depth + 1}
          onToggle={onToggle} onDelete={onDelete} onAddChild={onAddChild}
          onMove={onMove} onRename={onRename}
          isFirst={i === 0} isLast={i === task.children.length - 1} />
      ))}
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const [tasks, setTasks] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [newRoot, setNewRoot] = useState("");
  const [addingRoot, setAddingRoot] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const rootInputRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await window.storage.get(STORAGE_KEY);
        setTasks(res ? JSON.parse(res.value) : defaultTasks);
      } catch { setTasks(defaultTasks); }
      setLoaded(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded || !tasks) return;
    window.storage.set(STORAGE_KEY, JSON.stringify(tasks)).catch(() => {});
  }, [tasks, loaded]);

  useEffect(() => { if (addingRoot && rootInputRef.current) rootInputRef.current.focus(); }, [addingRoot]);

  const handleToggle   = useCallback((id, type) => setTasks(prev => findAndUpdate(prev, id, t => type === "collapse" ? { ...t, collapsed: !t.collapsed } : { ...t, completed: !t.completed })), []);
  const handleDelete   = useCallback((id) => setTasks(prev => findAndDelete(prev, id)), []);
  const handleAddChild = useCallback((parentId, task) => setTasks(prev => addChildTo(prev, parentId, task)), []);
  const handleMove     = useCallback((id, dir) => setTasks(prev => moveTask(prev, id, dir)), []);
  const handleRename   = useCallback((id, text) => setTasks(prev => findAndUpdate(prev, id, t => ({ ...t, text }))), []);

  const submitRootTask = () => {
    if (!newRoot.trim()) { setAddingRoot(false); return; }
    setTasks(prev => [...prev, { id: genId(), text: newRoot.trim(), completed: false, collapsed: false, children: [] }]);
    setNewRoot(""); setAddingRoot(false);
  };

  const clearCompleted = () => {
    function purge(list) { return list.filter(t => !t.completed).map(t => ({ ...t, children: purge(t.children) })); }
    setTasks(purge);
  };

  if (!loaded) return (
    <div style={{ background: "#0d0d0d", height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#555", fontFamily: "monospace" }}>
      جاري التحميل...
    </div>
  );

  const { total, done } = countStats(tasks || []);
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Cairo:wght@400;600;700&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0d0d0d; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
        button:hover { opacity: 0.75; }
        input:focus { border-color: #f59e0b !important; }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.45} }
      `}</style>

      <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#e5e7eb", fontFamily: "'Cairo',sans-serif", paddingBottom: 60 }}>

        {/* Header */}
        <div style={{ background: "#111", borderBottom: "1px solid #1e1e1e", padding: "16px 20px", position: "sticky", top: 0, zIndex: 10 }}>
          <div style={{ maxWidth: 720, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <h1 style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 18, fontWeight: 600, color: "#f59e0b" }}>TASK TREE</h1>
                <p style={{ fontSize: 11, color: "#555", fontFamily: "monospace" }}>منظم المهام الهرمي</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => setShowExport(true)} style={{
                  background: "#1e1e1e", border: "1px solid #333", color: "#888",
                  padding: "6px 12px", borderRadius: 7, cursor: "pointer",
                  fontFamily: "'Cairo',sans-serif", fontSize: 12
                }}>⬇ تصدير</button>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, color: pct === 100 ? "#34d399" : "#f59e0b" }}>{pct}%</div>
                  <div style={{ fontSize: 11, color: "#555" }}>{done} / {total}</div>
                </div>
              </div>
            </div>
            <div style={{ height: 3, background: "#1e1e1e", borderRadius: 2, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${pct}%`, background: pct === 100 ? "#34d399" : "#f59e0b", transition: "width 0.4s", borderRadius: 2 }} />
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ maxWidth: 720, margin: "0 auto", padding: "16px 16px 0" }}>

          {/* Add root */}
          <div style={{ marginBottom: 16 }}>
            {!addingRoot ? (
              <button onClick={() => setAddingRoot(true)} style={{
                width: "100%", padding: "10px", border: "1px dashed #2a2a2a", borderRadius: 8,
                background: "transparent", color: "#555", cursor: "pointer",
                fontFamily: "'Cairo',sans-serif", fontSize: 13,
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6
              }}>
                <span style={{ fontSize: 16 }}>+</span> إضافة مهمة رئيسية
              </button>
            ) : (
              <div style={{ display: "flex", gap: 6, alignItems: "center", padding: 8, background: "#141414", borderRadius: 8, border: "1px solid #f59e0b44" }}>
                <input ref={rootInputRef} value={newRoot} onChange={e => setNewRoot(e.target.value)} placeholder="اسم المهمة الرئيسية..."
                  onKeyDown={e => { if (e.key === "Enter") submitRootTask(); if (e.key === "Escape") { setAddingRoot(false); setNewRoot(""); } }}
                  style={{ ...inputStyle, flex: 1, direction: "rtl", textAlign: "right", borderColor: "#f59e0b44" }} />
                <VoiceBtn onTranscript={t => setNewRoot(prev => (prev + " " + t).trim())} />
                <button onClick={submitRootTask} style={{ background: "#f59e0b", border: "none", color: "#000", padding: "5px 14px", borderRadius: 6, cursor: "pointer", fontFamily: "'Cairo',sans-serif", fontSize: 13, fontWeight: 600 }}>إضافة</button>
                <button onClick={() => { setAddingRoot(false); setNewRoot(""); }} style={iconBtn("#555")}>✕</button>
              </div>
            )}
          </div>

          {tasks && tasks.length === 0 ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#2a2a2a", fontFamily: "monospace", fontSize: 13 }}>لا توجد مهام</div>
          ) : tasks && tasks.map((task, i) => (
            <TaskNode key={task.id} task={task} depth={0}
              onToggle={handleToggle} onDelete={handleDelete} onAddChild={handleAddChild}
              onMove={handleMove} onRename={handleRename}
              isFirst={i === 0} isLast={i === tasks.length - 1} />
          ))}

          {done > 0 && (
            <button onClick={clearCompleted} style={{
              marginTop: 20, background: "transparent", border: "1px solid #ef444433", color: "#ef4444aa",
              padding: "7px 16px", borderRadius: 6, cursor: "pointer",
              fontFamily: "'Cairo',sans-serif", fontSize: 12, display: "block", marginLeft: "auto"
            }}>حذف المكتملة ({done})</button>
          )}

          <div style={{ marginTop: 20, padding: "10px 14px", background: "#111", borderRadius: 8, border: "1px solid #1a1a1a" }}>
            <p style={{ fontSize: 11, color: "#3a3a3a", fontFamily: "monospace", lineHeight: 2, direction: "rtl", textAlign: "right" }}>
              🎙 الصوت يحتاج Chrome + إذن ميكروفون · ⬇ تصدير Excel / PDF / JSON من أعلاه<br />
              دبل-كليك للتعديل · + مهمة فرعية · ↑↓ ترتيب · ▼ طي
            </p>
          </div>
        </div>
      </div>

      {showExport && tasks && <ExportModal tasks={tasks} onClose={() => setShowExport(false)} />}
    </>
  );
}
