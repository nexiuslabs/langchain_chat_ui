A small LangGraph/LangChain + FastAPI service that:

collects/edits an ICP (ideal customer profile) via a chat-style agent,

crawls/enriches companies,

scores leads against the ICP,

optionally syncs results into Odoo (Postgres),

exposes a LangServe endpoint (/agent) and two CSV/JSON exports.

Main folders:

app/ – FastAPI app, LangServe wiring, Odoo utilities, SQL migrations.

src/ – the actual “agents” (ICP normalization, enrichment, lead scoring), DB & clients.

Key files to skim:

app/main.py (API routes, request normalization, LangServe mount)

app/pre_sdr_graph.py (chat graph for the ICP conversational flow)

src/icp.py (ICP/normalization state graphs)

src/enrichment.py (crawl + AI extraction + persistence)

src/lead_scoring.py (feature build + scoring + rationale)

src/orchestrator.py (batch runner that stitches the pipeline)

src/database.py (asyncpg/psycopg2 helpers)

app/migrations/*.sql (schema pieces, multi-tenant + Odoo add-ons)

Runtime flow (end-to-end)

User chat → ICP collection (LangGraph)

app/pre_sdr_graph.py builds a state machine that chats with the user to gather ICP fields (industries, geo, size, revenue bucket, signals, etc.).

LLM: langchain_openai.ChatOpenAI (model/temperature configured in src/settings.py).

The graph collects fields, asks follow-ups, then asks for confirm.

ICP persists + “staging sync”

Normalization of inbound messages happens in app/main.py (normalize_input via RunnableLambda) before hitting the graph, including quick extraction of industry terms and an optional staging upsert to a companies table if certain headers/inputs are present.

Confirmed ICP is saved into Postgres (see src/icp.py and app/migrations/004_multi_tenant_icp.sql which defines icp_rules and tenant scaffolding).

Enrichment agent

src/enrichment.py: crawls with Tavily (if key present) or a local HTTP crawler in src/crawler.py, merges snippets, and uses an LLM prompt to extract signals (public emails, tech, phones, etc.).

Persists into company_enrichment_runs and (optionally) crawl_corpus for transparency. (See migrations 003_crawl_corpus.sql and 006_company_enrichment_runs_public_emails.sql.)

Lead-scoring agent

src/lead_scoring.py: builds features (industry_norm, employees_est, geo, revenue bucket, incorporation year, etc.) and scores companies.

If you have historical labels, it trains a LogisticRegression; otherwise it falls back to heuristic distance-to-ICP rules.

It also calls src/openai_client.py::generate_rationale to produce an LLM explanation for each score.

Results are written into a lead_scores table that is assumed to exist (referenced in app/main.py export queries).

Exports & Odoo

GET /export/latest_scores.json|.csv joins companies with lead_scores for your top-N results.

app/odoo_store.py manages an SSH tunnel + Postgres connection to an Odoo DB and maps enriched data into res_partner / crm_lead (see 001_presdr_odoo.sql for added columns like x_pre_sdr_score, x_pre_sdr_features, etc.).

LangServe endpoint

add_routes(app, ui_adapter, path="/agent") in app/main.py exposes the ICP chat graph as a LangServe runnable. You can post role-based messages (Human/System/AI) and drive the conversation.

Other routes

GET /health

GET /export/latest_scores.json

GET /export/latest_scores.csv

Agent architecture (how the “agents” work)
A) ICP conversational agent

Where: app/pre_sdr_graph.py

Engine: langgraph.StateGraph with message state (GraphState + add_messages).

LLM: ChatOpenAI (model/temperature from env).

Behavior:

Nodes prompt for missing ICP fields in a fixed order (industry → geo → size → revenue → signals).

Adds clarifying AI messages if fields are missing or ambiguous.

Final “confirm” node persists the payload and returns a success message.

Input pre-processing: RunnableLambda(normalize_input) coerces payloads, extracts up to 10 industry terms (regex), and optionally does a companies “staging” upsert.

B) ICP normalization + persistence

Where: src/icp.py

Graphs: a tiny normalization graph (_norm_graph) and the ICP graph (_icp_graph) that writes to Postgres via get_conn().

Normalization: resilient key mapping (e.g., accept employees, size, string “100-500”, etc.), year extraction with regex, industry canonicalization.

C) Enrichment agent

Where: src/enrichment.py (+ src/crawler.py)

Flow:

fetch home pages / “pricing”, “about”, “careers”, etc. (robots.txt aware, small max page count),

merge & clean text,

prompt LLM to extract fields: emails, phones, tech hints, partner badges, certifications, hiring hints,

persist run metadata + (optionally) full corpus.

Fallback behavior: if Tavily is off, uses in-house crawler only.

Tables touched: company_enrichment_runs, crawl_corpus (optional), and the base companies row for core columns (employees, industry_norm, etc., if updated).

D) Lead-scoring agent

Where: src/lead_scoring.py

Features: industry bucket, employee count, revenue bucket, geo, incorporation year, simple tech/signal flags.

Model:

Supervised path: LogisticRegression(class_weight='balanced').

Unsupervised path: rule-based distance to the ICP payload (range overlap → partial credit).

Outputs:

lead_scores.prob and a bucket label,

rationale via LLM (src/openai_client.generate_rationale).

E) Orchestrator

Where: src/orchestrator.py

Purpose: batch “glue code” that:

fetches candidate companies from DB,

runs enrichment + lead scoring,

prints/persists JSON results,

is the place you’d put a cron/scheduler.

Database & ERD (what exists vs referenced)

Migrations in app/migrations create/alter these explicit tables:

Multi-tenancy & ICP

tenants(tenant_id PK, name, status)

tenant_users(tenant_id FK→tenants, user_id, roles[])

icp_rules(rule_id PK, tenant_id FK, name, payload JSONB, created_at, updated_at)

(Materialized view mentioned in SQL for candidate companies against rules)

Odoo integration (extends Odoo’s own tables)

res_partner (adds: x_industry_norm, x_employees_est, x_revenue_bucket, etc.)

crm_lead (adds: x_pre_sdr_score, x_pre_sdr_bucket, x_pre_sdr_features, x_pre_sdr_rationale, x_source_urls)

Enrichment artifacts

company_enrichment_runs(..., public_emails TEXT[], verification_results JSONB) (columns ensured in 006_*.sql)

crawl_corpus(id PK, company_id, page_count, source, corpus, created_at)

Contacts

lead_emails(email PK, company_id, first_name, last_name, role_title, verification_status, smtp_confidence, …)

Unique index for contacts(company_id, email) if you have a contacts table (see 002_contacts_unique_email.sql).

Odoo connection info

odoo_connections(…) for SSH/DB routing per tenant (defined in 004_multi_tenant_icp.sql).

Referenced but not created here (expected to exist):

companies – the main company master used throughout the code (upserts, joins, scoring).

lead_scores – where scoring results are stored (joined in the export endpoints).

The code reads/writes companies & lead_scores (e.g., app/main.py export queries and src/orchestrator.py) but their DDL isn’t in this repo. They’re assumed to live in your target Postgres.

ERD (Mermaid)
erDiagram
  TENANTS ||--o{ TENANT_USERS : "has"
  TENANTS ||--o{ ICP_RULES : "has"
  TENANTS ||--o{ ODOO_CONNECTIONS : "has"

  ICP_RULES {
    int rule_id PK
    int tenant_id FK
    text name
    jsonb payload
    timestamptz created_at
    timestamptz updated_at
  }

  TENANTS {
    int tenant_id PK
    text name
    text status
  }

  TENANT_USERS {
    int tenant_id FK
    text user_id
    text[] roles
  }

  ODOO_CONNECTIONS {
    int id PK
    int tenant_id FK
    text host
    int port
    text db_name
    text user_name
    text tunnel_config
  }

  COMPANIES ||--o{ LEAD_SCORES : "scored in"
  COMPANIES ||--o{ LEAD_EMAILS : "has"
  COMPANIES ||--o{ COMPANY_ENRICHMENT_RUNS : "enrichment runs"
  COMPANIES ||--o{ CRAWL_CORPUS : "pages captured"

  COMPANIES {
    int company_id PK
    text name
    text industry_norm
    int employees_est
    text revenue_bucket
    text[] geos
    int incorporation_year
    timestamptz last_seen
    -- plus other inferred columns
  }

  LEAD_SCORES {
    int company_id FK
    numeric score
    text bucket
    jsonb features
    text rationale
    timestamptz created_at
  }

  LEAD_EMAILS {
    text email PK
    int company_id FK
    text first_name
    text last_name
    text role_title
    text verification_status
    float smtp_confidence
    bool left_company
    timestamptz role_last_seen
    text source
    jsonb source_json
    timestamptz last_verified_at
    int bounce_count
  }

  COMPANY_ENRICHMENT_RUNS {
    int id PK
    int company_id FK
    jsonb payload
    text[] public_emails
    jsonb verification_results
    timestamptz created_at
  }

  CRAWL_CORPUS {
    bigint id PK
    bigint company_id FK
    int page_count
    text source
    text corpus
    timestamptz created_at
  }

  %% Odoo-side (extended)
  RES_PARTNER {
    int id PK
    text name
    text x_industry_norm
    int x_employees_est
    text x_revenue_bucket
    text x_uen
    -- etc. (see 001_presdr_odoo.sql)
  }

  CRM_LEAD {
    int id PK
    bool active
    int user_id
    int stage_id
    numeric x_pre_sdr_score
    text x_pre_sdr_bucket
    jsonb x_pre_sdr_features
    text x_pre_sdr_rationale
    jsonb x_source_urls
  }

Sequence (agent flow)
sequenceDiagram
  participant User
  participant FastAPI as FastAPI (/agent)
  participant UIAdapter as RunnableLambda(normalize_input)
  participant ICPChat as LangGraph (pre_sdr_graph)
  participant DB as Postgres
  participant Enrich as Enrichment Agent
  participant Scorer as Lead Scoring Agent
  participant Odoo as Odoo PG

  User->>FastAPI: chat messages (LangServe format)
  FastAPI->>UIAdapter: normalize_input(messages)
  UIAdapter-->>FastAPI: normalized payload + signals (industries, etc.)
  FastAPI->>ICPChat: state step (collect fields, confirm)
  ICPChat->>DB: upsert icp_rules / companies (as needed)
  ICPChat-->>FastAPI: confirmation + next actions

  Note over Enrich,Scorer: (batch or triggered)
  FastAPI->>Enrich: run for candidate companies
  Enrich->>DB: write company_enrichment_runs (+ optional crawl_corpus)
  Enrich-->>Scorer: enriched features
  Scorer->>DB: write lead_scores (+ rationale)

  FastAPI->>DB: SELECT companies JOIN lead_scores
  FastAPI-->>User: /export/latest_scores.(json|csv)

  FastAPI->>Odoo: (optional) sync to res_partner/crm_lead via OdooStore

Configuration & infra notes

DB: src/database.py provides asyncpg pool (with search_path public) and a psycopg2 sync connection. DSN from POSTGRES_DSN.

LLM: src/openai_client.py constructs ChatOpenAI with LANGCHAIN_MODEL and TEMPERATURE. generate_rationale uses a small system prompt. Embeddings via the official openai SDK if EMBED_MODEL is set.

Crawler: src/crawler.py respects robots.txt, limits pages (default 6), and hunts for keywords like “pricing”, “about”, “careers”.

Tenancy: Header-based middleware in app/main.py can pick a tenant_id and set search_path or filters accordingly (lightweight).

Odoo: app/odoo_store.py can open an SSH tunnel (sshpass optional) and connect to remote Postgres; 001_presdr_odoo.sql adds the columns the app writes into.

Quick “how do I run it?” (from the code’s implied shape)

Set env in .env (DB DSN, OpenAI key/model, optional Tavily key, etc.; see src/settings.py for names).

Run the service: uvicorn app.main:app --reload.

Open LangServe UI at /agent (POST role-based messages).

Use GET /export/latest_scores.csv after enrichment/scoring ran (manually via src/orchestrator.py or a scheduled task).


Three distinct AI-powered agents (each built around an LLM with LangChain/LangGraph orchestration):

ICP conversational agent

Location: app/pre_sdr_graph.py, src/icp.py

Purpose: chats with the user to collect and normalize ICP (ideal customer profile) fields.

Output: confirmed ICP payload, saved into DB.

Enrichment agent

Location: src/enrichment.py, src/crawler.py

Purpose: crawls company sites, extracts signals (emails, tech stack, hiring info, etc.) via an LLM.

Output: enriched company features, stored in company_enrichment_runs and optionally crawl_corpus.

Lead scoring agent

Location: src/lead_scoring.py

Purpose: builds features from company + ICP, scores them (via ML or heuristic rules), and generates an LLM rationale.

Output: entries in lead_scores with probability, bucket, features, and rationale.


Agents and Database Tables
1. ICP Conversational Agent

Files: app/pre_sdr_graph.py, src/icp.py

Reads/Writes:

icp_rules → saves normalized ICP payloads (per tenant).

companies → can upsert “staging” company rows during input normalization (if company name/domain present).

Purpose: Collect structured ICP from chat and persist it.

2. Enrichment Agent

Files: src/enrichment.py, src/crawler.py

Reads/Writes:

companies → updates fields like industry_norm, employees_est, revenue_bucket.

company_enrichment_runs → logs every enrichment attempt, including extracted signals and emails.

crawl_corpus → optionally stores crawled text corpus for transparency/debugging.

Purpose: Crawl company websites and use LLM to extract structured signals.

3. Lead Scoring Agent

Files: src/lead_scoring.py

Reads/Writes:

companies → reads core attributes and enriched features.

lead_scores → writes model/heuristic score, feature JSON, and LLM rationale.

Purpose: Score companies against ICP and explain reasoning.