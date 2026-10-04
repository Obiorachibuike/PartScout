# PartScout — *Find the right part. Verify compatibility.*

PartScout is an AI-powered **phone-parts compatibility research engine**. It searches the live public
web at the moment you ask, extracts short structured evidence claims from the pages it can actually
read, scores that evidence, and reports a verdict with **evidence confidence**, the **sources behind
every claim**, and the **conflicts it found** — including the honest answer *“PartScout could not find
enough reliable evidence to confirm compatibility.”*

It is **not** a compatibility database. There is no table of mappings, no admin screen that lets
someone type “SM-A155F fits this screen”, and no model knowledge used as fact. Its knowledge is
whatever the public web says right now, with the receipts attached.

---

## Table of contents

1. [What it does](#what-it-does)
2. [Product principles (enforced in code)](#product-principles-enforced-in-code)
3. [Architecture](#architecture)
4. [The ten-stage research pipeline](#the-ten-stage-research-pipeline)
5. [Search architecture](#search-architecture)
6. [AI architecture](#ai-architecture)
7. [Compatibility & checklist engine](#compatibility--checklist-engine)
8. [Confidence system](#confidence-system)
9. [Caching](#caching)
10. [Cost control](#cost-control)
11. [Data model (PostgreSQL + Prisma)](#data-model-postgresql--prisma)
12. [Security](#security)
13. [Routes & API](#routes--api)
14. [Design system](#design-system)
15. [Local development](#local-development)
16. [Database setup](#database-setup)
17. [Environment variables](#environment-variables)
18. [Testing](#testing)
19. [Deployment](#deployment)
20. [Troubleshooting](#troubleshooting)
21. [Project layout](#project-layout)
22. [Roadmap / not built yet](#roadmap--not-built-yet)

---

## What it does

| Flow | Route | Example |
| --- | --- | --- |
| Phone → parts | `/search/phone` | “Galaxy A15 4G — what charging flexes fit?” |
| Part → phones (reverse lookup) | `/search/part` | “BN5A” → every device that cites that battery |
| Check a pairing | `/search/compatibility` | “Does an A15 5G screen fit an A15 4G?” |
| Identify a part | `/identify` | Photo of a flex label → OCR → editable identifier → research |
| Anything else | `/search` | free-form natural language |

Every result is a **research report** containing:

* a verdict — `compatible`, `likely_compatible`, `uncertain`, `not_compatible` or `insufficient_evidence`;
* **Evidence Confidence: NN%** with the full breakdown (source quality, independence, agreement,
  technical specificity, part-number support, penalties) and a non-laboratory disclaimer;
* compatible/incompatible models with the model numbers the sources actually printed;
* **Why** — the per-category checklist (connector, flex layout, revision, panel technology, …) with
  each dimension marked supported / contradicted / conflicting / unknown;
* **variant warnings** when sources describe a sibling variant (4G vs 5G vs regional SKU);
* **conflicts** shown explicitly, both sides with domain + quote + link;
* **verify before install** guidance and run warnings (including prompt-injection attempts);
* **source cards** (domain, tier, scores, published date, quote) — always real URLs from the search
  provider, never synthesised;
* the **evidence claims** themselves, filterable by compatible / not compatible / unclear.

---

## Product principles (enforced in code)

These are not marketing bullets; each one has a test or a hard guard.

| Principle | Where it is enforced |
| --- | --- |
| Never scrape Google/Bing/Yahoo SERP HTML | Only `SearchProvider` implementations exist (Tavily/Exa/Serper/Brave APIs); there is no scraper in the codebase |
| AI is a reasoning layer, never a source of truth | Prompts (`src/lib/providers/ai/prompts.ts`) + rejection of AI output that invents model numbers (`answer-generator.ts`) |
| No answer without evidence | `research-pipeline.ts` returns `insufficient_evidence` with `failure.code` instead of a guess; `tests/research-flow.test.ts` asserts the invariant |
| Never merge model variants | `claim-normalization.ts` keys claims by family **and** variant markers; “A15 4G” ≠ “A15 5G” ≠ “SM-A155F” |
| No “same size = compatible” rule | `parts.ts` defines explicit per-category checklists; sizes are never used as proof |
| Conflicting evidence is displayed | `compatibility-engine.ts` emits `ConflictRecord`s; the UI has a conflicts panel and never averages them away |
| Web content is data, never instructions | `safety/untrusted.ts` neutralises instruction-like text, wraps evidence in unbreakable blocks, and surfaces findings as warnings |
| No fabricated URLs, quotes or part numbers | Claims are matched back to the retrieved page text; sources are only what was returned and fetched |
| Fixtures can never masquerade as research | Fixture provider is dev-only, hard-disabled in production, and every report carries `fixtureData` + a UI badge |

---

## Architecture

```
Browser (Next.js App Router, React 19, Tailwind v4, Framer Motion)
   │  SSE stage stream + JSON APIs
   ▼
API routes  ──►  Validation (Zod) ──► Rate limits ──► Auth/CSRF ──► Research pipeline
                                                                       │
   ┌───────────────────────────────────────────────────────────────────┘
   ▼
Research pipeline (src/lib/research/*)
   understand → plan queries → search (provider API) → extract sources → score sources
   → extract evidence → normalise claims → compatibility engine → confidence → answer
                                                                       │
                                    ┌──────────────────────────────────┴─────────────┐
                                    ▼                                                ▼
                        Postgres + Prisma (app data, cache)              Search / AI providers
                        users · sessions · research · cache              Tavily/Exa/Serper/Brave
                        feedback · usage · identifications              OpenAI/Gemini/Anthropic
```

* **Next.js 16 (App Router) + TypeScript strict**, server components for reports, client components
  for interaction.
* **Zod** validates every external input (API bodies, uploads, identifiers).
* **Prisma + PostgreSQL** stores users, sessions, research sessions/sources/claims, caches, feedback,
  usage records and part identifications. It is *not* authoritative compatibility data.
* **Provider interfaces** (`SearchProvider`, `AIProvider`) keep vendors swappable by env var.

---

## The ten-stage research pipeline

`src/lib/research/research-pipeline.ts` orchestrates and streams each stage to the UI:

| # | Stage | Module | What happens |
| --- | --- | --- | --- |
| 1 | Query understanding | `query-understanding.ts` | Deterministic parse of intent, device family, brand, model numbers, variant markers, part, part number, region. Optional AI enrichment may fill gaps but **may not introduce model numbers**. |
| 2 | Query generation | `query-generation.ts` | 4–10 targeted queries (device→part, part→phones, exact SKUs, OEM numbers, spec angles, community angles). |
| 3 | Live web search | `web-search.ts` | Parallel provider calls, per-query failure tolerance, URL dedupe, strongest variant kept. Search responses cached. |
| 4 | Content extraction | `source-extraction.ts` | Provider inline content is used when available; otherwise SSRF-vetted, byte-capped, timeout-bounded fetches → readable text. Blocked pages become “metadata only”. |
| 5 | Source quality scoring | `source-evaluation.ts` | Tier assignment (T1 manufacturer/official … T4 marketplace/forum) + 8 sub-scores. |
| 6 | Evidence extraction | `evidence-extraction.ts` | Page text is segmented; spans carrying device + part + claim become structured claims with verbatim quotes. Optional AI pass is only accepted when quotes verify against the page text. |
| 7 | Claim normalisation | `claim-normalization.ts` | Canonical part terms, device family keys, variant keys, conflict detection, sibling-variant risks. |
| 8 | Compatibility reasoning | `compatibility-engine.ts` | Claim clustering against the target, per-category checklist, conflicts, compatible models/parts. |
| 9 | Confidence | `confidence-engine.ts` | Weighted score, level mapping, rationale, disclaimer. |
| 10 | Answer | `answer-generator.ts` | Deterministic wording (always) + optional AI rewrite that is rejected if it invents model numbers or contradicts the verdict. |

Persistence and the research cache are the last step: `persistResearch()` writes the session, sources,
claims, a search-history row and usage records; `putCachedResearch()` stores the report for the TTL.

---

## Search architecture

**PartScout never scrapes SERP HTML.** All retrieval goes through licensed APIs behind one interface
(`src/lib/providers/search/SearchProvider.ts`):

| Provider | Env var | Returns page content? | Notes |
| --- | --- | --- | --- |
| Tavily | `TAVILY_API_KEY` | yes | Research-oriented search API; `TAVILY_SEARCH_DEPTH=basic\|advanced` |
| Exa | `EXA_API_KEY` | yes | Neural/keyword search; `EXA_SEARCH_MODE=auto\|keyword\|neural` |
| Serper | `SERPER_API_KEY` | no | Licensed Google/Bing result **metadata**; pages are fetched by PartScout |
| Brave Search | `BRAVE_SEARCH_API_KEY` | no | Independent index; metadata only |
| Fixture | `PARTSCOUT_ALLOW_FIXTURES=true` | yes | **Development/testing only** — synthetic pages, hard-disabled in production, always labelled |

Select with `SEARCH_PROVIDER=tavily|exa|serper|brave|fixture`; optionally set
`SEARCH_FALLBACK_PROVIDER` to merge a second provider's results (deduped).

Swapping providers is a config change: nothing outside `src/lib/providers/search/` knows a vendor
exists. Adding a new one means implementing two methods (`isConfigured`, `search`).

---

## AI architecture

The model is used for **reasoning and reading**, never as evidence:

| Task | Tier | Why |
| --- | --- | --- |
| Query understanding enrichment | fast | Fills gaps in the deterministic parse |
| Gap query generation | fast | Suggests search angles the templates missed (validated against the target) |
| Evidence reading (only where deterministic scan found nothing) | fast | Lifts short verbatim quotes; rejected unless the quote exists in the page text |
| Compatibility reasoning (caveats/checklist detail) | smart | May add warnings; **cannot change the verdict** |
| Final answer phrasing | smart | Rejected if it introduces unknown model numbers |
| Part photo identification | vision | Reads printed identifiers only; the user confirms the identifier before research |

Providers: **OpenAI, Gemini, Anthropic** (`AI_PROVIDER`), or `none`. With `none` PartScout still does
full live-web research with the deterministic engine — it simply writes plainer answers and cannot
read photos.

Prompt hardening (`prompts.ts`): retrieved text is declared untrusted data, instructions inside it are
to be ignored and reported, identifiers must appear literally in the evidence, and “not enough
evidence” is an explicitly correct answer.

---

## Compatibility & checklist engine

* 19 part categories (screen, battery, charging flex, charging board, power flex, volume flex, back
  cover, back glass, housing, camera, speaker, microphone, fingerprint, buttons, sensors, antenna,
  NFC, wireless charging, other).
* Each category carries its own checklist with **no size-based rule**: e.g. screen checks connector,
  panel technology, frame/service-pack revision and flex layout; battery checks nominal voltage,
  capacity, connector and cell revision.
* Checklist statuses are `supported`, `contradicted`, `conflicting`, `unknown`. Evidence for a check
  is gathered from the claim sentence **plus a ±400/+800 character window of the originating page**,
  because connector/revision details usually live next to the claim, not inside it.
* Claim clustering is family-aware: a quoted SKU (`SM-A155F`) on a page that never writes the family
  name still matches the “A15” family through core-token matching, and claims keep their generation
  markers (`4g`, `5g`) so sibling variants are reported as **variant risks** instead of matches.
* Reverse lookups (`part → phones`) deliberately treat all device-bearing claims as on-target and
  produce a ranked list of devices, each traceable to claim ids and domains.
* If the opposing side dominates with two or more independent domains, the verdict is
  `insufficient_evidence` — never a forced conclusion.

---

## Confidence system

Levels (all reports show **Evidence Confidence: NN%** plus the disclaimer):

| Level | Meaning |
| --- | --- |
| 🟢 `CONFIRMED` | ≥4 independent domains, ≥85%, ≥2 high-quality domains, no opposing evidence, exact-target evidence |
| 🟢 `HIGH_CONFIDENCE` | ≥3 independent domains, ≥72% |
| 🟡 `LIKELY` | ≥55% with support and no serious opposition |
| 🟠 `POSSIBLE` | ≥35%, or support exists but siblings/conflicts are involved |
| ⚪ `UNKNOWN` | Thin, failed or absent evidence (score capped at 18%) |
| 🔴 `NOT_COMPATIBLE` | Single-sided opposing evidence ≥0.55 strength (score floored at 60%) |

Breakdown (weights): `source quality ×0.24`, `independence ×0.22`, `agreement ×0.20`,
`technical specificity ×0.12`, `part-number support ×0.12`, `high-quality domains ×0.06`,
`exact-target evidence ×0.04`, minus conflicts and evidence-volume penalties and a variant penalty
(≤0.12). Independence saturates at three domains, so three suppliers agreeing outrank one page
repeated three times.

Every report carries `confidence.disclaimer`: evidence confidence is a measure of the *evidence trail*,
not a laboratory guarantee of fitment.

---

## Caching

Three layers, TTL-driven, Postgres-backed with an in-process fallback (no database required):

| Layer | Key | TTL env | Purpose |
| --- | --- | --- | --- |
| Search cache | provider + query + options | `SEARCH_CACHE_TTL_MINUTES` (360) | Repeat queries cost nothing |
| Source cache | canonical URL | `SOURCE_CACHE_TTL_MINUTES` (1440) | Re-parsing the same page is free |
| Research cache | normalised question + providers + `pipelineVersion` | `RESEARCH_CACHE_TTL_MINUTES` (720) | Whole reports are reused and labelled “cached” |

The cache key includes `cacheConfig.pipelineVersion`, so shipping a pipeline change invalidates stale
reports automatically. When a report is served from cache the UI says so and offers **Refresh
research**, which invalidates the entry and re-runs the pipeline live (`POST /api/cache/refresh`).

---

## Cost control

* Hard caps per run: `MAX_QUERIES_PER_RESEARCH` (≤10), `MAX_RESULTS_PER_QUERY`, `MAX_PAGES_TO_FETCH`,
  `MAX_FETCH_BYTES`, `MAX_PAGE_TEXT_CHARS`, `MAX_AI_INPUT_CHARS`, `MAX_AI_OUTPUT_TOKENS`.
* Fast models for planning/extraction, smart models only for reasoning/phrasing.
* Per-IP rate limits: `MAX_RESEARCHES_PER_HOUR_PER_IP`, `MAX_IDENTIFICATIONS_PER_HOUR_PER_IP`, plus
  per-endpoint limits for auth and feedback.
* Usage accounting per run (`UsageTracker` → `UsageRecord`): search calls, page fetches, AI calls,
  prompt/completion tokens, latency, estimated USD cost. The admin dashboard aggregates it.
* Token prices are documented list prices used for estimates in `src/lib/research/usage.ts` — update
  them there when a provider changes pricing.

---

## Data model (PostgreSQL + Prisma)

`prisma/schema.prisma` (PostgreSQL) defines: `User`, `Account`, `Session`, `Search`,
`ResearchSession`, `ResearchSource`, `ResearchClaim`, `SavedSearch`, `Feedback`, `UsageRecord`,
`PartIdentification`, `SearchCache`, `SourceCache`, `ResearchCache`, `ApiErrorLog`.

**Compatibility data is not stored as fact.** `ResearchSession.report` is an immutable snapshot of one
research run (JSON) with the *sources that produced it*; `ResearchSource`/`ResearchClaim` are that
run's audit trail. Nothing is ever read back to answer a *different* question — cache hits are keyed
by the exact normalised question and expire.

Degraded mode: with no `DATABASE_URL` (or an unreachable database) research, identification and reports
still work; history, saved searches, feedback and metrics are simply unavailable, and the UI says so.

---

## Security

| Area | Implementation |
| --- | --- |
| Input validation | Zod schemas for every API body/query; `validateUpload` + magic-byte sniffing for images |
| Auth | Email+password (bcrypt, cost 12) and optional Google OAuth; stateless JWT (HS256, `jose`) in an httpOnly, SameSite=Lax, Secure-in-production cookie |
| CSRF | Double-submit token: readable `ps_csrf` cookie + `x-partscout-csrf` header verified on every state-changing route |
| Authorisation | Session checks on history/saved/profile; `/admin` and `/api/admin/metrics` require `ADMIN_EMAILS` membership |
| Rate limiting | Sliding-window limiter on research, identify, auth, feedback, preview |
| SSRF | `safety/ssrf.ts`: https/http only, blocked hostnames, IPv4 **and** IPv6 private/link-local/loopback/metadata ranges (including bracketed literals), DNS resolution check, byte caps, timeouts, content-type allow-list |
| Prompt injection | `safety/untrusted.ts`: instruction patterns redacted, delimiter breakout blocked, evidence wrapped in unbreakable blocks, findings surfaced as user-visible warnings |
| XSS / links | React escaping everywhere; external links rendered with `rel="noopener noreferrer nofollow"`; `safeExternalHref()` rejects `javascript:`/`data:` |
| Cookies / headers | `next.config.ts` sets security headers; no secrets in client bundles (`NEXT_PUBLIC_*` only for the app URL/name) |
| Uploads | MIME allow-list, size cap, magic-byte check, processed in memory, never written to disk |

`.env` is git-ignored; `.env.example` documents every variable.

---

## Routes & API

**Pages:** `/` · `/search` · `/search/phone` · `/search/part` · `/search/compatibility` · `/identify` ·
`/results/[id]` · `/history` · `/saved` · `/profile` · `/pricing` · `/about` · `/help` · `/admin` ·
`/login` · `/register` · `/sitemap.xml` · `/robots.txt` · `/manifest.webmanifest`

**API:**

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/research` | Run research, return the full report |
| `POST` | `/api/research/stream` | Same, streamed as SSE (`stage` events + final `report` event) |
| `GET` | `/api/research/[id]` | Fetch a persisted or cached report |
| `POST` | `/api/search` | Query-understanding preview (intent + planned queries) |
| `GET` | `/api/search?q=` | Autocomplete over the user's earlier research |
| `POST` | `/api/identify` | multipart photo → identifier (+ optional research) |
| `POST` | `/api/identify/manual` | Research a typed identifier without vision |
| `POST` | `/api/cache/refresh` | Invalidate a cached report and re-research |
| `POST` | `/api/feedback` | Helpfulness + reason + comment |
| `GET/POST/DELETE` | `/api/saved` | Saved searches |
| `GET` | `/api/history` | Research history + identifications |
| `PATCH` | `/api/profile` | Display name |
| `POST` | `/api/auth/register\|login\|logout` | Email auth |
| `GET` | `/api/auth/google` + `/callback` | Google OAuth |
| `GET` | `/api/auth/me` | Session + capability snapshot |
| `GET` | `/api/admin/metrics` | Admin metrics (read-only by design) |
| `GET` | `/api/health` | Provider/database capability report |

Every JSON response uses the envelope `{ ok: true, data }` or
`{ ok: false, error: { code, message, remediation[], retryable } }` — the UI renders real provider
errors instead of guessing.

---

## Design system

Dark-first, designed light mode (not an inversion).

| Token | Dark (primary) | Light |
| --- | --- | --- |
| Background | `#05070D` | `#F6F7FB` |
| Surface / Surface2 | `#0A0F1C` / `#0D1322` | `#FFFFFF` / `#F1F3F9` |
| Border | `#1E293B` | `#D9DEEA` |
| Primary / Secondary | `#6366F1` / `#8B5CF6` | `#4F46E5` / `#7C3AED` |
| Success / Warning / Danger | `#22C55E` / `#F59E0B` / `#EF4444` | `#15803D` / `#B45309` / `#B91C1C` |
| Text / Muted | `#F8FAFC` / `#94A3B8` | `#0F172A` / `#5B657A` |

Implemented as CSS custom properties in `src/app/globals.css`, exposed to Tailwind v4 via `@theme
inline`. Glass is used sparingly (sticky header, capability banners); animation is limited to
entrance/hover micro-interactions and respects `prefers-reduced-motion`. Mobile-first: large tap
targets, sticky research box, camera capture on the identify page, tabular numbers for scores.

---

## Local development

```bash
git clone https://github.com/Obiorachibuike/PartScout && cd PartScout
npm install
cp .env.example .env          # then edit: at minimum SEARCH_PROVIDER + its API key
npm run env:check             # tells you exactly what is configured / missing
npm run dev                   # http://localhost:3000
```

**Run without any API keys** (offline UI work — synthetic pages, always labelled):

```bash
PARTSCOUT_ALLOW_FIXTURES=true SEARCH_PROVIDER=fixture AI_PROVIDER=none npm run dev
```

That mode is for building and testing only. Production refuses to serve fixture data as research.

Handy scripts:

```bash
npm run dev          # dev server (Turbopack)
npm run build        # production build
npm run start        # production server
npm run typecheck    # tsc --noEmit
npm test             # vitest (research flows + security)
npm run test:research -- "Galaxy A15 4G charging flex"   # one live research run in the terminal
npm run env:check    # environment doctor
```

`npm run test:research` prints the verdict, confidence breakdown, queries, sources, claims and usage
for a single question — the fastest way to sanity-check a provider key.

---

## Database setup

```bash
# 1. a Postgres instance (local, Docker, Neon, Supabase, RDS…)
docker run --name partscout-db -e POSTGRES_PASSWORD=partscout -e POSTGRES_USER=partscout \
  -e POSTGRES_DB=partscout -p 5432:5432 -d postgres:17

# 2. point PartScout at it
echo 'DATABASE_URL=postgresql://partscout:partscout@localhost:5432/partscout?schema=public' >> .env

# 3. create the Prisma client + schema
npm run db:generate     # prisma generate
npm run db:deploy       # prisma migrate deploy  (or `npm run db:migrate` while developing)

# 4. optional demo user (no compatibility data is ever seeded)
npm run db:seed
```

The seed creates a demo user (`SEED_USER_EMAIL`, `SEED_USER_PASSWORD` or a generated password) and
nothing else — research rows appear from real use. Admin access is granted by adding an email to
`ADMIN_EMAILS` and signing in again; there is intentionally no admin UI for entering compatibility
data.

---

## Environment variables

See `.env.example` for the annotated list. The essentials:

| Variable | Required | Purpose |
| --- | --- | --- |
| `SEARCH_PROVIDER` + matching key | **yes** | `tavily` \| `exa` \| `serper` \| `brave` |
| `NEXT_PUBLIC_APP_URL` | yes (prod) | Canonical URLs, OG metadata, sitemap, OAuth redirect |
| `DATABASE_URL` | recommended | Persistence, history, cache, metrics |
| `AUTH_SECRET` | yes (prod) | Session signing (≥16 chars; `openssl rand -base64 48`) |
| `AI_PROVIDER` + matching key | optional | `openai` \| `gemini` \| `anthropic` \| `none` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | optional | Google sign-in |
| `ADMIN_EMAILS` | optional | Comma-separated admin list |
| `PARTSCOUT_ALLOW_FIXTURES` | dev only | Enables the fixture provider outside production |
| Limits & TTLs | optional | `MAX_*`, `*_CACHE_TTL_MINUTES`, `RESEARCH_TIMEOUT_MS` … |

---

## Testing

```bash
npm test                          # all suites
npx vitest run tests/safety.test.ts
npm run test:research -- "question"   # live end-to-end single run (needs a provider key)
```

* `tests/research-flow.test.ts` — **10 research flows** plus cross-cutting invariants:
  phone→charging flex, phone→battery, OEM part number, phone→power flex, part→phones reverse lookup,
  part number→device with a prompt-injection page, photo→identifier→research, conflicting sources,
  no evidence at all, and cached research (including forced refresh). Every compatibility verdict is
  asserted to have at least one claim and one source, and every claim's source must appear in the
  report.
* `tests/safety.test.ts` — SSRF vetting (IPv4 + IPv6, metadata endpoints, protocols, content types),
  prompt-injection neutralisation and block-breakout defence, upload magic-byte/size validation, rate
  limiting.
* `tests/helpers/memory-db.ts` — an in-memory Prisma double injected through
  `setDatabaseClientForTesting()`, so persistence, saved searches, feedback and metrics are exercised
  without Postgres.
* `scripts/verify-research.ts` — the fixture harness used during development; it runs the four fixture
  scenarios and asserts the same invariants as the test-suite.

Fixtures are synthetic. They exist so the pipeline can be tested without spending credits — never to
produce a demo answer. Every fixture-backed report is labelled `fixtureData` in the payload and badged
in the UI.

---

## Deployment

PartScout is a standard Next.js app; any Node host works (Vercel, Fly, Render, a VPS, Docker).

1. Set the environment variables (at minimum `SEARCH_PROVIDER` + key, `NEXT_PUBLIC_APP_URL`,
   `AUTH_SECRET`, `DATABASE_URL`).
2. `npm ci && npm run build && npm run start`.
3. Run `npm run db:deploy` as a release step (and `npm run db:generate` during build if your host does
   not run postinstall).
4. Verify `GET /api/health` returns `status: "ok"` and `GET /api/admin/metrics` works for an admin
   account.

Notes:

* Prefer at least 60s function timeout for `/api/research` and `/api/research/stream`
  (`RESEARCH_TIMEOUT_MS` default 75s) — the route files declare `maxDuration = 120`.
* The in-process rate limiter and the memory cache are per-instance. For multi-instance deployments,
  front PartScout with a shared limiter (Redis/Upstash) and rely on Postgres for caching — the
  interfaces are already isolated for this.
* `PARTSCOUT_ALLOW_FIXTURES` must never be `true` in production.

---

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Every question returns “not enough evidence” | No usable search provider | `npm run env:check`; set `SEARCH_PROVIDER` + key; check `/api/health` |
| `provider_not_configured` in the UI | Same as above (the UI shows the exact remediation) | as above |
| `no_sources` failure code | Provider reachable but returned nothing for any query | Check provider quota/billing; try a different provider; narrower question |
| `no_evidence` failure code | Pages fetched but no usable claim | Add the exact model number or OEM part number |
| “metadata only” source badge | Page fetch blocked (paywall, bot wall, timeout, non-HTML) | Expected: that source simply did not contribute evidence |
| History/saved/feedback empty | No `DATABASE_URL` or migrations not applied | `npm run db:generate && npm run db:deploy` |
| Photo identification says vision is unavailable | `AI_PROVIDER=none` or key missing | Set a vision-capable provider; or use the manual identifier field |
| `rate_limited` | Per-IP limits | Wait, or raise `MAX_RESEARCHES_PER_HOUR_PER_IP` |
| `timeout` | Many slow pages | Lower `MAX_PAGES_TO_FETCH`, raise `RESEARCH_TIMEOUT_MS` |
| Research answers look like fixtures in dev | `SEARCH_PROVIDER=fixture` | Expected in offline mode — reports are badged; never enable in production |
| Warnings mention instruction-like text | A retrieved page tried to prompt-inject | Working as designed; treat that source as unreliable |

---

## Project layout

```
prisma/            schema.prisma (Postgres), seed.ts
scripts/           verify-research.ts (fixture harness), check-env.ts (environment doctor)
src/app/           App Router pages + API routes
  api/             research, research/stream, search, identify, cache, feedback, saved,
                   history, profile, auth/*, admin/metrics, health
  results/[id]/    server-rendered report page
src/components/    layout, home sections, research report components, identify flow, auth forms, ui
src/lib/
  research/        the ten pipeline stages + cache, usage, verdict presentation, SSE client
  providers/       search/* and ai/* behind interfaces (+ http.ts fetch helpers)
  domain/          parts catalog/checklists, device & model-number parsing, part matching
  safety/          ssrf.ts, untrusted.ts (injection defence)
  db/              client.ts (lazy, failure-tolerant Prisma), research-repository.ts, types.ts
  auth/            session.ts (JWT + CSRF), password.ts, accounts.ts, google.ts
  validation/      Zod schemas for every input
tests/             research-flow + safety suites, memory-db double
```

---

## Roadmap / not built yet

Honest scope notes:

* **Billing** — plans (`free`/`pro`/`technician`) exist as architecture (stored on the user, surfaced
  on the pricing page and in limits) but no payment provider is wired up.
* **Offline OCR** — identification requires a vision-capable AI provider; there is no local OCR model.
* **Shared rate-limit backend** — the limiter is in-process (see Deployment).
* **Scheduled re-research** — the cache expires; PartScout does not currently re-run saved queries in
  the background.
* **Multi-language** — UI and prompts are English-only.

---

## License

PartScout is provided as-is for research assistance. It reports what published sources state, with the
evidence attached — **it does not test parts and does not guarantee fitment**. Always verify a part
against the device before installing.
