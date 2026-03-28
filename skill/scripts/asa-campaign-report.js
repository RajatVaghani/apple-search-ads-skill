#!/usr/bin/env node
/**
 * Get campaign performance report for the last N days.
 * Usage: node asa-campaign-report.js [days] [--config <path>]
 *   days: Number of days to look back (default: 7)
 */

const { loadCredentials, getAccessToken, apiRequest, getDateRange } = require('./asa-common');

async function main() {
  try {
    const days = parseInt(process.argv.find(a => /^\d+$/.test(a))) || 7;
    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    const { startTime, endTime } = getDateRange(days);

    const body = {
      startTime,
      endTime,
      granularity: 'DAILY',
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }]
      },
      timeZone: 'UTC',
      returnRecordsWithNoMetrics: true
    };

    const result = await apiRequest(token, creds.orgId, 'POST', '/reports/campaigns', body);
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
