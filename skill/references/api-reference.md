# Apple Search Ads API v5 — Reference

Read this file when you need detailed endpoint information, request schemas, or advanced query patterns beyond what the main SKILL.md covers.

## Base URL

```
https://api.searchads.apple.com/api/v5
```

All endpoints below are relative to this base.

## Required Headers (Every Request)

```http
Authorization: Bearer <ACCESS_TOKEN>
X-AP-Context: orgId=<ORG_ID>
Content-Type: application/json
```

---

## Campaigns

### List All Campaigns
```
GET /campaigns
```
Returns all campaigns for the org. Response includes campaign metadata, status, budgets, and targeting.

### Get Specific Campaign
```
GET /campaigns/{campaignId}
```

### Key Campaign Fields
- `id` — Campaign ID
- `name` — Campaign name
- `status` — ENABLED, PAUSED
- `servingStatus` — RUNNING, NOT_RUNNING, etc.
- `dailyBudgetAmount` — Daily budget with `amount` and `currency`
- `countriesOrRegions` — Array of country codes
- `supplySources` — APPSTORE_SEARCH_RESULTS, APPSTORE_SEARCH_TAB

---

## Ad Groups

### List Ad Groups for a Campaign
```
GET /campaigns/{campaignId}/adgroups
```
This is the most reliable way to get ad group data. Always works.

### Get Specific Ad Group
```
GET /campaigns/{campaignId}/adgroups/{adGroupId}
```
Returns full details including `automatedKeywordsOptIn` flag (Search Match), targeting settings, etc.

### Key Ad Group Fields
- `id` — Ad group ID
- `campaignId` — Parent campaign
- `name` — Ad group name
- `status` — ENABLED, PAUSED
- `defaultBidAmount` — Default CPC bid
- `cpaGoal` — Target CPA (optional)
- `automatedKeywordsOptIn` — Whether Search Match is enabled

---

## Keywords

Keywords can be accessed through multiple endpoints. The availability varies by account — run `asa-discover-endpoints.js` to check which work for yours.

### Direct GET Endpoints (Structure Only, No Performance Metrics)
```
GET /campaigns/{campaignId}/adgroups/{adGroupId}/targetingkeywords
```
Returns keyword text, match type, bid amount, and status. This is the most reliable keyword endpoint but does **not** include performance metrics like spend, installs, or CPI.

### Key Keyword Fields
- `id` — Keyword ID
- `text` — The keyword text
- `matchType` — EXACT, BROAD
- `bidAmount` — Current bid
- `status` — ACTIVE, PAUSED
- `adGroupId` — Parent ad group

---

## Reports

Reports are the primary tool for performance analysis. All report endpoints use POST with a structured request body.

### Endpoint Availability Warning

**Not all report endpoints work at the account level for every account.** The account-level `/reports/campaigns` endpoint is reliable. But `/reports/keywords`, `/reports/adgroups`, and `/reports/searchterms` may return 404 errors.

When account-level reports fail, use **campaign-scoped** or **ad-group-scoped** report endpoints instead.

### Report Endpoint Hierarchy (Try in Order)

**Campaign reports** (account-level — reliable):

| Endpoint | Level |
|----------|-------|
| `POST /reports/campaigns` | Account-wide campaign metrics |

**Ad group reports** (try in this order):

| Endpoint | Notes |
|----------|-------|
| `POST /campaigns/{id}/adgroups/reports` | Campaign-scoped, try first |
| `POST /reports/adgroups` with campaignId filter | Account-level filtered, may 404 |
| `GET /campaigns/{id}/adgroups` | Direct GET, structure only (no metrics) |

**Keyword reports** (try in this order):

| Endpoint | Notes |
|----------|-------|
| `POST /campaigns/{id}/keywords/reports` | Campaign-scoped, try first |
| `POST /reports/keywords` with campaignId filter | Account-level filtered, may 404 |
| `GET /campaigns/{id}/adgroups/{id}/targetingkeywords` | Direct GET, structure only (no metrics) |

**Search term reports** (try in this order):

| Endpoint | Notes |
|----------|-------|
| `POST /campaigns/{id}/searchterms/reports` | Campaign-scoped, try first |
| `POST /reports/searchterms` with campaignId filter | Account-level filtered, may 404 |
| `POST /campaigns/{id}/adgroups/{id}/searchterms/reports` | Ad-group-scoped, most granular |

**Ad reports:**

| Endpoint | Notes |
|----------|-------|
| `POST /reports/ads` with campaignId filter | Account-level filtered |

### Standard Report Request Body

```json
{
  "startTime": "2026-03-01",
  "endTime": "2026-03-28",
  "granularity": "DAILY",
  "selector": {
    "conditions": [],
    "orderBy": [
      {
        "field": "localSpend",
        "sortOrder": "DESCENDING"
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 1000
    }
  },
  "groupBy": [],
  "timeZone": "UTC",
  "returnRecordsWithNoMetrics": true
}
```

### Request Body Fields

**startTime** (required): Start date in YYYY-MM-DD format.

**endTime** (required): End date in YYYY-MM-DD format.

**granularity** (required): How to break down results over time. Values: `DAILY`, `WEEKLY`, `MONTHLY`, `HOURLY`.

**timeZone**: Timezone for date interpretation. Default: `UTC`. Use `UTC` unless the user specifically needs local time.

**returnRecordsWithNoMetrics**: When `true`, includes entities that had no activity in the period. Useful for spotting paused or inactive items.

**selector**: Controls filtering, sorting, and pagination.

**selector.conditions**: Array of filter conditions:
```json
{
  "field": "campaignId",
  "operator": "EQUALS",
  "values": ["12345678"]
}
```
Operators: `EQUALS`, `NOT_EQUALS`, `GREATER_THAN`, `LESS_THAN`, `IN`, `CONTAINS`, `STARTSWITH`, `ENDSWITH`.

**selector.orderBy**: Array of sort instructions:
```json
{
  "field": "localSpend",
  "sortOrder": "DESCENDING"
}
```
Sort orders: `ASCENDING`, `DESCENDING`.

**selector.pagination**: For large result sets:
```json
{
  "offset": 0,
  "limit": 1000
}
```
Maximum limit per request is 1000. Use offset to page through larger result sets.

**groupBy**: Dimensions to group results by. Commonly used values: `countryOrRegion`, `deviceClass`, `ageRange`, `gender`.

### Available Metrics in Report Responses

| Metric | Type | Description |
|--------|------|-------------|
| `localSpend` | object | `{ amount, currency }` — Total spend |
| `impressions` | number | Total impressions |
| `taps` | number | Total taps (clicks) |
| `ttr` | number | Tap-through rate (taps / impressions) |
| `totalInstalls` | number | Total installs |
| `totalNewDownloads` | number | First-time downloads |
| `totalRedownloads` | number | Re-downloads |
| `totalAvgCPI` | object | `{ amount, currency }` — Avg cost per install |
| `tapInstallCPI` | object | Avg CPI from taps only |
| `avgCPT` | object | `{ amount, currency }` — Avg cost per tap |
| `avgCPM` | object | `{ amount, currency }` — Cost per 1000 impressions |
| `totalInstallRate` | number | Install rate (installs / taps) |
| `tapInstallRate` | number | Install rate from taps only |

### Report Response Structure

```json
{
  "data": {
    "reportingDataResponse": {
      "row": [
        {
          "metadata": {
            "campaignId": 12345678,
            "campaignName": "US - Generic",
            ...
          },
          "total": {
            "localSpend": { "amount": "150.25", "currency": "USD" },
            "impressions": 25000,
            "taps": 3200,
            ...
          },
          "granularity": [
            {
              "date": "2026-03-01",
              "localSpend": { "amount": "21.50", "currency": "USD" },
              ...
            }
          ]
        }
      ]
    }
  },
  "pagination": {
    "totalResults": 5,
    "startIndex": 0,
    "itemsPerPage": 1000
  }
}
```

The `total` object has the rolled-up metrics for the full date range. The `granularity` array breaks those down by the requested granularity period.

---

## Search Term Reports — Special Notes

Search term reports have stricter requirements than other reports:

1. **Campaign scope is required** — you cannot pull search terms across all campaigns in one request
2. **The account-level endpoint may not work** — use campaign-scoped (`/campaigns/{id}/searchterms/reports`) or ad-group-scoped (`/campaigns/{id}/adgroups/{id}/searchterms/reports`) endpoints
3. Response includes `searchTermText` in metadata — this is the actual user query
4. Also includes `keyword` field showing which keyword triggered the match
5. `matchType` shows EXACT, BROAD, or SEARCH_MATCH

Example search term report request (campaign-scoped):
```
POST /campaigns/12345678/searchterms/reports
```
```json
{
  "startTime": "2026-03-01",
  "endTime": "2026-03-28",
  "granularity": "DAILY",
  "selector": {
    "orderBy": [
      {
        "field": "localSpend",
        "sortOrder": "DESCENDING"
      }
    ],
    "pagination": {
      "offset": 0,
      "limit": 1000
    }
  },
  "timeZone": "UTC",
  "returnRecordsWithNoMetrics": false
}
```

Setting `returnRecordsWithNoMetrics` to `false` for search terms is recommended — there can be a very large number of zero-activity terms.

---

## OAuth Token Endpoint

This is for reference — the helper scripts handle this automatically.

```
POST https://appleid.apple.com/auth/oauth2/token
Content-Type: application/x-www-form-urlencoded

grant_type=client_credentials&client_id=<CLIENT_ID>&client_secret=<SIGNED_JWT>&scope=searchadsorg
```

Key points:
- Content-Type must be `application/x-www-form-urlencoded`, not JSON
- The field is `client_secret`, not `client_assertion`
- JWT must use ES256 algorithm
- JWT audience must be exactly `https://appleid.apple.com`
- `iat` must be in seconds, not milliseconds

---

## Rate Limits

Apple Search Ads API has rate limits. If you receive a 429 status code, wait and retry. The API doesn't publish exact limits, but in practice:
- Spread report requests across a few seconds rather than firing them all simultaneously
- Paginate large result sets rather than requesting everything at once
- Cache results when doing multiple analyses on the same data within a session

---

## Error Handling

Common error patterns:

| Status | Meaning | What to check |
|--------|---------|---------------|
| 401 | Unauthorized | Token expired or invalid — get a fresh one |
| 403 | Forbidden | Org ID wrong, or API user lacks permission |
| 404 | Not found | Campaign/ad group ID doesn't exist |
| 429 | Rate limited | Wait and retry |
| 400 | Bad request | Check request body format, required fields, date formats |

Always surface the full error message to help diagnose issues — don't swallow errors silently.
