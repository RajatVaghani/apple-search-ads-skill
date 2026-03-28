/**
 * Shared utilities for Apple Search Ads helper scripts.
 * Handles credential loading, JWT signing, and token acquisition.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const https = require('https');
const querystring = require('querystring');

const DEFAULT_CONFIG_DIR = '/data/.openclaw/shared-files/apple-search-ads';

/**
 * Find and parse the credentials file.
 * Looks in the default directory or a custom path passed via --config flag or ASA_CONFIG_PATH env var.
 */
function loadCredentials(customPath) {
  const configPath = customPath
    || process.argv.find((a, i) => process.argv[i - 1] === '--config')
    || process.env.ASA_CONFIG_PATH
    || null;

  let dir = DEFAULT_CONFIG_DIR;
  let filePath = null;

  if (configPath) {
    const stat = fs.existsSync(configPath) ? fs.statSync(configPath) : null;
    if (stat && stat.isDirectory()) {
      dir = configPath;
    } else if (stat && stat.isFile()) {
      filePath = configPath;
    } else {
      throw new Error(`Config path not found: ${configPath}`);
    }
  }

  // If we have a directory, find the credentials file inside it
  if (!filePath) {
    if (!fs.existsSync(dir)) {
      throw new Error(
        `Credentials directory not found: ${dir}\n` +
        `Please run the setup process first. Create a credentials file at:\n` +
        `${dir}/credentials.md\n` +
        `See the skill SKILL.md for the required format.`
      );
    }
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') || f.endsWith('.txt') || f.endsWith('.json'));
    if (files.length === 0) {
      throw new Error(`No credential files found in ${dir}`);
    }
    // Prefer a file named "credentials" if it exists
    const preferred = files.find(f => f.toLowerCase().includes('credential')) || files[0];
    filePath = path.join(dir, preferred);
  }

  const content = fs.readFileSync(filePath, 'utf-8');

  // Parse key-value pairs from markdown or plain text
  const extract = (pattern) => {
    const match = content.match(pattern);
    return match ? match[1].trim() : null;
  };

  const clientId = extract(/client\s*id[:\s]+([^\n]+)/i);
  const teamId = extract(/team\s*id[:\s]+([^\n]+)/i);
  const keyId = extract(/key\s*id[:\s]+([^\n]+)/i);
  const pemPath = extract(/pem\s*(?:path|file)[:\s]+([^\n]+)/i);
  const orgId = extract(/org\s*id[:\s]+([^\n]+)/i);

  const missing = [];
  if (!clientId) missing.push('Client ID');
  if (!teamId) missing.push('Team ID');
  if (!keyId) missing.push('Key ID');
  if (!pemPath) missing.push('PEM Path');
  if (!orgId) missing.push('Org ID');

  if (missing.length > 0) {
    throw new Error(
      `Missing credentials: ${missing.join(', ')}\n` +
      `File checked: ${filePath}\n` +
      `Make sure each value is on its own line like: "Client ID: SEARCHADS.xxx"`
    );
  }

  // Resolve PEM path relative to the credentials file directory if not absolute
  const resolvedPemPath = path.isAbsolute(pemPath)
    ? pemPath
    : path.resolve(path.dirname(filePath), pemPath);

  if (!fs.existsSync(resolvedPemPath)) {
    throw new Error(`PEM file not found at: ${resolvedPemPath}`);
  }

  return { clientId, teamId, keyId, pemPath: resolvedPemPath, orgId };
}

/**
 * Build a signed JWT for Apple's OAuth endpoint.
 */
function buildJWT(credentials) {
  const { clientId, teamId, keyId, pemPath } = credentials;
  const privateKey = fs.readFileSync(pemPath, 'utf-8');

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: 'ES256',
    kid: keyId,
    typ: 'JWT'
  };
  const payload = {
    iss: teamId,
    sub: clientId,
    iat: now,
    exp: now + 1800, // 30 minutes
    aud: 'https://appleid.apple.com'
  };

  const encode = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const headerB64 = encode(header);
  const payloadB64 = encode(payload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('SHA256');
  sign.update(signingInput);
  sign.end();
  const signature = sign.sign(privateKey);

  // Convert DER signature to raw r||s format for ES256
  const derToRaw = (der) => {
    let offset = 2;
    const rLen = der[offset + 1];
    offset += 2;
    let r = der.slice(offset, offset + rLen);
    offset += rLen;
    const sLen = der[offset + 1];
    offset += 2;
    let s = der.slice(offset, offset + sLen);

    // Trim leading zeros and pad to 32 bytes
    if (r.length > 32) r = r.slice(r.length - 32);
    if (s.length > 32) s = s.slice(s.length - 32);
    if (r.length < 32) r = Buffer.concat([Buffer.alloc(32 - r.length), r]);
    if (s.length < 32) s = Buffer.concat([Buffer.alloc(32 - s.length), s]);

    return Buffer.concat([r, s]);
  };

  const rawSig = derToRaw(signature);
  const signatureB64 = rawSig.toString('base64url');

  return `${signingInput}.${signatureB64}`;
}

/**
 * Exchange the JWT for an OAuth access token.
 */
function getAccessToken(credentials) {
  return new Promise((resolve, reject) => {
    const jwt = buildJWT(credentials);
    const postData = querystring.stringify({
      grant_type: 'client_credentials',
      client_id: credentials.clientId,
      client_secret: jwt,
      scope: 'searchadsorg'
    });

    const options = {
      hostname: 'appleid.apple.com',
      path: '/auth/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`Token request failed: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Failed to parse token response: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Make an authenticated request to the Apple Ads API v5.
 */
function apiRequest(token, orgId, method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const postData = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.searchads.apple.com',
      path: `/api/v5${endpoint}`,
      method: method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-AP-Context': `orgId=${orgId}`,
        'Content-Type': 'application/json'
      }
    };
    if (postData) {
      options.headers['Content-Length'] = Buffer.byteLength(postData);
    }

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 400) {
            reject(new Error(`API error ${res.statusCode}: ${JSON.stringify(parsed, null, 2)}`));
          } else {
            resolve(parsed);
          }
        } catch (e) {
          reject(new Error(`Failed to parse API response (status ${res.statusCode}): ${data.substring(0, 500)}`));
        }
      });
    });

    req.on('error', reject);
    if (postData) req.write(postData);
    req.end();
  });
}

/**
 * Format a date as YYYY-MM-DD.
 */
function formatDate(date) {
  return date.toISOString().split('T')[0];
}

/**
 * Get date range for "last N days".
 */
function getDateRange(days) {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - days);
  return { startTime: formatDate(start), endTime: formatDate(end) };
}

module.exports = {
  loadCredentials,
  buildJWT,
  getAccessToken,
  apiRequest,
  formatDate,
  getDateRange
};
