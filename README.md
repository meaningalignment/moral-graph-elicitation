# Moral Graph Elicitation

*Developed by the [Meaning Alignment Institute](https://www.meaningalignment.org/), funded by [OpenAI](https://openai.com/blog/democratic-inputs-to-ai). Companion to the paper [What are human values, and how do we align AI to them?](https://arxiv.org/abs/2404.10636). Live deployment available at [dft.meaningalignment.org](https://dft.meaningalignment.org).*


## Table of Contents

- [Overview](#overview)
    - [Background](#background)
    - [Tech Stack](#tech-stack)
    - [Output](#output)
- [Setting Up a New Environment](#setting-up-a-new-environment)
- [Setting Up a New Deliberation](#setting-up-a-new-deliberation)
- [Simulating a Deliberation](#simulating-a-deliberation)
- [Testing](#testing)
- [Contributing](#contributing)
    - [Local Setup](#local-setup)
    - [Database Evolution](#database-evolution)
- [Additional Documentation](#additional-documentation)

# Overview

Moral Graph Elicitation (MGE) is an initiative aimed at achieving a fine-tuned model that bridges political, cultural, and ideological boundaries. More info can be found in our [paper](./paper.pdf). 

This repository hosts code for an application with a new democratic process that takes ~15 minutes to complete.

Participants go through the following steps:

1. **Dialogue**: Participants interact with a chatbot, discussing values they believe ChatGPT should have when responding to contentious questions.
2. **Vote on Values**: Participants vote on values proposed by their peers.
3. **Vote on Wisdom Transition**: Participants vote on wether the transition from one value to another represents an increase in wisdom.

This process generates a [moral graph](https://dft.meaningalignment.org/data/edges), which can be used to find convergence in which values ChatGPT should have in contentious scenarios, while remaining legible and democratically legitimated.

![Moral Graph](./graph.png)

An example graph can be [explored here](https://dft.meaningalignment.org/data/edges).

## Background

Our aspiration with DFT is to craft a model universally regarded as "wise." Such a model would resonate with Republicans, Democrat, irrespective of their ideological or cultural bearings. The ultimate goal is to mitigate the prospects of ideological conflicts amplified by models individually fine-tuned based on group or individual preferences. Two novel techniques are employed:

- **Value Alignment**: Rather than aligning with preferences, the model is aligned with values. These values are sourced from an expansive and diverse demographic. For more on how we define values, [please read our paper](./paper.pdf).
- **Moral Graph Creation**: This graph helps find convergent values.

Subsequent endeavors will focus on fine-tuning the LLM based on these values.

## Tech Stack

- **Development Language**: TypeScript
- **Framework**: [Remix](https://remix.run)
- **Database**: PostgreSQL
- **Event Queue**: [Inngest](https://inngest.com)
- **Deployment Platform**: [Vercel](https://vercel.com)

## Output

- **Database schema**: [schema.prisma](./schema.prisma).
- **Moral graph summarisation, dedup, transition story generation**: live in
  [`app/lib/values-tools`](./app/lib/values-tools). These were vendored from
  [`values-tools`](https://github.com/meaningalignment/values-tools) so the app
  has no upstream LLM-helper dependency and routes everything through OpenAI.
- **Data export**: a moral graph can be exported in JSON format via the
  `/data/graph` endpoint (see `app/routes/api.data.graph.ts`).


# Setting Up a New Environment

To initialize a new environment, follow these steps:

## Initial Configuration

1. **Environment Variables**: Begin by duplicating the `.env.example` file to create a `.env` file.

## Setup Dependencies

Our application relies on several external services for various functionalities. You'll need to set up accounts and obtain API keys for the following services:

- **Mailgun (For Sending Login Emails)**:
  - Create an account on [Mailgun](https://www.mailgun.com/).
  - Obtain your API key from the Mailgun dashboard.
  - Add your Mailgun API key etc. to the `.env` file.

- **OpenAI (For OpenAI APIs)**:
  - Add your OpenAI API key to the `.env` file.

- **Inngest (Event Queue for Background Jobs)**:
  - Create an account on [Inngest](https://inngest.com/).
  - Follow the Inngest setup process to initialize your event queue.
  - No immediate `.env` configuration is required; Once your vercel project is configured, you can connect your inngest account to vercel by clicking "Connect to Vercel" from the Inngest dashboard.

## PostgreSQL Database Setup

We recommend using Vercel PostgreSQL for the database:

- **Vercel PostgreSQL**:
  - If you haven't already, sign up or log in to [Vercel](https://vercel.com/).
  - Navigate to the Integrations or Database section and create a new PostgreSQL database.
  - Once your database is created, Vercel will provide you with the necessary environment variables.
  - Copy these POSTGRES environment variables into your `.env` file.
  - Populate the database by running `npx prisma generate && npx prisma db push`.

## Deployment

- **Create a New Vercel Project**:
  - In your Vercel dashboard, create a new project by importing this repository.
  - During the import process, Vercel will automatically detect the project settings. Make sure to review them for accuracy.
  - Update the .env variables.

- **Link Inngest to Your Vercel Project**:
  - Log into your [Inngest](https://inngest.com/) account.
  - Navigate to the section where you can connect to Vercel and select the option to "Connect to Vercel".
  - Follow the prompts to authorize and link Inngest with your Vercel project. This action will automatically populate your Vercel project with the necessary environment variables for Inngest.

After completing these steps, your environment should be set up and ready.

# Setting Up a New Deliberation

Deliberations are containers for a topic, the questions generated for that topic, the contexts, the values articulated by participants, and the votes between values. Here is the actual flow:

1. **Make yourself an admin user**: set `isAdmin = true` on your user row in the DB.
2. **Create a deliberation**: navigate to `/dashboard/new` (linked from `/dashboard`). Enter a title and topic, pick how many questions and contexts to generate. Submitting kicks off background generation via Inngest.
3. **Wait for setup**: the deliberation page polls `setupStatus` until it transitions to `ready`. You'll see questions and contexts populate.
4. **Share or simulate**: participants can begin at `/deliberation/:id/start`. As an admin you can also click **Simulate Participants** on the dashboard to drive synthetic personas through the full flow (see [Simulating a Deliberation](#simulating-a-deliberation) below).

# Simulating a Deliberation

The simulator drives one or more synthetic personas through the articulation and voting flow. Every action is attributed to a `User` row marked `role = ["SIMULATED"]` and named `sim+<persona-slug>@simulation.local`, so you can backtrack who did what.

```bash
# Drive 4 personas (in order from simulation/personas/) through deliberation 40
npm run simulate -- --deliberation 40 --personas 4

# Specific personas, articulation only
npm run simulate -- --deliberation 40 --personas worried-parent,civil-libertarian --articulate-only

# Voting only (on existing edge hypotheses)
npm run simulate -- --deliberation 40 --personas community-organizer --vote-only --limit 10
```

Personas live in [`simulation/personas/`](./simulation/personas) as JSON files. Each persona has a `name`, `demographic`, `voice`, and `leanings`. Add new ones by dropping new JSON files in that directory.

A run writes per-persona JSONL transcripts to `simulation/transcripts/<runId>/<personaSlug>.jsonl` for full debuggability.

The simulator and the human chat UI share the same articulation logic — the system prompt (see `app/services/articulation/prompt.ts`) and the same `submit_values_card` tool — so what the simulator does is what a real participant would do.

# Testing

Two layers:

```bash
# Unit tier (no LLM, no DB, < 2s)
npm run test:unit

# Pipeline tier (real LLM, real DB, costs credits)
RUN_PIPELINE=1 TEST_POSTGRES_URL=... npm run test:pipeline

# Or run a single fixture as a script (human-readable PASS/FAIL)
tsx tests/pipeline/dedup.fixture.ts
```

Fixtures are sampled from real paper data. Build / refresh them with:

```bash
npm run fixtures:dedup
npm run fixtures:transitions
```

A live quality dashboard is also available at `/dashboard/:id/quality` (admin only).

## Dedup dry-run (does it actually cluster sensibly?)

To test the production deduplication pipeline against a real deliberation **without writing anything to the database**, use the dry-run. It pulls the deliberation's `ValuesCard` rows, runs the same `deduplicateValues` clustering function the production cron uses, then asks an in-repo discriminator (the same 5-criterion rubric the dedup pipeline is supposed to satisfy) whether each resulting cluster *actually* makes sense.

```bash
# Diagnostic — colored cluster-by-cluster scorecard, never writes
npm run dedup:dryrun -- --deliberation 33 --limit 40

# Same logic, gated as a vitest regression test
RUN_PIPELINE=1 DEDUP_DRYRUN_DELIBERATION=33 DEDUP_DRYRUN_LIMIT=25 npm run test:pipeline
```

For each multi-member cluster the discriminator returns `allEquivalent: true|false`, the largest equivalent subset, and the outlier ids — so when the pipeline produces a junk cluster you immediately see *which* card it shouldn't have grouped and *which* of the 5 criteria fails.

# Contributing

## Local Setup

1. **Install Dependencies**: `npm i`
2. **Generate Prisma Schema**: `npx prisma generate`
3. **Environment Configuration**: Duplicate `.env.example` to create `.env` and populate it with relevant values.
4. **Run Development Server**: `npm run dev`

## Database Evolution

To update the database schema, execute: `npx prisma db push`. The schema can be found [here](./schema.prisma).

## Dev login (skip the email-code flow)

`POST /auth/dev` lets you log in as any existing user without round-tripping a Mailgun login code. Gated by `SESSION_SECRET` (the same env var cowpunk-auth uses to sign cookies) and hard-disabled when `NODE_ENV=production` (returns 404).

There's a small form at `GET /auth/dev` for manual use, or hit it from the shell:

```bash
# Log in as user id 1 and capture the session cookie
curl -s -c /tmp/cookies.txt -X POST http://localhost:5173/auth/dev \
  -d "secret=$SESSION_SECRET" -d "userId=1" -d "redirect=/"

# Then any authed route works
curl -s -b /tmp/cookies.txt http://localhost:5173/deliberation/33/start
```

Form fields: `secret` (required, must equal `process.env.SESSION_SECRET`), `userId` (defaults to `1`), `redirect` (defaults to `/`).

## Querying the database

A small helper script `scripts/db.ts` runs read-only queries via Neon's HTTPS-based serverless driver. Useful in environments that block raw `5432/tcp` (CI sandboxes, edge runtimes, etc.):

```bash
npm run db -- 'SELECT COUNT(*) FROM "Deliberation"'
npm run db -- --json 'SELECT id, title FROM "Deliberation" LIMIT 5'
```

For the running app (Remix/Inngest) in those same environments, set `USE_NEON_HTTP_DRIVER=true` in your `.env`. This routes Prisma through `@prisma/adapter-neon` instead of the default TCP connection.


## Additional Documentation

- [Remix Documentation](https://remix.run/docs)
- [Vercel Documentation](https://vercel.com/docs)

---

*Thank you for your engagement with Democratic Fine-Tuning. We value your contributions and insights.*
