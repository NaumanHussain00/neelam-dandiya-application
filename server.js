const express = require("express");
const Database = require("better-sqlite3");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const app = express();
const port = Number(process.env.PORT || 3000);
const root = __dirname;
const databasePath = process.env.SQLITE_PATH || (process.env.VERCEL ? "/tmp/leads.sqlite" : path.join(root, "leads.sqlite"));
const legacyDatabasePath = path.join(os.homedir(), ".neelam-dandiya-quiz", "leads.sqlite");
const allowedCourses = new Set(["Technology", "Business", "Computers", "Pharmacy", "Teaching", "Technical Skills"]);

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
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

database.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
const legacyImport = database.prepare("SELECT value FROM app_meta WHERE key = ?").get("legacy-home-database");
if (!process.env.SQLITE_PATH && !legacyImport && fs.existsSync(legacyDatabasePath)) {
  const legacyDatabase = new Database(legacyDatabasePath, { readonly: true });
  try {
    const legacyLeads = legacyDatabase.prepare(`
      SELECT id, name, role, course, phone, registered_at AS registeredAt, score, result, status
      FROM leads
    `).all();
    database.transaction((leads) => {
      for (const lead of leads) saveLead.run(lead);
      database.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run("legacy-home-database", "imported");
    })(legacyLeads);
    console.log(`Imported ${legacyLeads.length} existing lead(s) from the home-folder database.`);
  } finally {
    legacyDatabase.close();
  }
}

app.use(express.json({ limit: "16kb" }));

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.put("/api/leads/:id", (request, response) => {
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

  saveLead.run(lead);
  response.json({ ok: true, id: lead.id });
});

app.get("/api/admin/leads", (request, response) => {
  const password = request.headers["x-admin-password"];
  if (password !== "9630") {
    return response.status(401).json({ error: "Unauthorized. Incorrect password." });
  }
  const leads = database.prepare("SELECT * FROM leads ORDER BY registered_at DESC").all();
  response.json({ ok: true, leads });
});

app.use(express.static(root));
app.get("/", (_request, response) => response.sendFile(path.join(root, "index.html")));

if (!process.env.VERCEL) {
  app.listen(port, "0.0.0.0", () => {
    console.log(`Quiz: http://localhost:${port}`);
    const addresses = Object.values(os.networkInterfaces())
      .flat()
      .filter((network) => network && network.family === "IPv4" && !network.internal)
      .map((network) => `http://${network.address}:${port}`);
    if (addresses.length) console.log(`Network: ${addresses.join(", ")}`);
    console.log(`SQLite: ${databasePath}`);
  });
}

module.exports = app;