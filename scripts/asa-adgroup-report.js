#!/usr/bin/env node
/**
 * Get ad group data for a specific campaign.
 *
 * This script uses two approaches:
 * 1. First tries the reporting endpoint for performance metrics
 * 2. Falls back to the direct GET endpoint for structure/config data
 *
 * Usage: node asa-adgroup-report.js <campaignId> [days] [--config <path>]
 *   campaignId: Required campaign ID
 *   days: Number of days to look back for reports (default: 7)
 */

const { loadCredentials, getAccessToken, apiRequest, getDateRange } = require('./asa-common');

async function main() {
  try {
    const args = process.argv.slice(2).filter(a => a !== '--config' && !process.argv[process.argv.indexOf(a) - 1]?.includes('--config'));
    const numericArgs = args.filter(a => /^\d+$/.test(a));

    if (numericArgs.length === 0) {
      console.error(JSON.stringify({ error: 'Campaign ID is required. Usage: asa-adgroup-report.js <campaignId> [days]' }, null, 2));
      process.exit(1);
    }

    const campaignId = numericArgs[0];
    const days = parseInt(numericArgs[1]) || 7;

    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    const { startTime, endTime } = getDateRange(days);

    // Try the campaign-scoped report endpoint first (performance metrics)
    const reportBody = {
      startTime,
      endTime,
      granularity: 'DAILY',
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }]
      },
      timeZone: 'UTC',
      returnRecordsWithNoMetrics: true
    };

    let result;
    try {
      result = await apiRequest(token, creds.orgId, 'POST', `/campaigns/${campaignId}/adgroups/reports`, reportBody);
      console.log(JSON.stringify({ source: 'report', data: result }, null, 2));
    } catch (reportErr) {
      // Report endpoint failed — fall back to direct GET for structure data
      console.error(`Note: Report endpoint failed (${reportErr.message}), falling back to direct endpoint`);

      try {
        result = await apiRequest(token, creds.orgId, 'GET', `/campaigns/${campaignId}/adgroups`);
        console.log(JSON.stringify({ source: 'direct', data: result }, null, 2));
      } catch (directErr) {
        // Also try the top-level report endpoint with campaign filter as last resort
        try {
          reportBody.selector.conditions = [{ field: 'campaignId', operator: 'EQUALS', values: [campaignId] }];
          result = await apiRequest(token, creds.orgId, 'POST', '/reports/adgroups', reportBody);
          console.log(JSON.stringify({ source: 'global_report_filtered', data: result }, null, 2));
        } catch (globalErr) {
          throw new Error(
            `All ad group endpoints failed for campaign ${campaignId}:\n` +
            `  Campaign-scoped report: ${reportErr.message}\n` +
            `  Direct GET: ${directErr.message}\n` +
            `  Global report filtered: ${globalErr.message}\n` +
            `Try using asa-discover-endpoints.js to check which endpoints your account supports.`
          );
        }
      }
    }
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
