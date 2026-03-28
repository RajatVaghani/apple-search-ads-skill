#!/usr/bin/env node
/**
 * List all Apple Search Ads campaigns with status and budgets.
 * Usage: node asa-list-campaigns.js [--config <path>]
 */

const { loadCredentials, getAccessToken, apiRequest } = require('./asa-common');

async function main() {
  try {
    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    const result = await apiRequest(token, creds.orgId, 'GET', '/campaigns');
    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
