---
name: apple-search-ads
description: "Monitor and analyze Apple Search Ads campaigns via the Campaign Management API v5. Use this skill whenever the user mentions Apple Search Ads, ASA, app install campaigns, search ads performance, keyword bidding for apps, App Store advertising, campaign CPA/CPI analysis, or asks about their ad spend on the App Store. Also trigger when the user wants campaign health reports, keyword performance, search term mining, wasted spend analysis, or geo breakdowns for Apple Search Ads. This skill is read-only by default and focuses on analysis and recommendations."
---

# Apple Search Ads Monitor

This skill enables you to connect to the Apple Search Ads Campaign Management API v5, pull performance data, and provide analysis, reports, and recommendations. It operates in **read-only mode by default** — you analyze and recommend, and only make changes with explicit user approval.

---

## First-Time Setup

Before you can pull any data, the user needs to configure their Apple Search Ads API credentials. If this is the first time the skill is being used (or credentials aren't found), walk the user through setup.

### Step 1: Check for existing credentials

Look for a credentials file at the default location:

```
/data/.openclaw/shared-files/apple-search-ads/
```

Read any files in that directory. You're looking for a file that contains these four values:
- **Client ID** — from Apple's Search Ads UI
- **Team ID** — from Apple's Search Ads UI
- **Key ID** — from Apple's Search Ads UI
- **Private key PEM file path** — path to the `.pem` file Apple generated
- **Org ID** — the organization ID for the account (visible in the Search Ads UI URL or account settings)

If the user stores credentials somewhere else, they can tell you the path and you'll use that instead.

### Step 2: If no credentials exist, guide the user

Walk them through this process:

1. **Go to Apple Search Ads** at [searchads.apple.com](https://searchads.apple.com)
2. **Navigate to Settings > API** (or Account Settings > API)
3. **Create an API certificate** if they don't have one:
   - Click "Create API Certificate"
   - Choose "Read Only" role (this is important — read-only is safest)
   - Download the private key `.pem` file
   - Note the **Client ID**, **Team ID**, and **Key ID** displayed
4. **Find their Org ID**: It's visible in the URL when logged in (e.g., `orgId=1234567`) or in Account Settings
5. **Save the credentials** — create a file at `/data/.openclaw/shared-files/apple-search-ads/credentials.md` with this format:

```markdown
# Apple Search Ads API Credentials

- Client ID: SEARCHADS.xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Team ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- Key ID: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
- PEM Path: /data/.openclaw/shared-files/apple-search-ads/private-key.pem
- Org ID: 1234567
```

6. **Copy the `.pem` file** to the path specified above (or wherever they prefer)

### Step 3: Verify the connection

Once credentials are in place, run the setup check:

```bash
node <skill-path>/scripts/asa-setup-check.js --config <credentials-path>
```

This verifies credentials, PEM file, token generation, and API access in one go.

### Step 4: Discover available endpoints

Different Apple Search Ads accounts support different API endpoint patterns. Run the discovery script to find out what works for this account:

```bash
node <skill-path>/scripts/asa-discover-endpoints.js --config <credentials-path>
```

This probes every endpoint and reports which ones return data vs 404. The results tell you (and the agent) which scripts and API calls will work. This is important because account-level report endpoints for keywords, ad groups, and search terms may not be available — the scripts handle this automatically with fallbacks, but knowing upfront saves debugging time.

### Custom Credential Paths

If the user wants to store credentials somewhere other than the default, they just need to tell you the path. All the helper scripts accept a `--config` flag to point at a custom credentials file. You can also check if the user has set an environment variable `ASA_CONFIG_PATH`.

---

## How Authentication Works

Understanding this helps you debug issues. Apple's API uses OAuth 2 with a JWT client secret — here's the flow:

1. **Build a JWT** signed with the private key (ES256 algorithm — this is critical, RS256 won't work)
2. **Exchange the JWT** for an access token at Apple's OAuth endpoint
3. **Use the access token** as a Bearer token on all API calls

The JWT must include these exact fields:
- `iss`: Team ID
- `sub`: Client ID
- `iat`: Current unix timestamp in **seconds** (not milliseconds)
- `exp`: Expiry timestamp (use 30 minutes from now)
- `aud`: `https://appleid.apple.com` (must be exact)

The token request goes to `POST https://appleid.apple.com/auth/oauth2/token` with `Content-Type: application/x-www-form-urlencoded` (not JSON!) and uses the field name `client_secret` for the JWT (not `client_assertion`).

The bundled scripts handle all of this for you — you generally don't need to build JWTs manually.

---

## Bundled Helper Scripts

These scripts live in this skill's `scripts/` directory. They all read credentials from the default path or accept `--config <path>` to use a custom location.

| Script | What it does | Usage |
|--------|-------------|-------|
| `asa-get-token.js` | Gets a fresh OAuth access token | `node scripts/asa-get-token.js` |
| `asa-list-campaigns.js` | Lists all campaigns with status and budgets | `node scripts/asa-list-campaigns.js` |
| `asa-campaign-report.js` | Campaign performance for last N days | `node scripts/asa-campaign-report.js [days]` |
| `asa-adgroup-report.js` | Ad group data for a campaign | `node scripts/asa-adgroup-report.js <campaignId> [days]` |
| `asa-keyword-report.js` | Keyword data for a campaign | `node scripts/asa-keyword-report.js <campaignId> [adGroupId] [days]` |
| `asa-searchterms-report.js` | Search term report for a campaign | `node scripts/asa-searchterms-report.js <campaignId> [days]` |
| `asa-discover-endpoints.js` | Probe which API endpoints work for this account | `node scripts/asa-discover-endpoints.js` |
| `asa-setup-check.js` | Verify credentials and test API connection | `node scripts/asa-setup-check.js` |

All scripts output JSON to stdout. Default time window is 7 days. Run them with `node <skill-path>/scripts/<script-name>`.

If the scripts aren't available or can't run (wrong environment, missing Node, etc.), you can make the API calls directly using `curl` — the authentication and API reference sections explain exactly how.

### Important: Endpoint Availability Varies by Account

Not all Apple Search Ads API endpoints work the same way for every account. The campaign report endpoint (`/reports/campaigns`) is the most reliable and works at the account level. But keyword, ad group, and search term reports often require **campaign-scoped** or even **ad-group-scoped** URL paths rather than the top-level `/reports/...` endpoints.

The bundled scripts handle this automatically — they try multiple endpoint patterns and use whichever one works. But if you're making raw API calls, be aware of this hierarchy:

1. **Always works:** `GET /campaigns`, `POST /reports/campaigns`
2. **Usually works:** `GET /campaigns/{id}/adgroups`, `GET /campaigns/{id}/adgroups/{id}`
3. **Varies by account:** `/reports/keywords`, `/reports/searchterms`, `/reports/adgroups` — these may 404 at the account level
4. **Campaign-scoped alternatives:** Try `/campaigns/{id}/keywords/reports`, `/campaigns/{id}/searchterms/reports`, `/campaigns/{id}/adgroups/reports`
5. **Ad-group-scoped fallback:** For keywords, try `GET /campaigns/{id}/adgroups/{id}/targetingkeywords`

**When setting up a new account, run `asa-discover-endpoints.js` first.** It probes every endpoint pattern and reports which ones your account supports. This saves time debugging 404s later.

---

## Default Behavior

Your default operating mode is **read-only analysis**. This means:

- Pull data and surface insights proactively
- Explain findings in plain language
- Recommend changes with clear reasoning
- **Never** modify campaigns, bids, keywords, or budgets without the user explicitly asking you to

If the user asks you to make a change, confirm what you'll do before doing it. For batch changes (e.g., "pause all underperforming keywords"), list every specific change and get approval.

---

## What to Monitor

When the user asks about their Apple Search Ads performance, or you're doing a routine check, focus on these metrics:

| Metric | What it means | Healthy range |
|--------|--------------|---------------|
| `localSpend` | Amount spent | Depends on budget goals |
| `impressions` | Times the ad was shown | More is generally better |
| `taps` | Clicks on the ad | Quality matters more than quantity |
| `ttr` | Tap-through rate (taps/impressions) | 5-15% is healthy |
| `totalInstalls` | App installs driven | Primary success metric |
| `totalAvgCPI` | Average cost per install | Below $1.00 is good for most apps |
| `avgCPT` | Average cost per tap | Below $0.50 is efficient |
| `totalInstallRate` | Installs per tap | Above 50% is strong |

Always interpret metrics **in context**, not in isolation:
- High spend + low installs = likely wasted spend
- High taps + low conversion = poor keyword intent or weak product page
- Strong conversion + low volume = opportunity to scale bids or budget

### Time Windows

For routine analysis, compare:
- Yesterday vs the day before
- Last 7 days vs previous 7 days
- Month-to-date vs previous month-to-date

For investigating sudden changes, pull daily granularity to spot exactly when the shift happened.

---

## Analysis Workflows

### 1. Campaign Health Review (Start Here)

Always start at the campaign level before drilling down. Run the campaign report and identify:
- **Top spenders** — are they efficient?
- **Top performers** — could they scale with more budget?
- **Underperformers** — what's dragging them down?
- **Budget-constrained** — campaigns that could do more with more budget
- **Trending down** — campaigns losing efficiency over time

### 2. Ad Group Diagnosis

Once you've identified campaigns worth investigating, drill into ad groups to find:
- Which segments inside a campaign are strong vs weak
- Whether a bad ad group is pulling down an otherwise good campaign
- Where budget should be reallocated within a campaign

### 3. Keyword Efficiency Review

At the keyword level, look for:
- Keywords with strong CPA and room to scale (increase bid)
- Keywords burning money with poor conversion (decrease bid or pause)
- Differences between exact match and broad match performance
- Keywords that are barely serving (low impressions despite reasonable bids)

### 4. Search Term Mining

Search terms show what users actually typed. This is where you find:
- **New keyword opportunities** — search terms converting well that aren't managed keywords yet
- **Negative keyword candidates** — terms eating spend with no conversions
- **Branded vs generic** split — understanding intent mix
- **Intent mismatches** — terms that technically match but users want something different

### 5. Geo Performance

If campaigns target multiple countries or regions, compare performance by geography:
- Which markets are most efficient?
- Which markets have high spend but low return?
- Should any geo be split into its own campaign for better control?

---

## Recommendation Patterns

When you find issues, recommend specific actions:

**Increase bids** when: conversion rate is strong, CPA is acceptable, but impression volume is limited (the ad isn't showing enough).

**Decrease bids** when: CPA is too high, spend is high with weak conversion, taps aren't turning into installs.

**Reallocate budget** toward: campaigns with efficient CPA that are budget-constrained, geos with better downstream value.

**Add negative keywords** when: search terms consume spend with zero or near-zero conversion, or intent is clearly irrelevant.

**Promote search terms to keywords** when: a search term is converting well but isn't a managed keyword — making it one gives you direct bid control.

---

## API Reference

For detailed endpoint documentation, request/response schemas, and advanced query options, read `references/api-reference.md` in this skill's directory. That file covers:
- All endpoint URLs and methods
- Report request body format and fields
- Selector, pagination, and grouping options
- Example request payloads

---

## Security Rules

These are non-negotiable:
- **Never** expose the private key PEM contents in chat, logs, or generated files
- **Never** paste client secrets or access tokens into responses
- **Never** include credentials in code snippets shown to the user
- **Never** make account changes without explicit user approval
- Access tokens are short-lived — treat them as sensitive but don't store them

---

## Troubleshooting

If authentication or API calls fail, check these in order:

1. **Credentials file exists** at the expected path and contains all five values
2. **PEM file exists** at the path specified in the credentials file
3. **Algorithm is ES256** — Apple requires Elliptic Curve, not RSA
4. **Token request uses `client_secret`** field name — not `client_assertion`
5. **Token request Content-Type** is `application/x-www-form-urlencoded` — not JSON
6. **`iat` is in seconds** — JavaScript `Date.now()` returns milliseconds, divide by 1000
7. **Token hasn't expired** — if reusing a token, get a fresh one
8. **API version is v5** — base URL should be `https://api.searchads.apple.com/api/v5`
9. **Org ID is correct** — check `X-AP-Context: orgId=<correct-id>` header
10. **Report payload is valid** — `granularity` field is required for reports

When something fails, describe the error clearly to the user rather than guessing. Show the HTTP status code and error message if available.

---

## Deliverables This Skill Can Produce

With this skill active, you should be able to produce any of these on request:
- Daily or weekly campaign performance summary
- Wasted spend report (keywords/terms burning money)
- Keyword opportunity report (search terms worth promoting)
- Negative keyword recommendations
- Geo performance breakdown
- Week-over-week or month-over-month trend analysis
- Answers to ad-hoc questions about campaign performance
