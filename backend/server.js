const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "patients.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const PERMANENT_DEVELOPER = "Rakesh Poudel";
const DEFAULT_SETTINGS = {
  clinicName: "Sarthak Upachar Kendra",
  doctorName: "DR. Sujit Roy",
  address: "Biratchwok, Morang",
  developedBy: PERMANENT_DEVELOPER
};

app.use(cors());
app.use(express.json());
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(SETTINGS_FILE)) fs.writeFileSync(SETTINGS_FILE, JSON.stringify(DEFAULT_SETTINGS, null, 2));

const isoToday = () => new Date().toISOString().slice(0, 10);
function readPatients() { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")); } catch { return []; } }
function writePatients(data) { fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2)); }
function readSettings() { try { return { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE, "utf8")), developedBy: PERMANENT_DEVELOPER }; } catch { return DEFAULT_SETTINGS; } }
function writeSettings(data) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ ...data, developedBy: PERMANENT_DEVELOPER }, null, 2)); }
function makeId() { return Date.now().toString() + Math.random().toString(36).slice(2, 8); }
function normalize(p) {
  const visits = Array.isArray(p.visits) ? p.visits : [];
  const latest = visits[0] || {};
  return {
    ...p,
    visits,
    visitDate: p.visitDate || p.lastVisit || latest.visitDate || "",
    visitType: p.visitType || latest.visitType || "Medicine",
    facebookCommented: typeof p.facebookCommented === "boolean" ? p.facebookCommented : false
  };
}
function dueType(p) { return normalize(p).visitType || "Medicine"; }
function dueDate(p) { return p.followUpDate || ""; }
function dateOnly(value) { return String(value || "").slice(0, 10); }
function weekdayForDate(value) {
  const date = dateOnly(value);
  if (!date) return "";
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" });
}
function followUpRecords(patient) {
  const p = normalize(patient);
  const records = [];

  // Visit history is the most accurate source because each visit can have
  // its own follow-up date and treatment type.
  for (const visit of p.visits) {
    if (!visit.followUpDate) continue;
    records.push({
      followUpDate: dateOnly(visit.followUpDate),
      visitType: visit.visitType || "Medicine",
      visitDate: visit.visitDate || ""
    });
  }

  // Keep compatibility with older patient records that only have the
  // top-level followUpDate/visitType fields.
  if (p.followUpDate) {
    records.push({
      followUpDate: dateOnly(p.followUpDate),
      visitType: p.visitType || "Medicine",
      visitDate: p.visitDate || p.lastVisit || ""
    });
  }

  // Remove duplicate date/type combinations while preserving the newest
  // record first.
  const seen = new Set();
  return records.filter(r => {
    const key = `${r.followUpDate}|${r.visitType}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return Boolean(r.followUpDate);
  });
}
function uniquePatientCount(list) { return new Set(list.map(p => p.id)).size; }

app.get("/api/health", (req, res) => res.json({ ok: true, doctor: readSettings().doctorName }));

app.get("/api/settings", (req, res) => res.json(readSettings()));
app.put("/api/settings", (req, res) => {
  const body = req.body || {};
  const current = readSettings();
  const next = {
    clinicName: String(body.clinicName ?? current.clinicName).trim() || current.clinicName,
    doctorName: String(body.doctorName ?? current.doctorName).trim() || current.doctorName,
    address: String(body.address ?? current.address).trim() || current.address,
    developedBy: PERMANENT_DEVELOPER
  };
  writeSettings(next);
  res.json(next);
});

app.get("/api/patients", (req, res) => {
  let patients = readPatients().map(normalize);
  const q = String(req.query.q || "").trim().toLowerCase();
  const status = String(req.query.status || "").trim();
  if (q) patients = patients.filter(p => [p.name, p.phone, p.patientId, p.diagnosis, p.address].some(v => String(v || "").toLowerCase().includes(q)));
  if (status) patients = patients.filter(p => p.status === status);
  patients.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  res.json(patients);
});

app.get("/api/dashboard", (req, res) => {
  const patients = readPatients().map(normalize), today = isoToday();
  const total = patients.length;
  const active = patients.filter(p => p.status !== "Treatment Completed").length;
  const completed = patients.filter(p => p.status === "Treatment Completed").length;
  const completedToday = patients.filter(p => dateOnly(p.completedAt) === today).length;
  const due = patients.filter(p => p.status !== "Treatment Completed" && dueDate(p) === today).length;
  const treatmentCompleted = patients.filter(p => p.status === "Treatment Completed").sort((a, b) => dateOnly(b.completedAt).localeCompare(dateOnly(a.completedAt)));
  res.json({ total, active, completed, completedToday, due, treatmentCompleted });
});

app.get("/api/followups", (req, res) => {
  const date = dateOnly(req.query.date);
  const day = String(req.query.day || "");
  const type = String(req.query.type || "");
  const patients = [];

  for (const raw of readPatients()) {
    const patient = normalize(raw);
    if (patient.status === "Treatment Completed") continue;

    const matches = followUpRecords(patient).filter(record => {
      if (date && record.followUpDate !== date) return false;
      if (day && day !== "All Days" && weekdayForDate(record.followUpDate) !== day) return false;
      if (type && record.visitType !== type) return false;
      return true;
    });

    if (!matches.length) continue;

    // Return the matching follow-up date/type so the UI always displays the
    // patient under the correct Medicine/Dressing category.
    const match = matches[0];
    patients.push({ ...patient, followUpDate: match.followUpDate, visitType: match.visitType });
  }

  res.json(patients.sort((a, b) => a.followUpDate.localeCompare(b.followUpDate)));
});

// Monthly report: one row per month for the selected year.
// Active Patients = unique patients who were active at any point during that month.
// Treatment Completed = unique patients whose completion date falls in that month.
app.get("/api/reports/yearly", (req, res) => {
  const year = Number(req.query.year);
  if (!year || year < 2000 || year > 2100) return res.status(400).json({ message: "A valid year is required" });
  const patients = readPatients().map(normalize);
  const rows = [];
  for (let month = 1; month <= 12; month++) {
    const prefix = `${year}-${String(month).padStart(2, "0")}`;
    const activePatients = patients.filter(p => {
      const created = dateOnly(p.createdAt);
      const completed = dateOnly(p.completedAt);
      const monthStart = `${prefix}-01`;
      const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
      return created <= monthEnd && (!completed || completed >= monthStart) && p.status !== "Treatment Completed" || (completed && completed >= monthStart && completed <= monthEnd);
    });
    const completedPatients = patients.filter(p => dateOnly(p.completedAt).startsWith(prefix));
    rows.push({
      month,
      monthName: new Date(year, month - 1, 1).toLocaleDateString("en-US", { month: "long" }),
      active: uniquePatientCount(activePatients),
      completed: uniquePatientCount(completedPatients)
    });
  }
  res.json({ year, rows });
});

// Backward-compatible single-month endpoint.
app.get("/api/reports/monthly", (req, res) => {
  const month = Number(req.query.month), year = Number(req.query.year);
  if (!month || !year) return res.status(400).json({ message: "month and year are required" });
  const patients = readPatients().map(normalize);
  const days = new Date(year, month, 0).getDate();
  const rows = [];
  for (let d = 1; d <= days; d++) {
    const date = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const active = patients.filter(p => {
      const created = dateOnly(p.createdAt), completed = dateOnly(p.completedAt);
      return created <= date && (!completed || completed > date);
    }).length;
    const completed = patients.filter(p => dateOnly(p.completedAt) === date).length;
    rows.push({ date, day: new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "long" }), active, completed });
  }
  res.json({ year, month, days: rows });
});

app.post("/api/patients", (req, res) => {
  const body = req.body || {};
  if (!String(body.name || "").trim()) return res.status(400).json({ message: "Patient name is required." });
  const patients = readPatients();
  const patient = {
    id: makeId(), patientId: body.patientId || `PAT-${String(patients.length + 1).padStart(4, "0")}`,
    name: String(body.name).trim(), age: body.age ?? "", gender: body.gender || "", phone: body.phone || "", address: body.address || "", facebook: body.facebook || "",
    diagnosis: body.diagnosis || "", treatment: body.treatment || "", notes: body.notes || "", status: body.status || "Active",
    lastVisit: body.lastVisit || isoToday(), visitDate: body.lastVisit || isoToday(), visitType: ["Medicine","First Dressing","Second Dressing"].includes(body.visitType) ? body.visitType : "Medicine", followUpDate: body.followUpDate || "",
    facebookCommented: Boolean(body.facebookCommented), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    completedAt: body.status === "Treatment Completed" ? (body.completedAt || new Date().toISOString()) : null, visits: []
  };
  patients.push(patient); writePatients(patients); res.status(201).json(patient);
});

app.put("/api/patients/:id", (req, res) => {
  const patients = readPatients(); const i = patients.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Patient not found." });
  const old = normalize(patients[i]);
  const body = { ...req.body };
  const allowedTypes = ["Medicine","First Dressing","Second Dressing"];
  const updated = {
    ...old,
    ...body,
    id: old.id,
    patientId: old.patientId,
    updatedAt: new Date().toISOString(),
    visits: old.visits,
    visitDate: body.lastVisit || body.visitDate || old.visitDate,
    visitType: allowedTypes.includes(body.visitType) ? body.visitType : old.visitType
  };
  delete updated.nextVisit;
  delete updated.nextVisitType;
  if (updated.status === "Treatment Completed" && old.status !== "Treatment Completed") updated.completedAt = req.body.completedAt || new Date().toISOString();
  if (updated.status !== "Treatment Completed") updated.completedAt = null;
  patients[i] = updated; writePatients(patients); res.json(updated);
});

app.post("/api/patients/:id/complete", (req, res) => {
  const patients = readPatients(); const i = patients.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Patient not found." });
  patients[i] = normalize(patients[i]); patients[i].status = "Treatment Completed"; patients[i].completedAt = req.body?.completedAt || new Date().toISOString(); patients[i].updatedAt = new Date().toISOString();
  if (typeof req.body?.facebookCommented === "boolean") patients[i].facebookCommented = req.body.facebookCommented;
  writePatients(patients); res.json(patients[i]);
});

app.post("/api/patients/:id/visits", (req, res) => {
  const patients = readPatients(); const i = patients.findIndex(p => p.id === req.params.id);
  if (i < 0) return res.status(404).json({ message: "Patient not found." });
  patients[i] = normalize(patients[i]);
  const body = req.body || {};
  const allowedTypes = ["Medicine","First Dressing","Second Dressing"];
  const visit = { id: makeId(), visitDate: body.visitDate || isoToday(), visitType: allowedTypes.includes(body.visitType) ? body.visitType : "Medicine", followUpDate: body.followUpDate || "", notes: body.notes || "", createdAt: new Date().toISOString() };
  patients[i].visits.unshift(visit); patients[i].lastVisit = visit.visitDate; patients[i].visitDate = visit.visitDate; patients[i].visitType = visit.visitType; patients[i].followUpDate = visit.followUpDate; patients[i].updatedAt = new Date().toISOString();
  delete patients[i].nextVisit;
  delete patients[i].nextVisitType;
  writePatients(patients); res.status(201).json(patients[i]);
});

app.delete("/api/patients/:id", (req, res) => { const patients = readPatients(); const next = patients.filter(p => p.id !== req.params.id); if (next.length === patients.length) return res.status(404).json({ message: "Patient not found." }); writePatients(next); res.json({ ok: true }); });

app.listen(PORT, () => console.log(`Doctor Patient Tracker API running on http://localhost:${PORT}`));
