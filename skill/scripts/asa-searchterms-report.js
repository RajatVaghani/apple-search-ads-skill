#!/usr/bin/env node
/**
 * Get search terms report for a specific campaign.
 *
 * Important: Search term reports in Apple Search Ads API v5 require a campaign ID.
 * They are NOT available at the account level. The endpoint path is campaign-scoped.
 *
 * This script tries multiple endpoint patterns and uses whichever works.
 *
 * Usage: node asa-searchterms-report.js <campaignId> [days] [--config <path>]
 *   campaignId: Required campaign ID
 *   days: Number of days to look back (default: 7)
 */

const { loadCredentials, getAccessToken, apiRequest, getDateRange } = require('./asa-common');

async function main() {
  try {
    const args = process.argv.slice(2).filter(a => a !== '--config' && !process.argv[process.argv.indexOf(a) - 1]?.includes('--config'));
    const numericArgs = args.filter(a => /^\d+$/.test(a));

    if (numericArgs.length === 0) {
      console.error(JSON.stringify({
        error: 'Campaign ID is required.',
        usage: 'asa-searchterms-report.js <campaignId> [days]'
      }, null, 2));
      process.exit(1);
    }

    const campaignId = numericArgs[0];
    const days = parseInt(numericArgs[1]) || 7;

    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    const { startTime, endTime } = getDateRange(days);

    const reportBody = {
      startTime,
      endTime,
      granularity: 'DAILY',
      selector: {
        orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
        pagination: { offset: 0, limit: 1000 }
      },
      timeZone: 'UTC',
      returnRecordsWithNoMetrics: false  // Exclude zero-activity terms to keep results manageable
    };

    const errors = [];

    // Strategy 1: Campaign-scoped search terms report
    try {
      const result = await apiRequest(token, creds.orgId, 'POST', `/campaigns/${campaignId}/searchterms/reports`, reportBody);
      console.log(JSON.stringify({ source: 'campaign_scoped_report', data: result }, null, 2));
      return;
    } catch (e) {
      errors.push(`Campaign-scoped report (/campaigns/${campaignId}/searchterms/reports): ${e.message}`);
    }

    // Strategy 2: Global report endpoint with campaign filter in selector
    try {
      reportBody.selector.conditions = [{ field: 'campaignId', operator: 'EQUALS', values: [campaignId] }];
      const result = await apiRequest(token, creds.orgId, 'POST', '/reports/searchterms', reportBody);
      console.log(JSON.stringify({ source: 'global_report_filtered', data: result }, null, 2));
      return;
    } catch (e) {
      errors.push(`Global report filtered (/reports/searchterms): ${e.message}`);
    }

    // Strategy 3: Ad-group-scoped search terms (some API versions require this)
    try {
      // First get ad groups for this campaign
      const adGroups = await apiRequest(token, creds.orgId, 'GET', `/campaigns/${campaignId}/adgroups`);
      const adGroupIds = (adGroups.data || []).map(ag => ag.id);

      if (adGroupIds.length === 0) {
        throw new Error('No ad groups found in this campaign');
      }

      const allResults = [];
      for (const agId of adGroupIds) {
        try {
          const agReportBody = {
            startTime,
            endTime,
            granularity: 'DAILY',
            selector: {
              orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }],
              pagination: { offset: 0, limit: 500 }
            },
            timeZone: 'UTC',
            returnRecordsWithNoMetrics: false
          };
          const result = await apiRequest(token, creds.orgId, 'POST', `/campaigns/${campaignId}/adgroups/${agId}/searchterms/reports`, agReportBody);
          if (result?.data?.reportingDataResponse?.row) {
            allResults.push(...result.data.reportingDataResponse.row.map(r => ({ ...r, adGroupId: agId })));
          }
        } catch (agErr) {
          // Some ad groups may not have search term data
        }
      }

      if (allResults.length > 0) {
        console.log(JSON.stringify({
          source: 'adgroup_scoped_reports',
          note: `Aggregated from ${adGroupIds.length} ad groups`,
          data: { reportingDataResponse: { row: allResults } }
        }, null, 2));
        return;
      }
      errors.push(`Ad-group-scoped reports: No search term data found across ${adGroupIds.length} ad groups`);
    } catch (e) {
      errors.push(`Ad-group-scoped reports: ${e.message}`);
    }

    throw new Error(
      `All search term endpoints failed for campaign ${campaignId}:\n` +
      errors.map(e => `  ${e}`).join('\n') +
      `\nTry using asa-discover-endpoints.js to check which endpoints your account supports.`
    );
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
