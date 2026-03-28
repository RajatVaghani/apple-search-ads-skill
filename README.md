# Apple Search Ads Skill

An [openclawhq.app](https://openclawhq.app) agent skill that monitors and analyzes Apple Search Ads campaigns. Give your AI agent access to your Apple Search Ads account, and it pulls performance data, identifies trends, surfaces wasted spend, and recommends optimizations — all read-only by default.

## What it does

Connect your Apple Search Ads API credentials and the agent can:

- **Monitor campaign health** — daily spend, installs, CPI, tap-through rates across all campaigns
- **Diagnose performance issues** — drill from campaigns → ad groups → keywords → search terms to find exactly what's working and what's burning money
- **Surface wasted spend** — identify keywords and search terms consuming budget with poor or zero conversion
- **Find growth opportunities** — high-converting search terms that aren't managed keywords yet, budget-constrained campaigns worth scaling
- **Compare time periods** — week-over-week, month-over-month, day-over-day trend analysis
- **Analyze geo performance** — which markets are efficient, which have high spend with low return
- **Recommend changes** — specific bid adjustments, negative keywords, budget reallocation, keyword promotions

The agent defaults to **read-only analysis and recommendations**. It never modifies campaigns, bids, or keywords without explicit user approval.

## Reports the agent can produce

- Daily or weekly campaign performance summary
- Wasted spend report (keywords and search terms burning money)
- Keyword opportunity report (search terms worth promoting to managed keywords)
- Negative keyword recommendations
- Geo performance breakdown
- Week-over-week or month-over-month trend analysis
- Ad-hoc answers to any campaign performance question

## Installation

### Prerequisites

- [openclawhq.app](https://openclawhq.app) (or any compatible agent runtime)
- Node.js >= 18
- An Apple Search Ads account with API access enabled

### Install the skill

```bash
codex skills:install github:RajatVaghani/apple-search-ads-skill
```

Or clone manually and point your agent to the `skill/` directory:

```bash
git clone https://github.com/RajatVaghani/apple-search-ads-skill.git
```

The skill entry point is `skill/SKILL.md`.

**Best experience:** This skill works best on [openclawhq.app](https://openclawhq.app) — the AI agent platform built by the same team. openclawhq.app handles workspace management, skill orchestration, and credential storage out of the box. [Get started at openclawhq.app](https://openclawhq.app)

## First-time setup

When the agent first uses the skill, it walks you through an onboarding flow:

1. **Create API credentials** in Apple Search Ads at [searchads.apple.com](https://searchads.apple.com) → Settings → API
2. **Choose "Read Only" role** when creating the API certificate (safest for monitoring)
3. **Download the private key** `.pem` file and note your Client ID, Team ID, Key ID, and Org ID
4. **Save credentials** to `/data/.openclaw/shared-files/apple-search-ads/credentials.md` in this format:

```markdown
# Apple Search Ads API Credentials

- Client ID: SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Team ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Key ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- PEM Path: /data/.openclaw/shared-files/apple-search-ads/private-key.pem
- Org ID: 1234567
```

5. **Copy the `.pem` file** to the path specified above
6. **Run setup check** — the agent verifies credentials, PEM file, token generation, and API access
7. **Run endpoint discovery** — probes which API endpoints are available for your account (this matters — not all endpoints work the same way for every account)

Custom credential paths are supported via `--config <path>` flag or `ASA_CONFIG_PATH` environment variable.

## How it works

### Authentication

Apple Search Ads uses OAuth 2 with JWT-based client authentication. The skill handles this automatically:

1. Builds a JWT signed with your private key (ES256 algorithm)
2. Exchanges the JWT for a short-lived access token at Apple's OAuth endpoint
3. Uses the access token as a Bearer token on all API calls

All the tricky details (ES256 not RS256, `client_secret` not `client_assertion`, `application/x-www-form-urlencoded` not JSON, timestamps in seconds not milliseconds) are handled by the bundled scripts.

### Endpoint fallback system

Apple Search Ads API v5 has an important quirk: not all report endpoints work at the account level for every account. The campaign report endpoint (`POST /reports/campaigns`) is reliable, but keyword, ad group, and search term report endpoints may return 404 at the account level.

The bundled scripts handle this automatically with a fallback chain:

1. Try campaign-scoped report endpoint (e.g., `/campaigns/{id}/keywords/reports`)
2. Fall back to global report endpoint with campaign filter (e.g., `/reports/keywords`)
3. Fall back to direct GET endpoints for structure data (e.g., `/campaigns/{id}/adgroups/{id}/targetingkeywords`)

Run `asa-discover-endpoints.js` during setup to see exactly which endpoints your account supports.

### Analysis methodology

The skill follows a top-down analysis approach:

1. **Campaign health review** — identify top spenders, performers, underperformers, and budget-constrained campaigns
2. **Ad group diagnosis** — drill into problem campaigns to find which segments are strong vs weak
3. **Keyword efficiency review** — find keywords worth scaling, keywords to pause, match type performance gaps
4. **Search term mining** — discover new keyword opportunities, negative keyword candidates, intent mismatches
5. **Geo analysis** — compare performance by country/region

## Bundled scripts

All scripts live in `scripts/` and output JSON to stdout. They read credentials from the default path or accept `--config <path>`.

| Script | What it does | Usage |
|--------|-------------|-------|
| `asa-get-token.js` | Get a fresh OAuth access token | `node scripts/asa-get-token.js` |
| `asa-setup-check.js` | Verify credentials and test API connection | `node scripts/asa-setup-check.js` |
| `asa-discover-endpoints.js` | Probe which API endpoints work for this account | `node scripts/asa-discover-endpoints.js` |
| `asa-list-campaigns.js` | List all campaigns with status and budgets | `node scripts/asa-list-campaigns.js` |
| `asa-campaign-report.js` | Campaign performance for last N days | `node scripts/asa-campaign-report.js [days]` |
| `asa-adgroup-report.js` | Ad group data for a campaign | `node scripts/asa-adgroup-report.js <campaignId> [days]` |
| `asa-keyword-report.js` | Keyword data for a campaign | `node scripts/asa-keyword-report.js <campaignId> [adGroupId] [days]` |
| `asa-searchterms-report.js` | Search term report for a campaign | `node scripts/asa-searchterms-report.js <campaignId> [days]` |

## Repository structure

```
apple-search-ads-skill/
├── README.md
└── skill/
    ├── SKILL.md                          # Main skill instructions (agent reads this)
    ├── scripts/
    │   ├── asa-common.js                 # Shared auth & API utilities (JWT, OAuth, requests)
    │   ├── asa-get-token.js              # Get OAuth access token
    │   ├── asa-setup-check.js            # Verify credentials & connection
    │   ├── asa-discover-endpoints.js     # Probe available API endpoints
    │   ├── asa-list-campaigns.js         # List all campaigns
    │   ├── asa-campaign-report.js        # Campaign performance reports
    │   ├── asa-adgroup-report.js         # Ad group data (with endpoint fallbacks)
    │   ├── asa-keyword-report.js         # Keyword data (with endpoint fallbacks)
    │   └── asa-searchterms-report.js     # Search term reports (with endpoint fallbacks)
    └── references/
        └── api-reference.md              # Detailed API v5 endpoint documentation
```

## Key metrics tracked

| Metric | Description | Healthy range |
|--------|-------------|---------------|
| `localSpend` | Amount spent in local currency | Depends on budget goals |
| `impressions` | Times the ad was shown | Higher is generally better |
| `taps` | Clicks on the ad | Quality over quantity |
| `ttr` | Tap-through rate | 5–15% is healthy |
| `totalInstalls` | App installs driven | Primary success metric |
| `totalAvgCPI` | Average cost per install | Below $1.00 is good for most apps |
| `avgCPT` | Average cost per tap | Below $0.50 is efficient |
| `totalInstallRate` | Installs per tap | Above 50% is strong |

## Security

- Private key PEM contents are never exposed in chat, logs, or generated files
- Client secrets and access tokens are never included in responses
- Credentials are never included in code snippets shown to the user
- Account changes are never made without explicit user approval
- Access tokens are short-lived and not persisted

Prefer environment variables or [openclawhq.app](https://openclawhq.app) config over storing credentials in plain text files. If you do use the credentials file, make sure it's not committed to version control.

## Usage

Once installed and configured, just ask your agent:

- "How did my Apple Search Ads campaigns perform this week?"
- "My spend went up 40% but installs are flat — what's going on?"
- "Which keywords are wasting the most budget?"
- "Give me a full weekly performance summary with recommendations"
- "Which search terms should I add as negative keywords?"
- "Compare my US vs international campaign performance"

The agent handles everything — pulling data, comparing time periods, drilling into problem areas, and delivering actionable recommendations.

## Why openclawhq.app?

This skill is a standalone skill that works with any compatible agent runtime, but it's built and optimized for [openclawhq.app](https://openclawhq.app). On the platform you get:

- **Zero-config setup** — credential management and workspace paths handled automatically
- **Managed agent runtime** — your agent runs 24/7 in the cloud, no local machine needed
- **Scheduled monitoring** — set up daily or weekly automated campaign health checks
- **Shared file access** — generated reports appear instantly in the dashboard
- **Skill marketplace** — install this and other skills with one click
- **Team collaboration** — share campaign insights across your team

If you're running this skill outside of openclawhq.app and want a smoother experience, [try the platform](https://openclawhq.app).

## License

MIT

## Credits

Made by [Claw HQ](https://openclawhq.app) — the team behind [openclawhq.app](https://openclawhq.app), the AI agent platform for autonomous workflows.
