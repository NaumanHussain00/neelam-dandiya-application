const express = require("express");
const path = require("node:path");

const app = express();
const root = __dirname;

app.use(express.json({ limit: "16kb" }));

let database = null;
let databaseType = "sqlite";

const databaseUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.NEON_DATABASE_URL;

if (databaseUrl) {
  const { Pool } = require("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  database = pool;
  databaseType = "postgres";
  pool.query(`
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
  `).catch((err) => {
    console.error("Postgres initialization error:", err);
  });
} else {
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
}

function normalizeLeadRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    course: row.course,
    phone: row.phone,
    registered_at: row.registered_at ?? row.registeredAt ?? null,
    registeredAt: row.registered_at ?? row.registeredAt ?? null,
    score: Number(row.score ?? 0),
    result: row.result,
    status: row.status,
  };
}

const allowedCourses = new Set(["Technology", "Business", "Computers", "Pharmacy", "Teaching", "Technical Skills"]);

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.put("/api/leads/:id", async (request, response) => {
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
    if (databaseType === "postgres") {
      await database.query(`
        INSERT INTO leads (id, name, role, course, phone, registered_at, score, result, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (id) DO UPDATE SET
          name = EXCLUDED.name,
          role = EXCLUDED.role,
          course = EXCLUDED.course,
          phone = EXCLUDED.phone,
          registered_at = EXCLUDED.registered_at,
          score = EXCLUDED.score,
          result = EXCLUDED.result,
          status = EXCLUDED.status
      `, [lead.id, lead.name, lead.role, lead.course, lead.phone, lead.registeredAt, lead.score, lead.result, lead.status]);
    } else {
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
      saveLead.run({
        id: lead.id,
        name: lead.name,
        role: lead.role,
        course: lead.course,
        phone: lead.phone,
        registeredAt: lead.registeredAt,
        score: lead.score,
        result: lead.result,
        status: lead.status,
      });
    }
  } catch (e) {
    console.error("Save error:", e);
    return response.status(500).json({ error: "Failed to save lead." });
  }

  response.json({ ok: true, id: lead.id });
});

app.get("/api/admin/leads", async (request, response) => {
  const password = request.headers["x-admin-password"];
  if (password !== "9630") {
    return response.status(401).json({ error: "Unauthorized. Incorrect password." });
  }
  if (!database) {
    return response.json({ ok: true, leads: [] });
  }

  try {
    if (databaseType === "postgres") {
      const result = await database.query("SELECT * FROM leads ORDER BY registered_at DESC");
      return response.json({ ok: true, leads: result.rows.map(normalizeLeadRecord) });
    }

    const leads = database.prepare("SELECT * FROM leads ORDER BY registered_at DESC").all();
    response.json({ ok: true, leads: leads.map(normalizeLeadRecord) });
  } catch (error) {
    console.error("Read error:", error);
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