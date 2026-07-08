// Pyodide kernel — runs inside a Node worker_thread. One kernel per active
// conversation; holds pandas + one or more named dataframes in its globals.
//
// Proven by the Phase-0 spike (scripts/spike-exec). Timeouts are enforced by
// the parent (worker.terminate()); stdio handlers are installed at boot because
// Pyodide's default fd-writes throw inside worker_threads.

import { parentPort } from "node:worker_threads";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { loadPyodide } from "pyodide";

// Resolve pyodide's real package directory and pass it as an explicit indexURL.
// Without this, loadPyodide guesses its own location by parsing an error stack —
// which breaks under --enable-source-maps (set by the Next.js dev server and
// inherited by worker threads): stack paths get rewritten to pyodide's original
// source layout, yielding "Cannot find module .../node_modules/src/js/pyodide.asm.mjs".
const require = createRequire(import.meta.url);
const PYODIDE_DIR = dirname(require.resolve("pyodide"));

let pyodide = null;
let outBuf = [];
let errBuf = [];

async function init(packageCacheDir) {
  const t0 = Date.now();
  pyodide = await loadPyodide({
    indexURL: PYODIDE_DIR,
    // Defense in depth: hide Node globals from Python's `js` bridge
    // (the TS guardrail also rejects `import js` before code reaches us).
    jsglobals: Object.create(null),
    packageCacheDir,
    stdout: (s) => outBuf.push(s + "\n"),
    stderr: (s) => errBuf.push(s + "\n"),
  });
  await pyodide.loadPackage(["pandas", "numpy"]);
  pyodide.runPython("import pandas as pd\nimport numpy as np\nimport io");
  parentPort.postMessage({ type: "ready", ms: Date.now() - t0 });
}

function loadDf(alias, csv) {
  try {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(alias)) {
      throw new Error(`Invalid dataframe alias: ${alias}`);
    }
    pyodide.globals.set("__gb_csv__", csv);
    pyodide.runPython(`${alias} = pd.read_csv(io.StringIO(__gb_csv__))\ndel __gb_csv__`);
    const rows = pyodide.runPython(`int(${alias}.shape[0])`);
    const cols = pyodide.runPython(`int(${alias}.shape[1])`);
    parentPort.postMessage({ type: "df_loaded", alias, rows, cols });
  } catch (err) {
    parentPort.postMessage({ type: "df_error", alias, message: String(err?.message || err) });
  }
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
    const printed = stdout.trim() ? stdout : repr;
    const stderr = errBuf.join("");
    output = (stderr.trim() ? `${printed}\n${stderr}` : printed).trim();
    if (!output) {
      output = "(no output — remember to print() the values you want to observe)";
    }
  } catch (err) {
    isError = true;
    const stderr = errBuf.join("");
    output = `${stderr}\n${String(err?.message || err)}`.trim();
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
      loadDf(msg.alias, msg.csv);
      break;
    case "run":
      run(msg.id, msg.code);
      break;
  }
});
