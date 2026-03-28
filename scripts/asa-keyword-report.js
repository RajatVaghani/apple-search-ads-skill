#!/usr/bin/env node
/**
 * Get keyword data for a specific campaign.
 *
 * Important: In Apple Search Ads API v5, keyword reports are scoped to campaigns
 * (not available at the account level). Some accounts may only support the direct
 * GET endpoint rather than the reporting endpoint.
 *
 * This script tries multiple endpoint patterns and uses whichever works.
 *
 * Usage: node asa-keyword-report.js <campaignId> [adGroupId] [days] [--config <path>]
 *   campaignId: Required campaign ID
 *   adGroupId: Optional ad group ID to narrow results
 *   days: Number of days to look back for reports (default: 7)
 */

const { loadCredentials, getAccessToken, apiRequest, getDateRange } = require('./asa-common');

async function main() {
  try {
    const args = process.argv.slice(2).filter(a => a !== '--config' && !process.argv[process.argv.indexOf(a) - 1]?.includes('--config'));
    const numericArgs = args.filter(a => /^\d+$/.test(a));

    if (numericArgs.length === 0) {
      console.error(JSON.stringify({
        error: 'Campaign ID is required.',
        usage: 'asa-keyword-report.js <campaignId> [adGroupId] [days]'
      }, null, 2));
      process.exit(1);
    }

    const campaignId = numericArgs[0];
    // If 3 numeric args: campaignId, adGroupId, days
    // If 2 numeric args: could be campaignId+days or campaignId+adGroupId
    // Heuristic: if second arg > 365, it's probably an adGroupId
    let adGroupId = null;
    let days = 7;

    if (numericArgs.length >= 3) {
      adGroupId = numericArgs[1];
      days = parseInt(numericArgs[2]) || 7;
    } else if (numericArgs.length === 2) {
      if (parseInt(numericArgs[1]) > 365) {
        adGroupId = numericArgs[1];
      } else {
        days = parseInt(numericArgs[1]) || 7;
      }
    }

    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    const { startTime, endTime } = getDateRange(days);

    const errors = [];

    // Strategy 1: Campaign-scoped keyword report endpoint
    try {
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
      if (adGroupId) {
        reportBody.selector.conditions = [{ field: 'adGroupId', operator: 'EQUALS', values: [adGroupId] }];
      }
      const result = await apiRequest(token, creds.orgId, 'POST', `/campaigns/${campaignId}/keywords/reports`, reportBody);
      console.log(JSON.stringify({ source: 'campaign_scoped_report', data: result }, null, 2));
      return;
    } catch (e) {
      errors.push(`Campaign-scoped report: ${e.message}`);
    }

    // Strategy 2: Global report endpoint with campaign filter
    try {
      const reportBody = {
        startTime,
        endTime,
        granularity: 'DAILY',
        selector: {
          conditions: [{ field: 'campaignId', operator: 'EQUALS', values: [campaignId] }],
          orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }]
        },
        timeZone: 'UTC',
        returnRecordsWithNoMetrics: true
      };
      if (adGroupId) {
        reportBody.selector.conditions.push({ field: 'adGroupId', operator: 'EQUALS', values: [adGroupId] });
      }
      const result = await apiRequest(token, creds.orgId, 'POST', '/reports/keywords', reportBody);
      console.log(JSON.stringify({ source: 'global_report_filtered', data: result }, null, 2));
      return;
    } catch (e) {
      errors.push(`Global report filtered: ${e.message}`);
    }

    // Strategy 3: Direct GET for keyword listing (no performance metrics, but gives structure)
    try {
      let endpoint = `/campaigns/${campaignId}/adgroups`;
      // If we have an ad group ID, get keywords directly
      if (adGroupId) {
        endpoint = `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords`;
      }

      // Without a specific ad group, we need to list ad groups first, then get keywords for each
      if (!adGroupId) {
        const adGroups = await apiRequest(token, creds.orgId, 'GET', endpoint);
        const adGroupIds = (adGroups.data || []).map(ag => ag.id);

        const allKeywords = [];
        for (const agId of adGroupIds) {
          try {
            const kws = await apiRequest(token, creds.orgId, 'GET', `/campaigns/${campaignId}/adgroups/${agId}/targetingkeywords`);
            if (kws.data) {
              allKeywords.push(...kws.data.map(kw => ({ ...kw, adGroupId: agId })));
            }
          } catch (kwErr) {
            // Some ad groups may not have keywords — that's fine
          }
        }
        console.log(JSON.stringify({
          source: 'direct_get',
          note: 'Structure data only — no performance metrics. Use campaign reports for metrics.',
          adGroupCount: adGroupIds.length,
          data: allKeywords
        }, null, 2));
        return;
      }

      const result = await apiRequest(token, creds.orgId, 'GET', endpoint);
      console.log(JSON.stringify({ source: 'direct_get', data: result }, null, 2));
      return;
    } catch (e) {
      errors.push(`Direct GET: ${e.message}`);
    }

    throw new Error(
      `All keyword endpoints failed for campaign ${campaignId}:\n` +
      errors.map(e => `  ${e}`).join('\n') +
      `\nTry using asa-discover-endpoints.js to check which endpoints your account supports.`
    );
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
