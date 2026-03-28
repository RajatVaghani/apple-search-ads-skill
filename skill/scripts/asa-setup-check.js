#!/usr/bin/env node
/**
 * Verify Apple Search Ads setup by checking credentials and testing auth.
 * Usage: node asa-setup-check.js [--config <path>]
 */

const { loadCredentials, getAccessToken, apiRequest } = require('./asa-common');

async function main() {
  const results = { steps: [] };

  // Step 1: Check credentials file
  let creds;
  try {
    creds = loadCredentials();
    results.steps.push({ step: 'Load credentials', status: 'OK', details: `Found: clientId=${creds.clientId.substring(0, 20)}..., orgId=${creds.orgId}` });
  } catch (err) {
    results.steps.push({ step: 'Load credentials', status: 'FAIL', details: err.message });
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // Step 2: Check PEM file
  const fs = require('fs');
  try {
    const pem = fs.readFileSync(creds.pemPath, 'utf-8');
    if (pem.includes('BEGIN') && pem.includes('PRIVATE KEY')) {
      results.steps.push({ step: 'PEM file check', status: 'OK', details: `Found valid PEM at ${creds.pemPath}` });
    } else {
      results.steps.push({ step: 'PEM file check', status: 'WARN', details: 'File exists but may not be a valid PEM — missing BEGIN/END markers' });
    }
  } catch (err) {
    results.steps.push({ step: 'PEM file check', status: 'FAIL', details: `Cannot read PEM: ${err.message}` });
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // Step 3: Get access token
  let token;
  try {
    token = await getAccessToken(creds);
    results.steps.push({ step: 'OAuth token', status: 'OK', details: 'Successfully obtained access token' });
  } catch (err) {
    results.steps.push({ step: 'OAuth token', status: 'FAIL', details: err.message });
    console.log(JSON.stringify(results, null, 2));
    process.exit(1);
  }

  // Step 4: Test API access by listing campaigns
  try {
    const campaigns = await apiRequest(token, creds.orgId, 'GET', '/campaigns');
    const count = campaigns?.data?.length || 0;
    results.steps.push({ step: 'API access test', status: 'OK', details: `Successfully listed ${count} campaigns` });
  } catch (err) {
    results.steps.push({ step: 'API access test', status: 'FAIL', details: err.message });
  }

  // Summary
  const allOk = results.steps.every(s => s.status === 'OK');
  results.overall = allOk ? 'SETUP COMPLETE - All checks passed' : 'SETUP INCOMPLETE - See failed steps above';

  console.log(JSON.stringify(results, null, 2));
  process.exit(allOk ? 0 : 1);
}

main();
