# Airia Executive AI Dashboard

A board-level view of AI in your organisation, built live from the Airia API.

Paste an Airia API key and the dashboard builds itself: eight sections, each answering
a question a board of directors asks about AI. Every section opens from a one-glance
summary into the detail behind it, and every detail page ends with **what to review**
and **how to mitigate it with Airia**.

It runs on your own machine. Data stays in the browser unless you export it or explicitly
enable AI analysis, which sends aggregate facts to the model service configured by the operator.
The normal source requests go to the Airia environment you authorise with your own key.

- [What you get](#what-you-get)
- [Before you start](#before-you-start)
- [Quick start](#quick-start)
- [Using the dashboard](#using-the-dashboard)
- [The eight sections](#the-eight-sections)
- [How the numbers are worked out](#how-the-numbers-are-worked-out)
- [What this report cannot tell you](#what-this-report-cannot-tell-you)
- [Privacy and security](#privacy-and-security)
- [Customising it](#customising-it)
- [Troubleshooting](#troubleshooting)
- [For developers](#for-developers)
- [Data sources by page](#data-sources-by-page)

---

## What you get

| # | Section | The board's question |
|---|---------|----------------------|
| 1 | **AI agent inventory** | Which AI agents do we have, what can they do, and which are riskiest? |
| 2 | **Accountability & ownership** | Who owns each agent, and who has been changing them? |
| 3 | **Financial visibility** | What does AI cost, and how much of that can we explain? |
| 4 | **Cybersecurity & data governance** | What sensitive data is exposed, and are agents actually controlled? |
| 5 | **Regulatory compliance** | Where do we stand against the EU AI Act and other frameworks? |
| 6 | **Incident response & near-misses** | What has gone wrong, and are we ready for the next one? |
| 7 | **Third-party & vendor risk** | How exposed are we to the vendors and models we depend on? |
| 8 | **Shadow AI & ungoverned adoption** | What AI is in use that nobody approved? |

The look and feel (colours, light and dark themes, charts and tables) follows the Airia
gateway-usage dashboard this was derived from.

## Before you start

You need:

- **Node.js 20.19 or newer** (or 22.12 or newer). Check with `node -v`.
- **npm**, which comes with Node.
- **An Airia API key** for the tenant you want to report on. Keys look like `ak-…`.
  A key belongs to one tenant in one region, so the dashboard shows whichever tenant
  the key belongs to.
- **Which region the tenant lives in.** This is the address you log in to Airia at
  (for example `https://yourco.airia.ai`).

A read-only key is enough: the dashboard only ever sends `GET` requests.

> **Tip:** the more your key can read, the more of the dashboard fills in. See
> [Permissions](#permissions-and-reliability) for what happens when a key cannot read
> something.

## Quick start

```bash
npm install
npm run dev
```

Open the address it prints (normally <http://localhost:5173>). If that port is already
in use, Vite picks the next free one and tells you which.

Then:

1. Choose your **Region**, or choose **Custom…** and type your tenant address.
2. Paste your **API key**.
3. Click **Build dashboard**.

The overview takes a few seconds to fill in, because it loads seven data sources at once.

### Running the built version

```bash
npm run build
npm start          # http://localhost:4173
```

Use `PORT=8080 npm start` to choose another port. The server binds to `127.0.0.1` only.

> **Run it locally. Do not host it for other people.** Every request carries the
> caller's API key through the local proxy, so whoever runs the proxy can see the key.
> Each person should run their own copy and paste their own key.

## Using the dashboard

### Connecting

- **Region.** Pick one of Airia's regions (US East, Australia East, Canada Central,
  Netherlands West, Singapore, UAE North), or **Custom…** for a customer's own
  environment. For Custom you can paste the address you log in at
  (`https://example.airia.ai`) or just its name (`example`); the API host it resolves to
  is shown under the box so a typo is visible before the key is sent anywhere.
- **API key.** Held in this browser tab only. Tick **Remember for this browser tab** to
  keep it in `sessionStorage`, which clears when the tab closes. Leave it off on a shared
  machine.
- **Change key** (top right) forgets the key and returns to this screen.
- If Airia rejects the key, you are returned to the connect screen with the reason.

### The overview

The first page shows one **summary card** per section: a headline number, one sentence
saying why it matters, and a small chart. Click a card to open its detail page. The
navigation tabs at the top right jump straight to any page.

### The detail pages

Each detail page follows the same pattern:

1. **A row of figures** at the top.
2. **A blue banner** stating the most important finding in a sentence, with the live numbers.
3. **Charts and ranked tables** showing the evidence.
4. **A detail card with tabs** that goes to the grain of the data: individual agents,
   audit entries, models, use cases, apps.
5. **What to review and how to mitigate with Airia**, a two-column table at the foot of
   the page.

### Getting around the tables and charts

| You want to… | Do this |
|---|---|
| See more of a ranked list | Use the **‹ ›** arrows under the list |
| See why a row ranks where it does | **Hover** over the row for its detail |
| See a chart's numbers as a table | Click the **table icon** at the top right of the card |
| See a chart value | **Hover** over the line |
| Switch between views of the same data | Use the **tabs** at the top of the card |
| Narrow the Inventory page to agents that have run | Use **All agents / In use** at the top left |
| Switch between light and dark | Click **Dark / Light** at the top right |
| Reload everything | Click **Refresh** at the foot of the page |

The page address changes as you move (`#/finance`, `#/security`…), so the browser's back
button works and you can bookmark or share a link to a page. (A shared link still needs
the other person to connect with their own key.)

## The eight sections

### 1. AI agent inventory
*Page: Inventory*

**Reads from:** `/v1/AiAssets`. See [Data sources by page](#data-sources-by-page) for the detail.

Counts every agent in the tenant (those built in Airia and those discovered on other
platforms), tiers them by risk, and ranks the ones to review first.

- **Headline:** how many agents can act on company systems, and how many of those have no owner.
- **Risk tier:** High, Elevated, Moderate, Low, or Unassessed. See [risk tiers](#risk-tiers).
- **Where agents run:** the platforms agents live on, which shows how much sits outside Airia.
- **Review first:** agents ranked highest tier first, with a *What to review* column listing
  the actions outstanding for each agent.

### 2. Accountability & ownership
*Page: Accountability*

**Reads from:** `/v1/AiAssets` (owners) and `/v1/AuditLog/entries` (who changed what). See [Data sources by page](#data-sources-by-page) for the detail.

Two sources meet here: the inventory says who **owns** an agent, and the audit log says
who **acted** on one. The sharpest finding is where they part: an agent that can act on
company systems and has nobody answerable for it.

- **Agent changes** and **access changes** per week for the last 90 days.
- **Who changed agents:** named people, ranked, with a breakdown of what they did.
- **Who owns agents** and **agents that act with no owner**, including the data each can reach.
- **Audit trail:** every change, newest first, with who, what and when.

### 3. Financial visibility & economics
*Page: Finance*

**Reads from:** `/v1/BillingExecutions/summary`, matched to `/v1/AiAssets`. See [Data sources by page](#data-sources-by-page) for the detail.

- **AI spend** and **executions** in twelve 30-day periods.
- **Where it went:** the last 90 days split into spend that traces to a current agent and
  spend that does not (gateway traffic, agents no longer in the inventory, build and test,
  data ingestion). The parts add up to the total.
- **By risk tier** and **by agent**, with cost per execution.
- **Reconciled** is the share of spend that traces to a current agent. It is the measure a
  finance committee will press on.

### 4. Cybersecurity & data governance
*Page: Security*

**Reads from:** `/v1/Feed/policy-violations`, the Discover reports (guardrail effectiveness, credential exposure, shadow MCP), `/v1/Security/*`, `/v1/SecurityCenter/summary`, `/v1/RedTeamingCampaign/summaries`, `/v1/DataRetentionSettings`. See [Data sources by page](#data-sources-by-page) for the detail.

- **Policy violations** per week, and **what was caught** by type (personal data, secrets,
  payment cards, prompt injection and more).
- **Control posture:** guardrails, tool-call policy, adversarial testing, discovered agents
  secured, agent identity and access, credentials left on devices, MCP servers, and data
  retention, each with a posture and a line on why a director should care.
- **MCP servers**, **AI apps in use** and **exposed keys** tabs. For exposed keys only the
  provider is shown, never the key, file path or owner.

### 5. Regulatory compliance
*Page: Compliance*

**Reads from:** `/v1/governance/frameworks`, `/v1/governance/usecases` and its per-use-case classification, assessment and completeness endpoints, `/v1/governance/disclosures`. Deadlines are not from an API. See [Data sources by page](#data-sources-by-page) for the detail.

- **Deadlines** by jurisdiction, with days passed or remaining, and whether Airia is
  tracking the framework each one belongs to. See [Customising it](#customising-it).
- **Frameworks** tracked (EU AI Act, NIST AI RMF, ISO/IEC 42001 and others).
- **Use cases** by governance stage, EU AI Act tier and governance level.
- **Use-case table:** high-risk first, then least documented, with assessment status,
  documentation completeness, nutrition label and owner.

### 6. Incident response & near-misses
*Page: Incidents*

**Reads from:** `/v1/AuditLog/entries` (security events), `/v1/security/runbooks`, `/v1/spm/threat-detection/events`, `/v1/security/endpoints/reconcile-actions`, and two Discover reports. See [Data sources by page](#data-sources-by-page) for the detail.

- **Security events** per week: failed sign-ins, policy violations, data-loss violations,
  anomalies, terminated sessions, impersonation.
- **Response readiness:** what a regulator or director would ask for after an incident
  (playbooks defined and exercised, near-misses stopped, remediations applied, exposures
  still open, time to remediate, tabletop exercises) and whether the platform has it,
  lacks it, or cannot tell.
- **Incident log** and **remediation actions**, with email addresses partly masked.

### 7. Third-party & vendor risk
*Page: Vendors*

**Reads from:** billing (vendor spend), `/v1/Security/inventory` (hosting), the Discover reports (model deprecation, platform coverage, governance funnel), and `/v1/AiAssets`. See [Data sources by page](#data-sources-by-page) for the detail.

- **Spend by model vendor**, shown as a share of *all* spend, with spend that names no
  vendor shown as its own line.
- **Fourth-party hosting:** which cloud hosts which vendor's models.
- **Retiring models:** models the estate relies on that are deprecated or deprecating,
  and how many agents depend on each.
- **Models and tools agents rely on**, and **third-party platforms** with how many agents
  can be secured and how many are.

### 8. Shadow AI & ungoverned adoption
*Page: Shadow AI*

**Reads from:** `/v1/discovery/dashboard/*`, `/v1/ShadowAiEvents/analytics/usage-over-time`, and four Discover reports (unmet demand, ungoverned devices, governance funnel, coverage). See [Data sources by page](#data-sources-by-page) for the detail.

- **AI tool use:** browser events to AI tools over time, and how many were only watched
  rather than blocked or redirected.
- **AI apps by users:** which apps, whether they are managed, and when they were last seen.
- **Findings, agents on other platforms and detection coverage:** how much of the estate
  discovery can actually see.

## How the numbers are worked out

### Risk tiers

Airia has no single risk field per agent, so the tier is **derived** from what an agent can
**do** and what it can **reach**. The rule is shown on the page and can be changed (see
[Customising it](#customising-it)).

| Tier | Rule |
|------|------|
| **High** | Can act (has a tool or MCP gateway) **and** reaches company data |
| **Elevated** | Can act, no company data |
| **Moderate** | Advisory only (no tools), but reaches company data |
| **Low** | Advisory only, model only |
| **Unassessed** | Found on another platform with no tools or data visible. Unknown is not the same as safe. |

### Other definitions

| Term | Meaning |
|------|---------|
| **Executive / Advisory** | An agent with a tool or MCP gateway can *act*. One without can only *answer*. |
| **In use** | Has run at least once, or was found running on another platform. |
| **Named owner** | The owner assigned in Airia's asset registry. |
| **Risk-classified** | Carries a classification label, assigned or inferred. |
| **Reconciled** | Spend that traces to an agent in today's inventory. |
| **Sensitive data caught** | Guardrail detections of personal data, payment card data, health data and secrets in the last 90 days. |
| **Near-misses stopped** | Agent tool calls that policy blocked. Calls only logged are not counted as stopped. |
| **Attributed to a person** | Audit entries made by a named person rather than the system. |
| **Airia agents outside governance** | Airia-built agents with no governed use case and no risk classification. |
| **Unclassified** | A use case with no risk classification. Counted as unknown, never as low risk. |
| **Posture** | *In place*, *Partial*, *Gap*, or *Unknown*. Judged only from what the platform can see. |

### Time windows

| Measure | Window |
|---|---|
| Spend and executions | Twelve 30-day periods ending now, in UTC |
| Spend breakdown, cost per agent, vendor share | Last 90 days |
| Audit changes, security events, policy violations | Last 90 days, shown weekly |
| Inventory, use cases, discovery | The current state |

## What this report cannot tell you

The dashboard says so on the page rather than showing a tidy number that is really a guess.

| Not available | Why | Where it has to come from |
|---|---|---|
| Time to remediate, tabletop exercises, lessons learned | Airia records when an event happens, not when it is resolved | Your ticketing or security-operations system |
| Regulator filings, enforcement actions, SEC disclosures | Legal events outside the platform | Your legal or GRC system |
| Compliance deadlines | Airia holds no legal calendar | `src/data/deadlines.ts` (reference data you maintain) |
| Vendor security ratings and fourth-party scoring | Airia holds none | Your vendor-risk tool |
| Return on investment | No business value is recorded per agent | A custom asset attribute you define, divided into the spend |
| Spend by department, adoption by department | Airia records no department for an agent | A custom asset attribute you define |
| Access settings of most discovered agents | Only some platforms report them | Connect more platforms in Airia |

## Privacy and security

- **Your key stays in your browser tab** and is sent only as an `x-api-key` header, only to
  the Airia environment you chose. It is never put in a URL, a log or a file.
- **The local proxy** (`proxy.mjs`) exists because the Airia API sends no CORS headers, so a
  browser cannot call it directly. It forwards **`GET` requests only**, and **only to
  `*.airia.ai` hosts** (plus any you add with `AIRIA_EXTRA_HOSTS`). The host allowlist stops
  it being used to send your key elsewhere.
- **Data stays in memory by default.** CSV and PowerPoint exports write the selected data
  to files at your request. Enabling AI analysis sends aggregate facts to the configured model
  service; raw records and the Airia key are excluded. Turning it off stops subsequent analysis
  requests but does not erase facts already received by the provider.
- **Personal data is minimised on screen:** email addresses in security events are partly
  masked, and exposed-key findings show only the provider.
- **The agent, user and app names on screen are your tenant's real data.** Treat screenshots
  and exported pages accordingly, and do not commit them to a public repository.
- **Do not host it** for others, and do not paste a key into a shared machine's browser with
  *Remember* ticked.

## Customising it

### Compliance deadlines

Edit `src/data/deadlines.ts`. Each entry has a date, a jurisdiction, a description, and the
Airia framework key that covers it. The page works out how many days have passed or remain
and whether that framework is on in Airia. These dates are **reference data, not from
Airia**, and legislative timelines can change: confirm them with counsel.

### Risk-tier rules

Edit `assess()` in `src/data/inventory.ts`. The tier labels and the explanation shown on the
page are in the same file.

### Review and mitigation advice

The text in each page's *What to review and how to mitigate with Airia* table lives in
`src/data/guidance.ts`, one function per page. Each row is shown only when the page's own
numbers show a gap, and the review text carries those numbers.

### Colours and themes

All colour lives in `src/theme/tokens.css`, for light and dark. Components never contain a
colour. After changing any series colour, run `npm run check` (it includes a colour gate).

### Regions and custom hosts

The region list is in `src/lib/airia/endpoint.ts`. For a deployment on a domain other than
`airia.ai`, start the server with the host allowed:

```bash
AIRIA_EXTRA_HOSTS=api.example.com npm run dev
```

## Troubleshooting

| What you see | Likely cause and fix |
|---|---|
| **"The key was rejected by … (HTTP 401/403)"** | The key is wrong, or belongs to a different region. Check the region against the address you log in at. A key for one tenant will not work in another region. |
| **"Could not reach the API through this origin. Is the proxy running?"** | You opened a built file directly, or the dev server stopped. Use `npm run dev` or `npm start`; do not open `dist/index.html` by itself. |
| **"Not a host name" or "Not an Airia host"** | The custom address is mistyped, or is not an `*.airia.ai` host. For another domain, set `AIRIA_EXTRA_HOSTS`. |
| **A card or part says "Not available to this key"** | The key cannot read that source. The rest of the page still works. Use a key with wider read access. |
| **A section shows an error with "Try again"** | A request failed or timed out. Click **Try again**, or **Refresh** at the foot of the page. |
| **A section sits on "Loading…"** | The overview loads seven sources at once; a large tenant can take a little longer. |
| **The page is on port 5174, not 5173** | Another process holds 5173. Vite picks the next free port and prints it. |
| **A number looks wrong or low** | Open the card's table view (table icon) or the hover detail, and read the footer under the card, which says exactly what is counted. |
| **Dates look a day out** | Spend periods are in UTC, and the card says so. |

### Permissions and reliability

Each section loads, and can fail, on its own, so one slow or forbidden source never holds up
the rest. Sources that are essential to a section (the agent inventory, the audit log,
billing, governance use cases) show an error with a retry. Sources that only add detail (most
of Security, Incidents, Vendors and Shadow AI) are optional: if the key cannot read one, that
part says *Not available to this key* and nothing else is affected.

The dashboard keeps its request volume modest: counts are read with a limit of one rather than
by downloading rows, and fan-out is kept narrow because the API throttles under sustained
parallel load. A tenant with many governance use cases makes three small requests per use case.

## For developers

Stack: **React 19 + TypeScript + Vite.** Charts are hand-rolled SVG with no charting library.

### Commands

| Command | What it does |
|---|---|
| `npm run dev` | Dev server with the proxy built in |
| `npm run build` | Type-check and build to `dist/` |
| `npm start` | Serve the build on port 4173 (or `PORT`) |
| `npm run check` | Type-check plus the colour gate |
| `npm run check:palette` | Just the colour gate: contrast, colour-blind separation, lightness |
| `npm run chrome` | Headless Chrome on port 9222, for the screenshot script |

`npm run check` checks types and the palette. `npm test` covers the report's date boundaries,
CSV escaping, missing-data handling, priority ordering, analysis response validation and the
local model-service boundary. Live tenant verification still requires an Airia key.

### Executive report controls

The Overview now includes Settings, Data & assumptions, Ask AI and Export to deck.
Each dimension has a consistent icon. Line charts, bar charts and rank tables have an
Expand button opening their original sample data in a keyboard-accessible dialog with CSV export.
CSV exports preserve source values before pixel reduction and escape spreadsheet formulas.

The date controls filter **UTC chart sample timestamps** (bucket starts for aggregated series).
They do not re-query Airia or change headline reporting periods, ownership snapshots,
governance counts or categorical tables. A weekly or monthly bucket is included whole when its
start is in range; it is never prorated. Finance's 30-day headline therefore remains explicitly
30-day even when the chart is narrowed to seven days. The assumptions sheet explains these limits.
Team/vendor/risk filters from the concept are not fabricated where sources lack a joinable field.

**AI Model Analysis starts disabled.** Settings requires Cancel/Continue confirmation with the
filter-performance warning before enabling. When enabled, the app debounces requests, cancels
superseded requests and removes stale commentary as the range or snapshot changes. It provides
an Executive Summary, an eight-principle risk/actionability plot, ranked priorities, one statement
per dimension and source-linked Ask AI responses. Disabling removes all model commentary from
the dashboard and subsequent deck exports. Unknown sources must remain unscored.

For live AI, set these **server process environment variables** before starting Vite or `npm start`:

```bash
export BOARD_ANALYSIS_URL=https://your-approved-service.example/v1/chat/completions
export BOARD_ANALYSIS_MODEL=your-model-name
export BOARD_ANALYSIS_TOKEN=your-service-token
npm run dev
```

Use an operator-approved service implementing the chat-completions request/response shape
(`messages`, `model`, `choices[0].message.content`). Token authentication is optional for a local
service. HTTPS is required except for a localhost provider. The local `/api/board-analysis` handler
is shared by dev, preview and production, checks same-origin requests and response shape, limits
request size, and times out after 60 seconds. Credentials stay server-side. Only aggregate facts,
source windows, the chart range and an optional question go to the provider; the Airia key, raw
audit records and agent names are not sent. With no provider configured the UI reports this
explicitly; it does not substitute simulated analysis in the live application.

Risk and actionability scores are subjective model estimates on a 1–5 scale, supported by a
rationale in the rubric's expanded table. Priority = `(0.7 × risk + 0.3 × actionability) × 20`.
Ties use risk, then the documented dimension order. This is decision support requiring review,
not a new API finding or replacement for the existing agent risk rules.

Export to deck creates an editable PowerPoint containing current facts, available AI commentary,
source periods, native charts from the filtered overview series, and methodology pages. It uses
the repository's content structure. The separate LG boardbook template was not supplied and is
not reproduced. The export library is loaded only when needed in the live app.

### Downloadable HTML preview

```bash
npm run build:html
```

Open `standalone/preview.html` directly in a browser. This single file bundles React, icons,
styles and PowerPoint export with **synthetic fixtures** and **predefined demonstration AI
responses**. It requires no CDN, network, credentials or backend and is visibly labeled as a
preview. It uses the same report components and detail panels as the live app; it never calls
Airia. During development, the equivalent preview is at `/preview.html`. Generated standalone
files and PowerPoint files should not be committed, especially after using live tenant data.

### Taking screenshots

With `npm run chrome` running and the dev server up:

```bash
export AIRIA_API_KEY=ak-…          # read from the environment, never a flag
export AIRIA_HOST=prodaus          # region or API host
node scripts/shoot.mjs --url "http://localhost:5173/#/finance" --out /tmp/finance.png --theme dark
```

Screenshots contain tenant data. Keep them out of the repository.

### Project structure

```
src/theme/       colour: the only place hex values exist (tokens.css, palette.ts)
src/lib/         maths, formatting, routing, key handling. No JSX, no colour.
  airia/         one fetcher per data source, through the local proxy
src/data/        pure folds from raw rows to what a panel shows, plus the loaders
src/components/  the chart and table kit (shared with the gateway-usage dashboard)
src/panels/      one file per section: a summary card and a detail page
src/App.tsx      the shell: connect screen, navigation, overview, routes
proxy.mjs        the /airia proxy (shared by Vite and server.mjs)
server.mjs       serves the build and runs the proxy
scripts/         the colour gate and the screenshot tool
```

The layers depend only on those above them: `lib` never imports from `components`, and
components never contain a colour literal.

### Adding a section

1. **Fetch.** Add `src/lib/airia/<thing>.ts`, calling `getJson` from `http.ts`. Wrap any source
   the page can live without in `optional(...)`. Use `mapLimit` for fan-out.
2. **Fold.** Add `src/data/<thing>.ts`, a pure function from the raw rows to what the panel
   shows. State in a comment what is counted and what is not.
3. **Load.** Add it to `useBoard` in `src/data/live.ts`.
4. **Panel.** Add `src/panels/<Thing>Panel.tsx` exporting a `Summary` card (using
   `SummaryCard` and `Trend` or `RankTable`) and a detail page (a row of `StatTile`s, a
   `page__scope` banner, `Card`s, and `ReviewAndMitigate`).
5. **Guidance.** Add a function to `src/data/guidance.ts` for the review-and-mitigate rows.
6. **Wire it.** Add the route to `src/lib/route.ts` and the page to `App.tsx`.
7. Run `npm run check`.

### Conventions worth keeping

- **Say what is unknown.** Where the platform cannot see something, the page says
  "Unknown" or "Not available". An unknown is never counted as safe, and a missing figure is
  never filled with a guess.
- **A count is not a verdict.** Use only what the API returns; do not invent a risk score.
- **Every number has a footer** saying where it comes from and what is counted.
- **Chart series keys must be plain tokens** (letters, digits and hyphens). A space in a key
  breaks the chart's gradient and the area renders solid black.
- **Series colours are assigned in order and never cycled.** Slot 4 (yellow) is skipped next
  to orange, because that pair fails the colour-blind check.

## Data sources by page

Every call is a `GET`, made through the local proxy with the `x-api-key` header. Nothing is
written back to Airia.

### Which page reads which source

The dashboard loads **seven sources** once, when you connect, and the pages share them. Each
source loads, and can fail, on its own.

| Source (loaded once) | Overview | Inventory | Accountability | Finance | Security | Compliance | Incidents | Vendors | Shadow AI |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| **Agents** (`/v1/AiAssets`) | ● | ● | ● | ● | | | | ● | ● |
| **Audit log** (`/v1/AuditLog/entries`, two queries) | ● | | ● | | | | | | |
| **Billing** (`/v1/BillingExecutions/summary`) | ● | | | ● | | | | ● | |
| **Security** (eight reports and counters) | ● | | | | ● | | | | |
| **Compliance** (governance frameworks, use cases) | ● | | | | | ● | | | |
| **Incidents** (audit security events, runbooks, endpoint actions) | ● | | | | | | ● | | |
| **Discovery** (Discover reports and dashboards) | ● | | | | | | | ● | ● |

The tenant name in the page header comes from `GET /v1/Tenants`.

The **What to review and how to mitigate with Airia** table on each page calls no API. It is
written from that page's own numbers (`src/data/guidance.ts`).

"Derived" below means worked out in the browser from the fields named; it is not a field the
API returns.

---

### Inventory

| What you see | API | How it is used |
|---|---|---|
| Agent count, names, platform, creation date (the overview growth chart) | `GET /v1/AiAssets` | `PageNumber`, `PageSize=500`, `assetsFilter=InternalAgent,ExternalAgent,GovernanceAgent,PersonalAgent`. Reads `name`, `platform`/`source`, `createdAt`. Pages until `totalCount` is reached. |
| Can act or advise, and what an agent reaches | `GET /v1/AiAssets` | Reads each agent's `tools`, `mcpGatewayDeployments` and `dataSources` lists. |
| **Risk tier** (High, Elevated, Moderate, Low, Unassessed) | `GET /v1/AiAssets` | **Derived** from the tools, MCP gateways and data sources above. The API has no risk field per agent. |
| Owner, and "has a named owner" | `GET /v1/AiAssets` | Reads `ownerName` (Airia-built) or `owner` (discovered). |
| Risk-classified | `GET /v1/AiAssets` | An agent is classified when a `classifications` entry has an assigned or inferred label. |
| In a governed use case | `GET /v1/AiAssets` | Reads `useCaseIds`. |
| Runs, and the **In use** filter | `GET /v1/AiAssets` | Reads `executionCount` (Airia-built agents only). In use means it has run, or was found running on another platform. |
| Where agents run | `GET /v1/AiAssets` | Groups by platform. Discovered agents are those whose `assetType` is not `InternalAgent`. |
| What to review (per agent) | none | **Derived** from the gaps above. |

### Accountability

| What you see | API | How it is used |
|---|---|---|
| Who owns agents, and agents that act with no owner | `GET /v1/AiAssets` | Owners and tools as above. "Data involved" lists each agent's `dataSources`. |
| Agent changes: created, published, deployed, withdrawn, deleted | `GET /v1/AuditLog/entries` | `ResourceTypes=Pipeline,Agent,Deployment`, `Operations=Create,Publish,SetActiveVersion,Delete`, last 90 days, `PageSize=100`, up to 10 pages. A Create on a Deployment is "deployed"; on a Pipeline or Agent, "created". |
| Access changes (keys, credentials, roles) | `GET /v1/AuditLog/entries` | `ResourceTypes=ApiKey,Credential,AccessControl,Group,User`, `Operations=Create,Delete,Grant,Revoke,RoleAssigned,RoleRevoked,RoleChanged,PermissionGranted,PermissionRevoked`, last 90 days. |
| Who changed agents, roles, last active | `GET /v1/AuditLog/entries` | Groups the agent-change entries by `actor` (name, role, type). Only `actor.type = User` counts as a named person. |
| Weekly charts and the audit trail | `GET /v1/AuditLog/entries` | Buckets the same entries into 13 weeks. The trail shows `timestamp`, `actor`, `operation`, `resource` and `description`. |

If the log holds more entries than the 10-page cap, the page says "Showing the latest N of M".

### Finance

| What you see | API | How it is used |
|---|---|---|
| AI spend and executions per 30-day period (12 periods) | `GET /v1/BillingExecutions/summary` | One request per period with `StartDate`, `EndDate` and `PageSize=1`. Reads only `aggregatedTotals` (`totalCost`, `totalExecutions`). |
| Spend by agent, by source, by model | `GET /v1/BillingExecutions/summary` | Last 90 days, `PageSize=200`, paged by `nextPageCursor`. Reads `pipelineId`, `pipelineName`, `executionSourceType`, `executionCount`, `totalCost`, `modelBreakdown`. |
| Which spend traces to a current agent, and spend by risk tier | `GET /v1/BillingExecutions/summary` and `GET /v1/AiAssets` | A billing `pipelineId` is matched to an agent's `id` or `internalId`. The risk tier is the Inventory tier. |
| Where it went (current agents, not in inventory, gateway traffic, build and test, data ingestion) | `GET /v1/BillingExecutions/summary` | **Derived** from `executionSourceType` and whether the pipeline matches an agent. The parts sum to the total. |
| Reconciled, cost per execution, per agent | `GET /v1/BillingExecutions/summary` | **Derived**: reconciled spend over total; spend over executions; spend over current agents that had spend. |

### Security

| What you see | API | How it is used |
|---|---|---|
| Policy violations per week, last 90 days, vs the 90 before | `GET /v1/Feed/policy-violations` | `Limit=1`, `StartTime` and `EndTime` in milliseconds. Reads only `totalCount`: 13 weekly windows, the current 90 days, the previous 90, and all time. |
| What was caught, by type | `GET /v1/Feed/policy-violations` | One request per violation type using the `ViolationItemTypeFlags` bit set. The per-type counts sum to the total. |
| Sensitive data caught | `GET /v1/Feed/policy-violations` | **Derived**: personal data, payment card, health data and secrets types added together. |
| Agent actions blocked vs only logged | `GET /v1/discovery/reports/guardrail-effectiveness` | Reads metrics `blockedToolCallCount`, `auditedToolCallCount`, `totalToolCallCount`. |
| AI keys exposed on devices | `GET /v1/discovery/reports/credential-exposure` | Reads `totalExposureCount`, `devicesWithExposureCount`, and only the `provider` of each register entry. |
| MCP servers on devices, and unsanctioned ones | `GET /v1/discovery/reports/shadow-mcp-register` | Reads `totalServerCount` and the `mcpServerRegister` list (`displayName`, `deviceCount`, `sanctioned`). |
| Discovered agents secured, and high risk | `GET /v1/Security/stats` | Reads `securedAgentsCount`, `securableAgentsCount`, `highRiskAgentsCount`. |
| Agent identity and access | `GET /v1/Security/inventory` | `PageSize=100`, items of type `SpmAgent`. Counts agents that report their access settings (`orgWideAccessible` and related fields). |
| Content guardrails active | `GET /v1/SecurityCenter/summary` | Reads `activeGuardrailsCount`. |
| Red-team campaigns run | `GET /v1/RedTeamingCampaign/summaries` | Reads `totalCount`. |
| Conversation data retention | `GET /v1/DataRetentionSettings` | Reads `conversationDataRetentionDays` and `restrictConversationDetailsToOriginatingUserOnly`. |
| AI apps in use | `GET /v1/ShadowAiEvents/analytics/top-apps` | `limit=10`. Reads application, unique users, event count. |
| Control posture (In place, Partial, Gap, Unknown) | none | **Derived** from the figures above. |

### Compliance

| What you see | API | How it is used |
|---|---|---|
| Frameworks, and whether each is on | `GET /v1/governance/frameworks` | Reads `name`, `type`, `jurisdiction`, `isEnabled`. |
| Use cases: stage, governance level, owner, nutrition label, approved | `GET /v1/governance/usecases` | `PageSize=100`. Reads `stageName`, `governanceLevel`, `ownerName`, `hasNutritionLabel`, `approvedVersionId`, `pendingTaskCount`. |
| EU AI Act tier, NIST tier, ISO/IEC 42001 level | `GET /v1/governance/usecases/{id}/risk-classifications/active` | One request per use case. Reads `euAiAct`, `nistAiRmfTier`, `iso42001Level`. A 404 means no classification, shown as **Unclassified**. |
| Assessments done, and EU AI Act assessments | `GET /v1/governance/usecases/{id}/assessments` | One request per use case. Reads `frameworkKey`, `status`, `isComplete`. |
| Documentation ready | `GET /v1/governance/usecases/{id}/completeness/summary` | One request per use case. Reads `overallPercent`. |
| Disclosures active | `GET /v1/governance/disclosures` | Counts entries and those with `isActive`. |
| **Deadlines**, days passed or remaining | **none** (`src/data/deadlines.ts`) | Reference dates you maintain, not from Airia. "Tracked in Airia" compares each with the framework's on/off state above. |

### Incidents

| What you see | API | How it is used |
|---|---|---|
| Security events, by type, weekly, and the incident log | `GET /v1/AuditLog/entries` | `Operations=AuthenticationFailure,PolicyViolation,DlpViolation,AnomalyDetected,SessionTermination,Impersonate`, last 90 days, up to 10 pages of 100. Email addresses in the text are partly masked. |
| Response playbooks defined, and active | `GET /v1/security/runbooks` | Counts runbooks and those with `status = active`. |
| Playbook runs | `GET /v1/security/runbooks/executions` | Reads `totalCount`. |
| Threat-detection events | `GET /v1/spm/threat-detection/events` | `pageSize=1`, reads `totalCount`. |
| Near-misses stopped | `GET /v1/discovery/reports/guardrail-effectiveness` | Blocked, audited and total tool calls, as on Security. |
| Remediations applied, and the remediation list | `GET /v1/security/endpoints/reconcile-actions` | `PageSize=100`. Reads `applied`, `occurredAt`, `action`, `clientId`. |
| Exposures still open | `GET /v1/discovery/reports/credential-exposure` | **Derived**: `totalExposureCount` less `remediatedCount`. |
| Time to remediate, tabletop exercises, lessons learned | **none** | Airia does not record these. The page lists them as Unknown. |

### Vendors

| What you see | API | How it is used |
|---|---|---|
| Spend by model vendor, and the unattributed share | `GET /v1/BillingExecutions/summary` | The billing rows' `modelBreakdown` (model, `provider`, cost), grouped by vendor. Spend with no model breakdown (gateway traffic) is the unattributed remainder of the 90-day total. |
| Fourth-party hosting (host and model vendor) | `GET /v1/Security/inventory` | `PageSize=100`, items of type `AiModel`. Reads `provider` (the host) against `aiProviderNames` (the vendor). |
| Models past deprecation, agents on a retiring model, the retiring-models table | `GET /v1/discovery/reports/model-deprecation-exposure` | Reads `totalDeprecatingModelsWithDependencies`, `totalAgentsAtRisk`, `deprecationBurnDownByThreshold`, and each entity's status, days, dependent assets, executions and spend. |
| Platform connections healthy | `GET /v1/discovery/reports/coverage-confidence` | Reads `spmConnectionCount`, `spmConnectionHealthyCount`, `spmConnectionStaleOrFailedCount`. |
| Third-party agents secured, and the platforms table | `GET /v1/discovery/reports/governance-funnel` | Reads `discoveredCount`, `securableCount`, `securedCount`, `providerBreakdown`. |
| Models and tools agents rely on | `GET /v1/AiAssets` | Counts how many Airia-built agents list each model and tool. |
| Vendor security ratings | **none** | Airia holds none. |

### Shadow AI

| What you see | API | How it is used |
|---|---|---|
| AI apps found, and new this week | `GET /v1/discovery/dashboard/summary` | Reads `kpis.discoveredAppsCount` and `kpis.newAppsThisWeek`. |
| Apps table and AI apps by users | `GET /v1/discovery/dashboard/assets` | `category=DiscoveredApps`, `PageSize=100`. Reads name, `userCount`, `managed`, `riskLevel`, `firstSeen`, `lastSeen`. |
| Findings tab | `GET /v1/discovery/dashboard/findings` | Reads each finding's type, severity, headline value, new this week and top apps. |
| AI tool use over time | `GET /v1/ShadowAiEvents/analytics/usage-over-time` | Reads daily `eventCount`. Days with no events are not returned. |
| Browser events, and how many were only watched | `GET /v1/discovery/reports/unmet-ai-demand` | Reads `totalEventCount`, `monitoredCount`, `allowedCount`, `blockedCount`, `warnedCount`. |
| Third-party agents secured, and the agents tab | `GET /v1/discovery/reports/governance-funnel` | As on Vendors. |
| Devices under an enforced policy | `GET /v1/discovery/reports/ungoverned-devices` | Reads `deviceTotalCount`, `enforcedPolicyCount`, `observedPolicyCount`. |
| Detection coverage tab | `GET /v1/discovery/reports/coverage-confidence` | Reads the platform-connection, endpoint-device and browser-extension coverage counts. |
| Airia agents outside governance | `GET /v1/AiAssets` | **Derived**: Airia-built agents with no `useCaseIds` and no classification. |
| Adoption by department | **none** | Airia records no department for an agent. |

### Overview

Each summary card reads the same sources as its detail page: Inventory (agents and their
creation dates), Accountability (agents and the audit log), Finance (billing), Security,
Compliance, Incidents, Vendors (discovery and billing) and Shadow AI (discovery).

### Fetched but not shown

Two calls are made and not currently displayed: `GET /v1/Security/recommendations/summary`
(ownership and analysis gaps among discovered agents) and
`GET /v1/governance/dashboard/sla-at-risk` (use cases overdue or approaching a governance SLA).
They are kept in the data layer for a future panel.

### Reference

The full API reference is at `https://api.airia.ai/docs/`. If an endpoint's shape changes, the
fetcher for it is the one file to update:

| Source | File |
|---|---|
| Agents | `src/lib/airia/agents.ts` |
| Audit log | `src/lib/airia/audit.ts` |
| Billing | `src/lib/airia/billing.ts` |
| Security | `src/lib/airia/security.ts` |
| Compliance | `src/lib/airia/compliance.ts` |
| Incidents | `src/lib/airia/incidents.ts` |
| Discovery | `src/lib/airia/discovery.ts` |
| Tenant name | `src/lib/airia/tenant.ts` |

---

*Built on the structure, theme and local-proxy approach of the Airia gateway-usage dashboard.*
