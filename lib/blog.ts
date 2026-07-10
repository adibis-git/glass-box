// Blog content for the Glass Box marketing site. Posts are authored inline as
// markdown strings and rendered by the shared <Markdown> component. Keep this
// file the single source of truth for the blog — the index and [slug] pages
// both read from POSTS via the helpers below.

export type Post = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO-ish "YYYY-MM-DD"
  author: string;
  readMinutes: number;
  tag: string;
  body: string; // markdown
};

export const POSTS: Post[] = [
  {
    slug: "every-enterprise-is-buying-ai",
    title: "Every enterprise is buying AI. Few operationalize it.",
    excerpt:
      "A raw API key gives you a model. It doesn't give your finance lead a governed analyst that knows their role, cites the clause, and checks its own math. That last mile is the product.",
    date: "2026-07-08",
    author: "The Glass Box Team",
    readMinutes: 6,
    tag: "Thesis",
    body: `Almost every enterprise now has an AI budget. Model access is a line item, a procurement checkbox, a Slack channel full of prompt tips. And yet, walk into most of those same companies six months later and ask a simple question — *"which decisions does your team now make faster because of AI?"* — and the room goes quiet.

The gap is not access. The gap is **operationalization**.

## Buying a model is not the same as owning an analyst

An API key gives you a model endpoint. What it does not give you is any of the things that make a model useful to a real team making real decisions:

- It doesn't know that the person asking is a **finance lead** with a VIEWER role on last quarter's board deck.
- It doesn't **profile the spreadsheet** before it answers, so it guesses at column meanings.
- It doesn't **cite the clause** in the contract it just summarized, so nobody can check it.
- It doesn't **verify its own arithmetic**, so a plausible-looking number ships unchecked.
- It doesn't keep an **audit trail**, so when the CFO asks "where did this come from," there is no answer.
- It doesn't run **where the data has to stay**, so the sensitive file never gets uploaded in the first place.

Every one of those is a last-mile problem. And the last mile — the prompts, the sandbox, the retrieval, the agent loop, the role checks, the self-hosting — is where the value actually lives. It is also, not coincidentally, the part that is hard and unglamorous to build.

## Why pilots stall

The typical enterprise AI pilot follows a predictable arc. Someone builds an impressive demo on a clean dataset. Leadership is excited. Then the pilot meets reality:

1. **Trust.** An analyst pastes a number from the model into a deck, a colleague can't reproduce it, and the whole output becomes suspect.
2. **Governance.** Legal asks who can see what, and the answer is "everyone with the link."
3. **Data.** Security points out that the sensitive files can't leave the building, and the tool requires uploading them to someone else's cloud.

None of these are model problems. A better model does not fix any of them. They are **product and governance** problems, and they are exactly the problems a pilot built on raw API access is structured to ignore.

## What operationalizing actually requires

Turning "we have AI" into "our team owns a governed analyst" means putting a system around the model:

- **A coordinator** that reads intent and routes the work — a quick lookup gets a quick answer; a decision question escalates to a verified report.
- **Workers** that do the right kind of reasoning for the right kind of source: real Python in a sandbox for tabular data, retrieval-and-cite for documents.
- **A verifier** that grounds every number against the underlying computation before it appears in a report.
- **Governance** that is enforced on every request — roles, audit, retention — not bolted on as an afterthought.
- **A deployment model** that respects where data must live.

That is a lot of surface area. It is also precisely the surface area that separates a clever demo from a tool a team relies on every week.

## Glass Box is that last mile

Glass Box exists to close this gap. It is not another chat window. It is a **governed AI analyst** — powered by claude-sonnet-5 — that reasons over your spreadsheets and documents, shows its work, checks itself, and runs **self-hosted on your own infrastructure** so the data never leaves.

The public app is a showcase. The real offering is a customized deployment tuned to your organization's roles, sources, and retention policies. You get the last mile as a product, ready to run where your data already lives.

Buying AI was the easy part. Operationalizing it — into decisions your team actually owns — is the work. That work is the product.`,
  },
  {
    slug: "why-we-self-host",
    title: "Why we self-host: your data should never leave your infrastructure",
    excerpt:
      "The fastest way to leak a contract, a cap table, or PHI is to paste it into a public chatbot. Glass Box takes the opposite position: the analyst comes to your data, not the other way around.",
    date: "2026-07-06",
    author: "The Glass Box Team",
    readMinutes: 7,
    tag: "Security",
    body: `There is a quiet risk running through most enterprise AI adoption right now, and it has nothing to do with model quality. It is this: the moment a useful tool asks someone to **upload the sensitive file**, the sensitive file gets uploaded.

A cap table. A signed MSA. A patient roster. A pricing model. These are the exact documents where an AI analyst would be most valuable — and the exact documents that must never end up in a system you don't control.

## The default posture is backwards

Most AI tools ask your data to travel to them. You take the contract that lives inside your walls, and you paste it into a window on someone else's cloud. Even when the vendor is reputable, you have now:

- Created a **copy** of sensitive data outside your governance boundary.
- Made that copy subject to **someone else's** breach exposure, subpoena surface, and retention defaults.
- Lost the ability to answer, with certainty, "who can see this and for how long?"

The convenience is real, which is why it happens. But convenience is a poor trade for handing your most sensitive material to a system you can't audit.

## Glass Box takes the opposite position

Glass Box is **self-hosted by design**. The analyst comes to your data; your data does not come to the analyst. Concretely:

- The software runs in **your environment** — Docker Compose or your VPC.
- Sources, workspace records, and audit logs live in **your** Postgres and object storage.
- There is **no data egress by default**. There is no copy of your files sitting on our servers, because we never receive them.

When the analyst needs the model, the call originates **from your infrastructure**, under **your** provider credentials. Glass Box is not an intermediary standing between your data and the model.

## "But surely the whole file goes to the model?"

No — and this is the part people expect to be a compromise but isn't. Glass Box is deliberate about **what reaches the model**. It does not upload whole files. Instead the model sees:

- a **schema** and a small representative **sample** of a spreadsheet, and
- **cited passages** retrieved from a document — the specific clauses relevant to the question.

The bulk of the data stays put. Analytical work on the full dataset runs as real **Python in a sandbox** on your side, not by feeding rows to a language model one at a time. The model reasons over structure and evidence; your data reasons over itself.

## Self-hosting is what makes governance real

Once the data stays in your environment, governance stops being a promise and becomes a property of the system:

- **Role-based access control** — OWNER, ADMIN, MEMBER, VIEWER — enforced on every request at the data layer.
- **Audit logging** of every upload, query, run, guardrail block, share, and deletion.
- **Configurable retention** with **hard deletion**, set to match your policies, not a vendor's defaults.
- **Tenancy isolation** so one workspace can never read another's sources.

You can't meaningfully offer any of that if the data is scattered across a system you don't operate. Self-hosting is the foundation that lets the rest be true.

## The wedge, stated plainly

The reason self-hosting matters is not ideology. It is that the highest-value AI work in an enterprise is exactly the work on the most sensitive data — and that work is precisely what a paste-into-a-chatbot workflow makes reckless.

Glass Box's answer is to move the analyst, not the data. Your infrastructure, your credentials, your audit trail, your retention. **Powered by claude-sonnet-5**, running where your data already lives, so the most useful questions are also the safe ones to ask.`,
  },
  {
    slug: "show-your-work",
    title: "Show your work: why an AI analyst must cite its evidence",
    excerpt:
      "A number you can't trace is a rumor. Glass Box runs Python for data, cites clauses for documents, and verifies every figure — so an answer arrives with its evidence attached.",
    date: "2026-07-03",
    author: "The Glass Box Team",
    readMinutes: 6,
    tag: "Product",
    body: `Ask a language model for a number and it will give you one. It will be confident, well-formatted, and frequently right. The problem is the word *frequently*. In a decision that matters, a number you cannot trace back to its source is not a fact — it is a rumor with good formatting.

The name **Glass Box** is a direct rejection of the black box. An analyst your team relies on has to **show its work**.

## Two kinds of source, two kinds of evidence

"Show your work" means different things for a spreadsheet than for a contract, and Glass Box treats them differently on purpose.

### For data: run real Python

When the question is about tabular data, Glass Box does not ask the model to eyeball rows and estimate. It writes and runs **real Python** in a sandboxed kernel against your actual dataset. The evidence for a number is the **code that produced it** — reproducible, inspectable, and run over the whole table rather than a sampled fragment.

That means when the report says revenue grew 12%, there is a computation behind that figure you can open and read. Not a vibe. A calculation.

### For documents: cite the clause

When the question is about a document, Glass Box **retrieves and cites**. It finds the specific passages that bear on the question and anchors the answer to the **exact wording** — the clause, the sentence, the section. The answer to "what's the termination notice period?" comes back attached to the paragraph that says so.

This is the difference between "the contract probably allows 30 days" and "§8.2 requires 30 days' written notice," with §8.2 right there to read.

## The verifier: numbers get checked before they ship

Generating a number and trusting a number are two different acts. Glass Box separates them. Before a figure appears in a decision report, a **verifier** grounds it against the underlying computation. If the narrative claims a total the Python didn't produce, that mismatch gets caught rather than shipped.

This is deliberately unglamorous, and it is the whole point. The failure mode of AI analysis isn't usually a wild hallucination — it's a plausible number that's subtly wrong and that nobody checked because it looked fine. A verifier exists precisely to check the numbers that look fine.

## Why evidence changes how teams use the tool

When every answer arrives with its evidence attached, three things change:

1. **Review gets faster, not slower.** A reviewer checks the citation or the computation directly instead of re-deriving the whole analysis from scratch.
2. **Trust compounds.** The first time someone traces a number to its source and it holds up, they start to rely on the tool. The first time a black box is wrong and unaccountable, they stop.
3. **Disagreements get productive.** Two people arguing about a conclusion can look at the same clause or the same code, instead of arguing about what the model "meant."

## Evidence is a governance feature too

Showing work isn't only about correctness — it's about accountability. Because Glass Box cites sources and records how an answer was produced, and because every action lands in the **audit log**, "where did this come from?" always has an answer. That is what an enterprise actually needs when a number ends up in a board deck.

A glass box, not a black box. Python for data, clauses for documents, a verifier for the numbers. An answer you can trust is an answer you can trace — so Glass Box makes sure you always can.`,
  },
  {
    slug: "from-spreadsheet-to-decision-report",
    title: "From spreadsheet to decision report: how a question becomes a governed answer",
    excerpt:
      "A question doesn't go straight to a model. It goes through a coordinator, to the right workers, through a verifier, and out as a report — with an effort dial and intent gating along the way.",
    date: "2026-06-30",
    author: "The Glass Box Team",
    readMinutes: 7,
    tag: "Architecture",
    body: `When you ask Glass Box a question, it does not simply forward your words to a language model and stream back whatever comes out. Between your question and the answer sits a small, deliberate system. Understanding that system is the best way to understand why the answers are trustworthy.

Here is the path a question actually takes.

## Step 1: Intent gating

Not every question deserves a full investigation. "How many rows are in this file?" and "Should we accept these payment terms?" are different in kind, and treating them the same wastes effort on one and shortchanges the other.

So the first thing that happens is **intent gating**. A coordinator reads the question and decides what it is:

- A **quick lookup** gets a quick, direct answer.
- A **decision question** gets escalated into the full report pipeline — headline, metrics, recommendation — with verification.

This gate is what keeps the tool from being both too slow for simple things and too shallow for important ones.

## Step 2: The coordinator routes to workers

For anything substantive, a **coordinator** plans the work and dispatches it to specialized **workers**, matching the reasoning to the source:

- A **Tabular Analyst** handles spreadsheets by writing and running **real Python** in a sandboxed kernel against your data.
- A **Document Researcher** handles PDFs and contracts by **retrieving and citing** the exact passages that bear on the question.

A single question can fan out to both — pull a figure from the workbook, anchor a condition to a clause — and the coordinator assembles their findings rather than asking one model to do everything at once. This division of labor is why each part of an answer can carry its own evidence.

## Step 3: The verifier grounds the numbers

Before anything reaches you as a decision report, a **verifier** checks the figures against the computations that produced them. A number in the narrative that doesn't match the underlying Python gets caught here, not in your board meeting. This is the step that turns "a confident-looking number" into "a number that was actually checked."

## Step 4: The effort dial

Different questions warrant different amounts of work, and you shouldn't have to pay full price for every answer. Glass Box exposes an **effort dial**: turn it down for fast, cheaper passes on routine questions; turn it up when a decision justifies deeper analysis and more thorough verification. The coordinator scales the loop accordingly — how much it plans, how many workers it engages, how hard the verifier pushes.

## Governance runs through the whole loop

None of these steps happen outside your governance boundary. Throughout the entire pipeline:

- **RBAC is enforced on every request.** The analyst only ever reasons over sources the asker is allowed to see — OWNER, ADMIN, MEMBER, VIEWER, checked at the data layer.
- **Every action is audited.** The upload, the query, each run, any guardrail block, the share, the deletion — all recorded.
- **Sources are versioned.** Ask the same question against v2 of a spreadsheet or an RFP and see exactly what changed.
- **It runs self-hosted.** The whole loop executes on **your** infrastructure, powered by **claude-sonnet-5** under your credentials. The data never leaves.

## Why the loop, and not just a prompt

You could, in principle, try to cram all of this into one giant prompt and hope. The reason Glass Box doesn't is that the loop is what makes the output **governed** rather than merely generated:

- Intent gating decides *how much* to do.
- The coordinator decides *who* does it.
- Workers produce answers *with evidence*.
- The verifier decides *whether the numbers hold*.

A question goes in as plain English. What comes out is a report a team can act on — with the reasoning routed, the evidence attached, the numbers checked, and the whole thing governed and auditable from end to end. That is what it means for an answer to be *owned* rather than just *received*.`,
  },
];

export function getAllPosts(): Post[] {
  return [...POSTS].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function getPost(slug: string): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
