import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";

const FIELDS = [
  "Beverly High School — Grass",
  "Beverly High School — Turf",
  "Beverly Middle School — Grass",
  "Beverly Middle School — Turf",
];

const HALF_OPTIONS = [
  { value: "full",  label: "Full Field"  },
  { value: "north", label: "North Half"  },
  { value: "south", label: "South Half"  },
];

const ACTIVITY_COLORS = {
  "Soccer":         { bg: "#f97316", light: "#1c1008", text: "#fb923c" },
  "Baseball":       { bg: "#f59e0b", light: "#1c1500", text: "#fbbf24" },
  "Football":       { bg: "#ea580c", light: "#1c0d00", text: "#fb923c" },
  "Lacrosse":       { bg: "#dc2626", light: "#1c0505", text: "#f87171" },
  "Free Time":      { bg: "#6b7280", light: "#111318", text: "#9ca3af" },
  "Tennis":         { bg: "#d97706", light: "#1a1100", text: "#fcd34d" },
  "Track & Field":  { bg: "#c2410c", light: "#1a0800", text: "#fb923c" },
  "Field Hockey":   { bg: "#b45309", light: "#180f00", text: "#fbbf24" },
};

const HOURS     = Array.from({ length: 13 }, (_, i) => i + 8);
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const fmt       = (h) => (h < 12 ? `${h}am` : h === 12 ? "12pm" : `${h - 12}pm`);
const toYMD     = (d) => d.toISOString().slice(0, 10);
const todayYMD  = toYMD(new Date());

const getWeekDates = (offset = 0) => {
  const now    = new Date();
  const day    = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
};

const isActiveOn = (ev, date) => {
  const ymd = toYMD(date);
  if (ev.cancelled_dates?.includes(ymd)) return false;
  const dow = (date.getDay() + 6) % 7;
  if (!ev.recur_days.includes(dow)) return false;
  if (ev.date_start && ymd < ev.date_start) return false;
  if (ev.date_end   && ymd > ev.date_end)   return false;
  return true;
};

const blankEvent = () => ({
  field: 0, start: 9, end: 11,
  activity: "Soccer", label: "", half: "full",
  recur_days: [0],
  date_start: todayYMD,
  date_end: "",
  cancelled_dates: [],
});

const fromDB = (row) => ({
  ...row,
  recur_days:      row.recur_days      ?? [],
  cancelled_dates: row.cancelled_dates ?? [],
});

export default function App() {
  const [events, setEvents]               = useState([]);
  const [loading, setLoading]             = useState(true);
  const [saving,  setSaving]              = useState(false);
  const [error,   setError]               = useState(null);
  const [weekOffset, setWeekOffset]       = useState(0);
  const [selectedField, setSelectedField] = useState(0);
  const [adminMode, setAdminMode]         = useState(false);
  const [adminPass, setAdminPass]         = useState("");
  const [showLogin, setShowLogin]         = useState(false);
  const [showAddModal, setShowAddModal]   = useState(false);
  const [editEvent, setEditEvent]         = useState(null);
  const [loginError, setLoginError]       = useState("");
  const [newEvent, setNewEvent]           = useState(blankEvent());
  const [cancelTarget, setCancelTarget]   = useState(null);

  useEffect(() => { fetchEvents(); }, []);

  const fetchEvents = async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.from("events").select("*");
    if (error) { setError("Could not load schedule. Please refresh."); console.error(error); }
    else { setEvents(data.map(fromDB)); }
    setLoading(false);
  };

  const weekDates   = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const fieldEvents = events.filter(e => e.field === selectedField);
  const today       = new Date();
  const isTodayCol  = (d) => d.toDateString() === today.toDateString();

  const handleLogin = () => {
    if (adminPass === "admin123") {
      setAdminMode(true); setShowLogin(false); setAdminPass(""); setLoginError("");
    } else setLoginError("Incorrect password");
  };

  const handleAdd = async () => {
    if (!newEvent.label.trim() || newEvent.recur_days.length === 0) return;
    setSaving(true);
    const payload = { ...newEvent, field: selectedField, cancelled_dates: [] };
    const { data, error } = await supabase.from("events").insert([payload]).select();
    if (error) { alert("Error saving: " + error.message); }
    else { setEvents(prev => [...prev, fromDB(data[0])]); }
    setSaving(false);
    setShowAddModal(false);
    setNewEvent(blankEvent());
  };

  const handleEdit = async () => {
    setSaving(true);
    const { id, ...fields } = editEvent;
    const { data, error } = await supabase.from("events").update(fields).eq("id", id).select();
    if (error) { alert("Error updating: " + error.message); }
    else { setEvents(prev => prev.map(e => e.id === id ? fromDB(data[0]) : e)); }
    setSaving(false);
    setEditEvent(null);
  };

  const handleDeleteEvent = async (id) => {
    setSaving(true);
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { alert("Error deleting: " + error.message); }
    else { setEvents(prev => prev.filter(e => e.id !== id)); }
    setSaving(false);
  };

  const handleCancelOccurrence = async () => {
    if (!cancelTarget) return;
    setSaving(true);
    const ev       = cancelTarget.ev;
    const newDates = [...(ev.cancelled_dates ?? []), cancelTarget.dateYMD];
    const { data, error } = await supabase
      .from("events").update({ cancelled_dates: newDates }).eq("id", ev.id).select();
    if (error) { alert("Error cancelling: " + error.message); }
    else { setEvents(prev => prev.map(e => e.id === ev.id ? fromDB(data[0]) : e)); }
    setSaving(false);
    setCancelTarget(null);
  };

  const hasSplitOnField = fieldEvents.some(e => e.half !== "full");

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Georgia, serif" }}>
      <div style={{ textAlign: "center", color: "#f97316" }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🟠</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>Loading schedule…</div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0a", fontFamily: "'Georgia', serif" }}>

      {/* ── Header ── */}
      <header style={{
        background: "#111111",
        borderBottom: "3px solid #f97316",
        color: "#fff", padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64, boxShadow: "0 2px 20px rgba(249,115,22,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 26 }}>🟠</span>
          <div>
            <div style={{ fontWeight: 700, fontSize: 18, color: "#fff" }}>Beverly Community Fields</div>
            <div style={{ fontSize: 11, color: "#f97316", letterSpacing: 1, textTransform: "uppercase" }}>Public Schedule</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {saving && <span style={{ fontSize: 12, color: "#9ca3af", fontStyle: "italic" }}>Saving…</span>}
          {adminMode && <span style={{ background: "#f97316", color: "#000", borderRadius: 20, padding: "3px 12px", fontSize: 12, fontWeight: 700 }}>ADMIN</span>}
          <button onClick={() => adminMode ? setAdminMode(false) : setShowLogin(true)}
            style={{ background: adminMode ? "#dc2626" : "#f97316", color: adminMode ? "#fff" : "#000", border: "none", borderRadius: 8, padding: "7px 18px", cursor: "pointer", fontSize: 13, fontFamily: "inherit", fontWeight: 700 }}>
            {adminMode ? "Exit Admin" : "Admin Login"}
          </button>
        </div>
      </header>

      {/* ── Error banner ── */}
      {error && (
        <div style={{ background: "#1c0505", borderBottom: "2px solid #dc2626", padding: "10px 24px", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ color: "#f87171", fontSize: 13 }}>⚠️ {error}</span>
          <button onClick={fetchEvents} style={{ fontSize: 12, color: "#f87171", background: "none", border: "1px solid #f87171", borderRadius: 6, padding: "3px 10px", cursor: "pointer" }}>Retry</button>
        </div>
      )}

      {/* ── Field Tabs ── */}
      <div style={{ background: "#111111", padding: "0 24px", display: "flex", gap: 3, flexWrap: "wrap", borderBottom: "2px solid #1f1f1f" }}>
        {FIELDS.map((f, i) => (
          <button key={i} onClick={() => setSelectedField(i)} style={{
            background: selectedField === i ? "#f97316" : "transparent",
            color: selectedField === i ? "#000" : "#6b7280",
            border: "none", borderRadius: "8px 8px 0 0", padding: "10px 18px",
            cursor: "pointer", fontSize: 12, fontFamily: "inherit",
            fontWeight: selectedField === i ? 700 : 400, whiteSpace: "nowrap",
            transition: "all 0.15s",
          }}>{f}</button>
        ))}
      </div>

      {/* ── Week Nav ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 24px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => setWeekOffset(w => w - 1)} style={navBtn}>‹</button>
          <span style={{ fontWeight: 700, fontSize: 15, color: "#fff" }}>
            {weekDates[0].toLocaleDateString("en-US", { month: "long", day: "numeric" })} –{" "}
            {weekDates[6].toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
          </span>
          <button onClick={() => setWeekOffset(w => w + 1)} style={navBtn}>›</button>
          {weekOffset !== 0 && <button onClick={() => setWeekOffset(0)} style={{ ...navBtn, fontSize: 12, padding: "4px 12px" }}>Today</button>}
        </div>
        {adminMode && (
          <button onClick={() => { setNewEvent({ ...blankEvent(), field: selectedField }); setShowAddModal(true); }}
            style={{ background: "#f97316", color: "#000", border: "none", borderRadius: 8, padding: "8px 20px", cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 700, boxShadow: "0 2px 12px rgba(249,115,22,0.4)" }}>
            + Add Event
          </button>
        )}
      </div>

      {/* ── Split legend ── */}
      {hasSplitOnField && (
        <div style={{ padding: "0 24px 6px", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "#6b7280", letterSpacing: 0.5 }}>SPLIT FIELD:</span>
          {["N = North Half", "S = South Half"].map(l => (
            <span key={l} style={{ fontSize: 11, background: "#1a1008", border: "1px solid #f97316", borderRadius: 4, padding: "1px 7px", color: "#f97316", fontWeight: 700 }}>{l}</span>
          ))}
        </div>
      )}

      {/* ── Calendar Grid ── */}
      <div style={{ padding: "0 24px 40px", overflowX: "auto" }}>
        <div style={{
          display: "grid", gridTemplateColumns: "52px repeat(7, 1fr)",
          background: "#111111", borderRadius: 14,
          boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
          overflow: "hidden", border: "1px solid #1f1f1f", minWidth: 700,
        }}>
          {/* Day headers */}
          <div style={{ background: "#1a1a1a", borderBottom: "2px solid #f97316" }} />
          {weekDates.map((date, di) => (
            <div key={di} style={{
              background: isTodayCol(date) ? "#f97316" : "#1a1a1a",
              color: isTodayCol(date) ? "#000" : "#9ca3af",
              textAlign: "center", padding: "10px 0 8px",
              borderBottom: "2px solid #f97316",
              borderLeft: di > 0 ? "1px solid #222" : "none", fontWeight: 700,
            }}>
              <div style={{ letterSpacing: 1, textTransform: "uppercase", fontSize: 11, opacity: 0.75 }}>{DAY_NAMES[di]}</div>
              <div style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.3 }}>{date.getDate()}</div>
            </div>
          ))}

          {/* Hour rows */}
          {HOURS.map((hour, hi) => (
            <>
              <div key={`t${hour}`} style={{
                background: hi % 2 === 0 ? "#111" : "#0d0d0d",
                borderTop: "1px solid #1f1f1f", padding: "4px 6px 0",
                fontSize: 11, color: "#4b5563", textAlign: "right", fontFamily: "monospace", userSelect: "none",
              }}>{fmt(hour)}</div>

              {weekDates.map((wdate, di) => {
                const activeEvts = fieldEvents.filter(e => isActiveOn(e, wdate) && e.start === hour);
                const fullEvts   = activeEvts.filter(e => e.half === "full");
                const northEvts  = activeEvts.filter(e => e.half === "north");
                const southEvts  = activeEvts.filter(e => e.half === "south");
                const hasSplit   = northEvts.length > 0 || southEvts.length > 0;
                const dateYMD    = toYMD(wdate);
                return (
                  <div key={`${di}-${hour}`} style={{
                    background: isTodayCol(wdate) ? (hi%2===0?"#1a0f00":"#150c00") : (hi%2===0?"#111":"#0d0d0d"),
                    borderTop: "1px solid #1f1f1f", borderLeft: "1px solid #1f1f1f",
                    minHeight: 44, position: "relative", padding: 2,
                  }}>
                    {fullEvts.map(ev => <EventBlock key={ev.id} ev={ev} adminMode={adminMode} onEdit={() => setEditEvent({...ev})} onDelete={() => handleDeleteEvent(ev.id)} onCancelOccurrence={() => setCancelTarget({ev, dateYMD})} left="3px" right="3px" />)}
                    {hasSplit && <>
                      <div style={{ position: "absolute", left: "50%", top: 3, bottom: 3, width: 1, background: "#f97316", opacity: 0.3, zIndex: 1 }} />
                      {northEvts.map(ev => <EventBlock key={ev.id} ev={ev} adminMode={adminMode} onEdit={() => setEditEvent({...ev})} onDelete={() => handleDeleteEvent(ev.id)} onCancelOccurrence={() => setCancelTarget({ev, dateYMD})} left="3px" right="51%" badge="N" />)}
                      {southEvts.map(ev => <EventBlock key={ev.id} ev={ev} adminMode={adminMode} onEdit={() => setEditEvent({...ev})} onDelete={() => handleDeleteEvent(ev.id)} onCancelOccurrence={() => setCancelTarget({ev, dateYMD})} left="51%" right="3px" badge="S" />)}
                    </>}
                  </div>
                );
              })}
            </>
          ))}
        </div>
      </div>

      {/* ── Legend ── */}
      <div style={{ padding: "0 24px 32px", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {Object.entries(ACTIVITY_COLORS).map(([act, c]) => (
          <div key={act} style={{ display: "flex", alignItems: "center", gap: 6, background: c.light, border: `1.5px solid ${c.bg}`, borderRadius: 20, padding: "3px 12px", fontSize: 12, color: c.text, fontWeight: 600 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: c.bg }} />
            {act}
          </div>
        ))}
      </div>

      {/* ── Modals ── */}
      {showLogin && (
        <Modal onClose={() => { setShowLogin(false); setLoginError(""); setAdminPass(""); }}>
          <h2 style={{ margin: "0 0 8px", color: "#f97316", fontSize: 20 }}>Admin Login</h2>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13 }}>Enter the admin password to manage schedules.</p>
          <input type="password" placeholder="Password" value={adminPass} onChange={e => setAdminPass(e.target.value)} onKeyDown={e => e.key === "Enter" && handleLogin()} style={inputStyle} autoFocus />
          {loginError && <div style={{ color: "#f87171", fontSize: 12, marginTop: 4 }}>{loginError}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleLogin} style={primaryBtn}>Login</button>
            <button onClick={() => { setShowLogin(false); setLoginError(""); setAdminPass(""); }} style={secondaryBtn}>Cancel</button>
          </div>
        </Modal>
      )}

      {showAddModal && (
        <Modal onClose={() => setShowAddModal(false)} wide>
          <h2 style={{ margin: "0 0 4px", color: "#f97316", fontSize: 20 }}>Add Recurring Event</h2>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 12 }}>{FIELDS[selectedField]}</p>
          <EventForm event={newEvent} onChange={setNewEvent} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleAdd} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Add Event"}</button>
            <button onClick={() => setShowAddModal(false)} style={secondaryBtn}>Cancel</button>
          </div>
        </Modal>
      )}

      {editEvent && (
        <Modal onClose={() => setEditEvent(null)} wide>
          <h2 style={{ margin: "0 0 16px", color: "#f97316", fontSize: 20 }}>Edit Event</h2>
          <EventForm event={editEvent} onChange={setEditEvent} />
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button onClick={handleEdit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Save Changes"}</button>
            <button onClick={() => setEditEvent(null)} style={secondaryBtn}>Cancel</button>
          </div>
        </Modal>
      )}

      {cancelTarget && (
        <Modal onClose={() => setCancelTarget(null)}>
          <h2 style={{ margin: "0 0 8px", color: "#f97316", fontSize: 18 }}>Cancel This Occurrence?</h2>
          <p style={{ margin: "0 0 6px", color: "#e5e7eb", fontSize: 13 }}><strong>{cancelTarget.ev.label}</strong></p>
          <p style={{ margin: "0 0 16px", color: "#6b7280", fontSize: 13 }}>
            {new Date(cancelTarget.dateYMD + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
          </p>
          <div style={{ background: "#1a0f00", border: "1px solid #f97316", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#fb923c", marginBottom: 16 }}>
            This only cancels <strong>this one date</strong>. The rest of the recurring schedule stays intact.
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={handleCancelOccurrence} disabled={saving} style={{ ...primaryBtn, background: "#dc2626", opacity: saving ? 0.6 : 1 }}>{saving ? "Saving…" : "Cancel This Date"}</button>
            <button onClick={() => setCancelTarget(null)} style={secondaryBtn}>Keep It</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function EventBlock({ ev, adminMode, onEdit, onDelete, onCancelOccurrence, left, right, badge }) {
  const colors = ACTIVITY_COLORS[ev.activity] || ACTIVITY_COLORS["Free Time"];
  const height = (ev.end - ev.start) * 44 - 4;
  const [showMenu, setShowMenu] = useState(false);
  return (
    <div style={{ position: "absolute", left, right, top: 3, height, zIndex: showMenu ? 10 : 2 }}>
      <div onClick={() => adminMode && setShowMenu(m => !m)} style={{
        position: "absolute", inset: 0,
        background: colors.light, border: `2px solid ${colors.bg}`,
        borderRadius: 7, padding: "3px 6px",
        cursor: adminMode ? "pointer" : "default",
        overflow: "hidden", boxShadow: `0 2px 8px ${colors.bg}55`,
      }}>
        {badge && <span style={{ position: "absolute", top: 3, left: 4, background: colors.bg, color: "#000", fontSize: 9, fontWeight: 800, borderRadius: 3, padding: "1px 4px" }}>{badge}</span>}
        <div style={{ fontWeight: 700, fontSize: 10, color: colors.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", marginLeft: badge ? 14 : 0 }}>{ev.activity}</div>
        <div style={{ fontSize: 10, color: colors.text, opacity: 0.75, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.label}</div>
        <div style={{ fontSize: 9, color: colors.text, opacity: 0.55, marginTop: 1 }}>{fmt(ev.start)}–{fmt(ev.end)}</div>
        <div style={{ fontSize: 8, color: colors.text, opacity: 0.4, marginTop: 1 }}>🔁 {ev.recur_days.map(d => DAY_NAMES[d]).join("/")}</div>
      </div>
      {adminMode && showMenu && (
        <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", left: 0, zIndex: 20, background: "#1a1a1a", border: "1.5px solid #f97316", borderRadius: 10, boxShadow: "0 8px 24px rgba(249,115,22,0.2)", minWidth: 190, overflow: "hidden", marginTop: 3 }}>
          <div style={{ padding: "6px 12px", fontSize: 11, color: "#f97316", borderBottom: "1px solid #222", fontWeight: 700, letterSpacing: 0.5 }}>ADMIN ACTIONS</div>
          <MenuBtn icon="✏️" label="Edit recurring event"  onClick={() => { onEdit();              setShowMenu(false); }} />
          <MenuBtn icon="🚫" label="Cancel this date only" onClick={() => { onCancelOccurrence(); setShowMenu(false); }} color="#fb923c" />
          <MenuBtn icon="🗑️" label="Delete entire series"  onClick={() => { onDelete();           setShowMenu(false); }} color="#f87171" />
          <MenuBtn icon="✕"  label="Close menu"            onClick={() => setShowMenu(false)} />
        </div>
      )}
    </div>
  );
}

function MenuBtn({ icon, label, onClick, color = "#e5e7eb" }) {
  const [hover, setHover] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", background: hover ? "#222" : "transparent", border: "none", padding: "9px 14px", cursor: "pointer", fontSize: 13, color, fontFamily: "inherit", textAlign: "left", borderBottom: "1px solid #222" }}>
      <span>{icon}</span>{label}
    </button>
  );
}

function EventForm({ event, onChange }) {
  const toggleDay = (d) => {
    const days = event.recur_days.includes(d)
      ? event.recur_days.filter(x => x !== d)
      : [...event.recur_days, d].sort();
    onChange(ev => ({ ...ev, recur_days: days }));
  };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>Repeats On</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {DAY_NAMES.map((d, i) => {
            const active = event.recur_days.includes(i);
            return <button key={i} onClick={() => toggleDay(i)} style={{ background: active ? "#f97316" : "#1f1f1f", color: active ? "#000" : "#6b7280", border: `1.5px solid ${active ? "#f97316" : "#333"}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 12, fontFamily: "inherit", fontWeight: active ? 700 : 400 }}>{d}</button>;
          })}
        </div>
        {event.recur_days.length === 0 && <div style={{ color: "#f87171", fontSize: 11, marginTop: 4 }}>Select at least one day</div>}
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ ...labelStyle, flex: 1 }}>Season Start<input type="date" value={event.date_start} onChange={e => onChange(ev => ({...ev, date_start: e.target.value}))} style={inputStyle} /></label>
        <label style={{ ...labelStyle, flex: 1 }}>Season End<input type="date" value={event.date_end} onChange={e => onChange(ev => ({...ev, date_end: e.target.value}))} style={inputStyle} /></label>
      </div>
      <div style={{ display: "flex", gap: 10 }}>
        <label style={{ ...labelStyle, flex: 1 }}>Start Time<select value={event.start} onChange={e => onChange(ev => ({...ev, start: +e.target.value}))} style={inputStyle}>{HOURS.map(h => <option key={h} value={h}>{fmt(h)}</option>)}</select></label>
        <label style={{ ...labelStyle, flex: 1 }}>End Time<select value={event.end} onChange={e => onChange(ev => ({...ev, end: +e.target.value}))} style={inputStyle}>{HOURS.filter(h => h > event.start).map(h => <option key={h} value={h}>{fmt(h)}</option>)}</select></label>
      </div>
      <label style={labelStyle}>Field Usage<select value={event.half} onChange={e => onChange(ev => ({...ev, half: e.target.value}))} style={inputStyle}>{HALF_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
      <label style={labelStyle}>Activity<select value={event.activity} onChange={e => onChange(ev => ({...ev, activity: e.target.value}))} style={inputStyle}>{Object.keys(ACTIVITY_COLORS).map(a => <option key={a}>{a}</option>)}</select></label>
      <label style={labelStyle}>Team / Label<input value={event.label} onChange={e => onChange(ev => ({...ev, label: e.target.value}))} placeholder="e.g. BHS Varsity Soccer" style={inputStyle} /></label>
    </div>
  );
}

function Modal({ children, onClose, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onClose}>
      <div style={{ background: "#1a1a1a", border: "1px solid #333", borderRadius: 16, padding: 28, maxWidth: wide ? 480 : 400, width: "92%", boxShadow: "0 20px 60px rgba(0,0,0,0.6)", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

const navBtn       = { background: "#1a1a1a", color: "#f97316", border: "1.5px solid #f97316", borderRadius: 8, padding: "5px 14px", cursor: "pointer", fontSize: 18, fontFamily: "inherit", fontWeight: 700, lineHeight: 1 };
const primaryBtn   = { background: "#f97316", color: "#000", border: "none", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 700, flex: 1 };
const secondaryBtn = { background: "#222", color: "#9ca3af", border: "1px solid #333", borderRadius: 8, padding: "9px 22px", cursor: "pointer", fontSize: 14, fontFamily: "inherit", fontWeight: 600 };
const inputStyle   = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1.5px solid #333", fontSize: 13, fontFamily: "inherit", boxSizing: "border-box", marginTop: 4, background: "#111", color: "#fff" };
const labelStyle   = { fontSize: 12, fontWeight: 700, color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.5, display: "flex", flexDirection: "column" };
