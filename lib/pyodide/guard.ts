// Safety guardrail for Claude-authored Python.
//
// Pyodide is already sandboxed (no real filesystem, no host network), but we
// reject dangerous-looking code *before* execution and surface the block in the
// audit trail. That makes the enterprise-safety story visible: the agent is
// governed, and every blocked action is shown, not hidden.

interface GuardRule {
  pattern: RegExp;
  label: string;
}

const RULES: GuardRule[] = [
  { pattern: /\b(import\s+os|from\s+os\b)/, label: "operating-system access (os)" },
  { pattern: /\b(import\s+sys|from\s+sys\b)/, label: "interpreter internals (sys)" },
  { pattern: /\bimport\s+subprocess\b/, label: "subprocess execution" },
  { pattern: /\bimport\s+shutil\b/, label: "filesystem operations (shutil)" },
  { pattern: /\b(import\s+pathlib|from\s+pathlib\b)/, label: "filesystem paths (pathlib)" },
  { pattern: /\b(import\s+socket|import\s+requests|import\s+urllib|import\s+http\b|import\s+ftplib)/, label: "network access" },
  { pattern: /\bimport\s+js\b/, label: "JavaScript bridge access (js)" },
  { pattern: /\bopen\s*\(/, label: "direct file I/O (open)" },
  { pattern: /\b__import__\s*\(/, label: "dynamic import (__import__)" },
  { pattern: /\b(eval|exec)\s*\(/, label: "dynamic code execution (eval/exec)" },
];

export interface GuardResult {
  allowed: boolean;
  /** Polite, agent-facing message explaining the block (used as the tool_result). */
  message?: string;
  label?: string;
}

export function guardCode(code: string): GuardResult {
  for (const rule of RULES) {
    if (rule.pattern.test(code)) {
      return {
        allowed: false,
        label: rule.label,
        message:
          `Blocked by the execution sandbox: this code appears to use ${rule.label}, ` +
          `which is not permitted. The dataframe is already loaded as \`df\`, and \`pd\` ` +
          `(pandas) and \`np\` (numpy) are available — you do not need to import anything ` +
          `or read files. Please rewrite the step using only in-memory dataframe operations.`,
      };
    }
  }
  return { allowed: true };
}
