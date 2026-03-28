#!/usr/bin/env node
/**
 * Probe Apple Search Ads API to discover which endpoints are available for your account.
 *
 * Different accounts, API versions, and permission levels support different endpoint patterns.
 * This script tests each one and reports what works, so you know which scripts will function
 * and which endpoints the agent should use.
 *
 * Usage: node asa-discover-endpoints.js [--config <path>]
 */

const { loadCredentials, getAccessToken, apiRequest, getDateRange } = require('./asa-common');

async function probe(token, orgId, method, endpoint, body, label) {
  try {
    await apiRequest(token, orgId, method, endpoint, body);
    return { endpoint, method, label, status: 'OK' };
  } catch (err) {
    const statusMatch = err.message.match(/API error (\d+)/);
    const status = statusMatch ? parseInt(statusMatch[1]) : 'ERROR';
    return { endpoint, method, label, status, error: err.message.substring(0, 200) };
  }
}

async function main() {
  try {
    const creds = loadCredentials();
    console.log(`Org ID: ${creds.orgId}`);
    console.log(`Discovering available endpoints...\n`);

    const token = await getAccessToken(creds);
    console.log('Auth: OK\n');

    const { startTime, endTime } = getDateRange(7);
    const reportBody = {
      startTime,
      endTime,
      granularity: 'DAILY',
      selector: { orderBy: [{ field: 'localSpend', sortOrder: 'DESCENDING' }] },
      timeZone: 'UTC',
      returnRecordsWithNoMetrics: true
    };

    // 1. Get campaigns first (we need a campaignId for scoped tests)
    const campaignsResult = await probe(token, creds.orgId, 'GET', '/campaigns', null, 'List campaigns');
    const results = [campaignsResult];

    let campaignId = null;
    let adGroupId = null;

    if (campaignsResult.status === 'OK') {
      try {
        const campaigns = await apiRequest(token, creds.orgId, 'GET', '/campaigns');
        if (campaigns.data && campaigns.data.length > 0) {
          campaignId = campaigns.data[0].id;
          console.log(`Using campaign ${campaignId} for scoped endpoint tests\n`);

          // Try to get an ad group ID too
          try {
            const adGroups = await apiRequest(token, creds.orgId, 'GET', `/campaigns/${campaignId}/adgroups`);
            if (adGroups.data && adGroups.data.length > 0) {
              adGroupId = adGroups.data[0].id;
            }
          } catch (e) {}
        }
      } catch (e) {}
    }

    // 2. Test account-level report endpoints
    const accountTests = [
      ['POST', '/reports/campaigns', reportBody, 'Account-level campaign reports'],
      ['POST', '/reports/adgroups', { ...reportBody, selector: { ...reportBody.selector, conditions: campaignId ? [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }] : [] } }, 'Account-level ad group reports (filtered)'],
      ['POST', '/reports/keywords', { ...reportBody, selector: { ...reportBody.selector, conditions: campaignId ? [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }] : [] } }, 'Account-level keyword reports (filtered)'],
      ['POST', '/reports/searchterms', { ...reportBody, selector: { ...reportBody.selector, conditions: campaignId ? [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }] : [] } }, 'Account-level search term reports (filtered)'],
      ['POST', '/reports/ads', { ...reportBody, selector: { ...reportBody.selector, conditions: campaignId ? [{ field: 'campaignId', operator: 'EQUALS', values: [String(campaignId)] }] : [] } }, 'Account-level ad reports (filtered)'],
    ];

    for (const [method, endpoint, body, label] of accountTests) {
      results.push(await probe(token, creds.orgId, method, endpoint, body, label));
    }

    // 3. Test campaign-scoped endpoints (if we have a campaign)
    if (campaignId) {
      const campaignTests = [
        ['GET', `/campaigns/${campaignId}`, null, 'Get specific campaign'],
        ['GET', `/campaigns/${campaignId}/adgroups`, null, 'List ad groups (direct GET)'],
        ['POST', `/campaigns/${campaignId}/adgroups/reports`, reportBody, 'Campaign-scoped ad group reports'],
        ['GET', `/campaigns/${campaignId}/keywords`, null, 'List keywords (direct GET, campaign-level)'],
        ['POST', `/campaigns/${campaignId}/keywords/reports`, reportBody, 'Campaign-scoped keyword reports'],
        ['POST', `/campaigns/${campaignId}/searchterms/reports`, reportBody, 'Campaign-scoped search term reports'],
      ];

      for (const [method, endpoint, body, label] of campaignTests) {
        results.push(await probe(token, creds.orgId, method, endpoint, body, label));
      }
    }

    // 4. Test ad-group-scoped endpoints (if we have an ad group)
    if (adGroupId && campaignId) {
      const adGroupTests = [
        ['GET', `/campaigns/${campaignId}/adgroups/${adGroupId}`, null, 'Get specific ad group'],
        ['GET', `/campaigns/${campaignId}/adgroups/${adGroupId}/targetingkeywords`, null, 'List targeting keywords (ad-group-scoped)'],
        ['POST', `/campaigns/${campaignId}/adgroups/${adGroupId}/searchterms/reports`, reportBody, 'Ad-group-scoped search term reports'],
      ];

      for (const [method, endpoint, body, label] of adGroupTests) {
        results.push(await probe(token, creds.orgId, method, endpoint, body, label));
      }
    }

    // Print results
    console.log('=== Endpoint Discovery Results ===\n');

    const working = results.filter(r => r.status === 'OK');
    const broken = results.filter(r => r.status !== 'OK');

    console.log(`Working (${working.length}):`);
    for (const r of working) {
      console.log(`  ✅ ${r.method} ${r.endpoint} — ${r.label}`);
    }

    console.log(`\nNot available (${broken.length}):`);
    for (const r of broken) {
      console.log(`  ❌ ${r.method} ${r.endpoint} — ${r.label} (${r.status})`);
    }

    // Output full JSON for programmatic use
    console.log('\n=== Full Results (JSON) ===');
    console.log(JSON.stringify({
      orgId: creds.orgId,
      campaignIdTested: campaignId,
      adGroupIdTested: adGroupId,
      results
    }, null, 2));

  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
