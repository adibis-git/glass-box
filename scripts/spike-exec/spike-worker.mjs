// Phase-0 spike: Pyodide kernel inside a Node worker_thread.
// Mirrors the semantics of public/pyodide-worker.js, adapted to worker_threads.

import { parentPort } from "node:worker_threads";
import { loadPyodide } from "pyodide";

let pyodide = null;
let outBuf = [];
let errBuf = [];

async function init(packageCacheDir) {
  const t0 = Date.now();
  pyodide = await loadPyodide({
    // Restrict what Python's `js` bridge can see (defense in depth; the
    // guardrail also blocks `import js` at the source level).
    jsglobals: Object.create(null),
    packageCacheDir,
    // Install stdio handlers at boot: inside worker_threads, Pyodide's default
    // fd-based writes throw ("fd argument must be of type number").
    stdout: (s) => outBuf.push(s + "\n"),
    stderr: (s) => errBuf.push(s + "\n"),
  });
  const tBoot = Date.now();
  await pyodide.loadPackage(["pandas", "numpy"]);
  const tPkgs = Date.now();

  pyodide.runPython("import pandas as pd\nimport numpy as np\nimport io");

  parentPort.postMessage({
    type: "ready",
    bootMs: tBoot - t0,
    pkgMs: tPkgs - tBoot,
  });
}

function loadDf(name, csv) {
  pyodide.globals.set("__csv__", csv);
  pyodide.runPython(`${name} = pd.read_csv(io.StringIO(__csv__))\ndel __csv__`);
  const rows = pyodide.runPython(`int(${name}.shape[0])`);
  parentPort.postMessage({ type: "df_loaded", name, rows });
}

function run(id, code) {
  outBuf = [];
  errBuf = [];
  let output = "";
  let isError = false;
  try {
    const val = pyodide.runPython(code);
    const stdout = outBuf.join("");
    let repr = "";
    if (val !== undefined && val !== null) {
      try {
        repr = String(val);
      } catch {
        repr = "";
      }
      if (val && typeof val.destroy === "function") {
        try { val.destroy(); } catch { /* ignore */ }
      }
    }
    output = (stdout.trim() ? stdout : repr).trim();
  } catch (err) {
    isError = true;
    output = String(err?.message || err);
  }
  parentPort.postMessage({ type: "result", id, output, isError });
}

parentPort.on("message", (msg) => {
  switch (msg.type) {
    case "init":
      init(msg.packageCacheDir).catch((e) =>
        parentPort.postMessage({ type: "init_error", message: String(e?.message || e) }),
      );
      break;
    case "load_df":
      loadDf(msg.name, msg.csv);
      break;
    case "run":
      run(msg.id, msg.code);
      break;
    case "hang":
      // Simulate a runaway loop so the main thread can prove terminate() works.
      pyodide.runPython("while True:\n  pass");
      break;
  }
});
