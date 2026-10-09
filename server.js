const express = require("express");
const path = require("node:path");

const app = express();
const root = __dirname;

app.use(express.json({ limit: "16kb" }));

let database = null;
try {
  const Database = require("better-sqlite3");
  const databasePath = process.env.SQLITE_PATH || (process.env.VERCEL ? "/tmp/leads.sqlite" : path.join(root, "leads.sqlite"));
  database = new Database(databasePath);
  database.pragma("journal_mode = WAL");
  database.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL CHECK (role IN ('Student', 'Parent')),
      course TEXT NOT NULL,
      phone TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0 CHECK (score BETWEEN 0 AND 3),
      result TEXT NOT NULL CHECK (result IN ('started', 'won', 'lost')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'synced'))
    )
  `);
} catch (err) {
  console.warn("SQLite initialization warning (running in serverless static mode):", err.message);
}

const allowedCourses = new Set(["Technology", "Business", "Computers", "Pharmacy", "Teaching", "Technical Skills"]);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.put("/api/leads/:id", (request, response) => {
  if (!database) {
    return response.json({ ok: true, id: request.params.id, note: "stored in client" });
  }

  const body = request.body || {};
  const lead = {
    id: request.params.id,
    name: typeof body.name === "string" ? body.name.trim() : "",
    role: body.role,
    course: body.course,
    phone: body.phone,
    registeredAt: body.registeredAt,
    score: body.score,
    result: body.result,
    status: body.status,
  };

  if (
    !lead.id || lead.id.length > 100 ||
    (body.id && body.id !== lead.id) ||
    !lead.name || lead.name.length > 60 || !/^[A-Za-z\s]+$/.test(lead.name) ||
    !["Student", "Parent"].includes(lead.role) ||
    !allowedCourses.has(lead.course) ||
    typeof lead.phone !== "string" || !/^[6-9]\d{9}$/.test(lead.phone) ||
    typeof lead.registeredAt !== "string" || !Number.isFinite(Date.parse(lead.registeredAt)) ||
    !Number.isInteger(lead.score) || lead.score < 0 || lead.score > 3 ||
    !["started", "won", "lost"].includes(lead.result) ||
    !["pending", "completed", "synced"].includes(lead.status)
  ) {
    return response.status(400).json({ error: "Invalid lead data." });
  }

  try {
    const saveLead = database.prepare(`
      INSERT INTO leads (id, name, role, course, phone, registered_at, score, result, status)
      VALUES (@id, @name, @role, @course, @phone, @registeredAt, @score, @result, @status)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        role = excluded.role,
        course = excluded.course,
        phone = excluded.phone,
        registered_at = excluded.registered_at,
        score = excluded.score,
        result = excluded.result,
        status = excluded.status
    `);
    saveLead.run(lead);
  } catch (e) {
    console.error("Save error:", e);
  }

  response.json({ ok: true, id: lead.id });
});

app.get("/api/admin/leads", (request, response) => {
  const password = request.headers["x-admin-password"];
  if (password !== "9630") {
    return response.status(401).json({ error: "Unauthorized. Incorrect password." });
  }
  if (!database) {
    return response.json({ ok: true, leads: [] });
  }
  try {
    const leads = database.prepare("SELECT * FROM leads ORDER BY registered_at DESC").all();
    response.json({ ok: true, leads });
  } catch {
    response.json({ ok: true, leads: [] });
  }
});

app.use(express.static(root));
app.get("/", (_request, response) => response.sendFile(path.join(root, "index.html")));

if (!process.env.VERCEL) {
  const port = Number(process.env.PORT || 3000);
  app.listen(port, "0.0.0.0", () => {
    console.log(`Quiz server running at http://localhost:${port}`);
  });
}

module.exports = app;