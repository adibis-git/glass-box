#!/usr/bin/env node
// Glass Box eval harness (v3 §17). End-to-end smoke test against a running
// deployment — no deps beyond Node built-ins + global fetch/FormData/File.
//
//   node scripts/eval.mjs <BASE_URL> [email] [password]
//
// Env fallbacks: BASE_URL, EVAL_EMAIL, EVAL_PASSWORD.
//
// It signs up (or logs in), uploads public/samples/sales_prospects.csv, opens a
// conversation, and asserts:
//   (a) a quick-fact question returns NO report event
//   (b) a decision question returns a report event
//   (c) starterQuestions were generated for the conversation
// Prints PASS/FAIL per check; exits non-zero if any check fails.

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = (process.argv[2] ?? process.env.BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const EMAIL = process.argv[3] ?? process.env.EVAL_EMAIL ?? "eval@glassbox.test";
const PASSWORD = process.argv[4] ?? process.env.EVAL_PASSWORD ?? "evalpassword123";
const CSV_PATH = resolve(__dirname, "../public/samples/sales_prospects.csv");

// ── tiny cookie jar ─────────────────────────────────────────────────────────
const jar = new Map();
function absorb(res) {
  const setCookies = typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function req(path, opts = {}) {
  const headers = { ...(opts.headers ?? {}) };
  if (jar.size) headers.Cookie = cookieHeader();
  const res = await fetch(`${BASE_URL}${path}`, { ...opts, headers, redirect: "manual" });
  absorb(res);
  return res;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function die(msg) {
  console.error(`\n✖ ${msg}`);
  process.exit(1);
}

// ── auth ────────────────────────────────────────────────────────────────────
async function signupOrIgnore() {
  const res = await req("/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "Eval Bot" }),
  });
  if (res.status === 201) console.log(`  signed up ${EMAIL}`);
  else if (res.status === 409) console.log(`  account exists, will log in`);
  else {
    const j = await res.json().catch(() => ({}));
    die(`signup failed (${res.status}): ${j.error ?? "unknown"}`);
  }
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  const { csrfToken } = await csrfRes.json();
  if (!csrfToken) die("could not obtain CSRF token");

  const body = new URLSearchParams({
    csrfToken,
    email: EMAIL,
    password: PASSWORD,
    callbackUrl: BASE_URL,
  });
  await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  // Verify a real session exists.
  const sessRes = await req("/api/auth/session");
  const sess = await sessRes.json().catch(() => ({}));
  if (!sess?.user?.email) die("login failed — no session established");
  console.log(`  logged in as ${sess.user.email}`);
}

async function firstOrgId() {
  const res = await req("/api/orgs");
  const j = await res.json().catch(() => ({}));
  const org = j.orgs?.[0];
  if (!org?.id) die("no organization found for user");
  return org.id;
}

// ── dataset upload ──────────────────────────────────────────────────────────
async function uploadDataset(oid) {
  const buf = await readFile(CSV_PATH);
  const form = new FormData();
  form.append("file", new File([buf], "sales_prospects.csv", { type: "text/csv" }));
  const res = await req(`/api/orgs/${oid}/datasets`, { method: "POST", body: form });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.dataset?.id) die(`upload failed (${res.status}): ${j.error ?? "unknown"}`);
  const id = j.dataset.id;

  // Poll until READY.
  for (let i = 0; i < 40; i++) {
    const s = await req(`/api/orgs/${oid}/datasets/${id}`);
    const sj = await s.json().catch(() => ({}));
    const status = sj.dataset?.status;
    if (status === "READY") {
      console.log(`  dataset ready (${sj.dataset?.rowCount ?? "?"} rows)`);
      return id;
    }
    if (status === "ERROR") die(`dataset processing errored: ${sj.dataset?.errorMessage ?? ""}`);
    await sleep(1000);
  }
  die("dataset did not become READY in time");
}

// ── conversation + SSE run ──────────────────────────────────────────────────
async function createConversation(oid, datasetId) {
  const res = await req(`/api/orgs/${oid}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ datasets: [{ datasetId, alias: "prospects" }] }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.conversation?.id) die(`conversation create failed (${res.status}): ${j.error ?? "unknown"}`);
  return j.conversation.id;
}

async function starterQuestions(oid, convId) {
  const res = await req(`/api/orgs/${oid}/conversations`);
  const j = await res.json().catch(() => ({}));
  const conv = j.conversations?.find((c) => c.id === convId);
  const qs = conv?.starterQuestions;
  return Array.isArray(qs) ? qs : [];
}

/** POST a question, consume the SSE stream, return the set of event types seen. */
async function runQuestion(oid, convId, question) {
  const res = await req(`/api/orgs/${oid}/conversations/${convId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ question }),
  });
  if (!res.ok || !res.body) {
    const j = await res.json?.().catch(() => ({}));
    die(`run failed (${res.status}): ${j?.error ?? "no stream"}`);
  }

  const seen = new Set();
  const decoder = new TextDecoder();
  let buffer = "";
  let done = false;

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      let event = null;
      for (const line of block.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
      }
      if (event) {
        seen.add(event);
        if (event === "persisted" || event === "status") {
          // "status" done/error or the terminal "persisted" event → stop reading.
          if (event === "persisted") done = true;
        }
      }
    }
    if (done) break;
  }
  return seen;
}

// ── main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`Glass Box eval → ${BASE_URL}`);

  console.log("• auth");
  await signupOrIgnore();
  await login();
  const oid = await firstOrgId();

  console.log("• upload dataset");
  const datasetId = await uploadDataset(oid);

  console.log("• create conversation");
  const convId = await createConversation(oid, datasetId);

  console.log("• quick-fact run");
  const factEvents = await runQuestion(oid, convId, "How many prospects are in the dataset?");

  console.log("• decision run");
  const decisionEvents = await runQuestion(
    oid,
    convId,
    "Which prospects should we prioritize to maximize closed revenue next quarter, and why?",
  );

  const starters = await starterQuestions(oid, convId);

  // ── assertions ──
  const checks = [
    {
      name: "(a) quick-fact returns NO report event",
      pass: !factEvents.has("report"),
      detail: `events: ${[...factEvents].join(", ") || "none"}`,
    },
    {
      name: "(b) decision returns a report event",
      pass: decisionEvents.has("report"),
      detail: `events: ${[...decisionEvents].join(", ") || "none"}`,
    },
    {
      name: "(c) starterQuestions are generated",
      pass: starters.length > 0,
      detail: `${starters.length} starter question(s)`,
    },
  ];

  console.log("\nResults:");
  let failed = 0;
  for (const c of checks) {
    console.log(`  ${c.pass ? "PASS" : "FAIL"}  ${c.name}  —  ${c.detail}`);
    if (!c.pass) failed++;
  }

  console.log(`\n${failed === 0 ? "✔ all checks passed" : `✖ ${failed} check(s) failed`}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => die(e?.stack ?? String(e)));
