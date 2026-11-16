import express from "express";
import pg from "pg";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const { Pool } = pg;
const app = express();
const dir = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false });
app.use(express.json({ limit: "5kb" }));

// Safe to run on every start; also upgrades the original three-event table.
const ready = (async () => {
  await pool.query(`CREATE TABLE IF NOT EXISTS activity (
    id BIGSERIAL PRIMARY KEY,
    event TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    session_id TEXT,
    question_number INTEGER,
    duration_seconds INTEGER
  )`);
  await pool.query(`ALTER TABLE activity ADD COLUMN IF NOT EXISTS session_id TEXT`);
  await pool.query(`ALTER TABLE activity ADD COLUMN IF NOT EXISTS question_number INTEGER`);
  await pool.query(`ALTER TABLE activity ADD COLUMN IF NOT EXISTS duration_seconds INTEGER`);
  await pool.query(`ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_event_check`);
  await pool.query(`ALTER TABLE activity ADD CONSTRAINT activity_event_check CHECK (event IN ('visit','message_open','instagram_click','game_start','game_question','game_answer','game_complete'))`);
})();
function equal(a, b) { const x = Buffer.from(String(a || "")), y = Buffer.from(String(b || "")); return x.length === y.length && crypto.timingSafeEqual(x, y); }
function admin(req, res, next) {
  const h = req.headers.authorization || "", [scheme, token] = h.split(" "); let decoded = "";
  try { if (scheme === "Basic" && token) decoded = Buffer.from(token, "base64").toString("utf8"); } catch {}
  const i = decoded.indexOf(":"), u = i < 0 ? "" : decoded.slice(0, i), p = i < 0 ? "" : decoded.slice(i + 1);
  if (u !== (process.env.ADMIN_USER || "nikhil") || !process.env.ADMIN_PASSWORD || !equal(p, process.env.ADMIN_PASSWORD)) {
    res.set("WWW-Authenticate", 'Basic realm="Private visitor dashboard"'); return res.status(401).send("Sign in required.");
  }
  next();
}
app.post("/api/track", async (req, res) => {
  const { event, sessionId, questionNumber, durationSeconds } = req.body || {};
  const allowed = ["visit", "message_open", "instagram_click", "game_start", "game_question", "game_answer", "game_complete"];
  if (!allowed.includes(event)) return res.status(400).end();
  const sid = typeof sessionId === "string" && /^[a-f0-9-]{20,40}$/i.test(sessionId) ? sessionId : null;
  const qn = Number.isInteger(questionNumber) && questionNumber >= 1 && questionNumber <= 10 ? questionNumber : null;
  const dur = Number.isInteger(durationSeconds) && durationSeconds >= 0 && durationSeconds <= 3600 ? durationSeconds : null;
  try {
    await ready;
    await pool.query("INSERT INTO activity(event, session_id, question_number, duration_seconds) VALUES($1,$2,$3,$4)", [event, sid, qn, dur]);
    res.status(204).end();
  } catch (err) { console.error(err); res.status(503).json({ error: "Tracking unavailable" }); }
});
app.get("/admin", admin, async (req, res) => {
  try {
    await ready;
    const [counts, recent, sessions] = await Promise.all([
      pool.query(`SELECT COUNT(*) FILTER(WHERE event='visit')::int visits,
        COUNT(*) FILTER(WHERE event='message_open')::int opens,
        COUNT(*) FILTER(WHERE event='instagram_click')::int clicks,
        COUNT(*) FILTER(WHERE event='game_start')::int games_started,
        COUNT(*) FILTER(WHERE event='game_complete')::int games_completed FROM activity`),
      pool.query(`SELECT event, question_number, duration_seconds,
        to_char(created_at AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY, HH12:MI:SS AM') time
        FROM activity ORDER BY id DESC LIMIT 100`),
      pool.query(`SELECT session_id,
        to_char(MIN(created_at) AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY, HH12:MI:SS AM') started,
        to_char(MAX(created_at) AT TIME ZONE 'Asia/Kolkata','DD Mon YYYY, HH12:MI:SS AM') last_seen,
        COALESCE(MAX(question_number),0)::int highest_question,
        BOOL_OR(event='game_complete') completed,
        COALESCE(SUM(duration_seconds) FILTER(WHERE event='game_answer'),0)::int active_seconds
        FROM activity WHERE session_id IS NOT NULL GROUP BY session_id ORDER BY MAX(created_at) DESC LIMIT 50`)
    ]);
    const x = counts.rows[0];
    const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const rows = recent.rows.map(v => `<tr><td>${esc(v.time)}</td><td>${esc(v.event.replaceAll("_", " "))}</td><td>${v.question_number ? `Question ${v.question_number}/10` : "—"}</td><td>${v.duration_seconds == null ? "—" : `${v.duration_seconds}s`}</td></tr>`).join("");
    const sr = sessions.rows.map(v => `<tr><td>${esc(v.started)}</td><td>${v.highest_question}/10</td><td>${v.completed ? "Completed" : "In progress / left early"}</td><td>${Math.floor(v.active_seconds/60)}m ${v.active_seconds%60}s</td><td>${esc(v.last_seen)}</td></tr>`).join("");
    res.set("Cache-Control", "no-store").type("html").send(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Private dashboard</title><style>
      *{box-sizing:border-box}body{font:14px system-ui;background:#fff7fb;color:#4a1730;margin:0;padding:18px}.wrap{max-width:1000px;margin:auto}h1{font-size:25px}.box{background:white;border:1px solid #f4c5d8;border-radius:18px;padding:16px;margin:14px 0;overflow:auto}.stats{display:grid;grid-template-columns:repeat(5,1fr);gap:9px}.stat{background:#fff0f6;border-radius:12px;padding:12px}.num{font-size:27px;font-weight:bold;color:#be185d}small,.muted{color:#8b5570}table{width:100%;border-collapse:collapse;min-width:570px}td,th{text-align:left;padding:10px 8px;border-bottom:1px solid #f5d9e5}th{color:#9d174d}@media(max-width:650px){.stats{grid-template-columns:repeat(2,1fr)}.stat:last-child{grid-column:span 2}}</style></head><body><main class="wrap"><h1>💗 Nikhil's private dashboard</h1><p class="muted">Anonymous activity summary · Times in India Standard Time (IST)</p>
      <div class="stats"><div class="stat"><small>Total visits</small><div class="num">${x.visits}</div></div><div class="stat"><small>Message opens</small><div class="num">${x.opens}</div></div><div class="stat"><small>Instagram clicks</small><div class="num">${x.clicks}</div></div><div class="stat"><small>Games started</small><div class="num">${x.games_started}</div></div><div class="stat"><small>Games completed</small><div class="num">${x.games_completed}</div></div></div>
      <section class="box"><h2>🎀 Game sessions</h2><p class="muted">Shows the highest question reached, whether the game was completed, active answer time, and timestamps. A session is an anonymous browser-generated ID, not a person's identity.</p><table><thead><tr><th>Started (IST)</th><th>Level reached</th><th>Status</th><th>Answer time</th><th>Last activity (IST)</th></tr></thead><tbody>${sr || '<tr><td colspan="5">No game activity yet.</td></tr>'}</tbody></table></section>
      <section class="box"><h2>Recent activity</h2><table><thead><tr><th>Time (IST)</th><th>Activity</th><th>Level</th><th>Time spent</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No activity yet.</td></tr>'}</tbody></table></section>
      <small>Anonymous event data only. No visitor names, IP addresses, answers, or precise location are stored. Activity cannot prove that a visitor is Sahana.</small></main></body></html>`);
  } catch (e) { console.error(e); res.status(503).send("Dashboard unavailable"); }
});
app.use(express.static(path.join(dir, "public")));
app.get("/", (req, res) => res.sendFile(path.join(dir, "public/index.html")));
app.listen(process.env.PORT || 3000, () => console.log("Website started"));
