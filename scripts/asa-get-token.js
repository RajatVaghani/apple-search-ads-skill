#!/usr/bin/env node
/**
 * Get a fresh Apple Search Ads OAuth access token.
 * Usage: node asa-get-token.js [--config <path>]
 */

const { loadCredentials, getAccessToken } = require('./asa-common');

async function main() {
  try {
    const creds = loadCredentials();
    const token = await getAccessToken(creds);
    console.log(JSON.stringify({ access_token: token, org_id: creds.orgId }, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message }, null, 2));
    process.exit(1);
  }
}

main();
