// apply-migration.js — Run migration 007 against the live Supabase DB
// Usage: node apply-migration.js
//
// IMPORTANT: This script uses the supabase-js service role client.
// It does NOT have raw SQL execution. Instead it calls
// the Supabase Management API /query endpoint.
//
// If you have the Supabase access token (from supabase.com dashboard > account)
// set SUPABASE_ACCESS_TOKEN=... in the environment and run this script.

const https = require('https');
const fs = require('fs');

const PROJECT_REF = 'bvfwhuiocyoqwokxkaad';
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const DB_PASSWORD = process.env.SUPABASE_DB_PASSWORD;

if (!ACCESS_TOKEN && !DB_PASSWORD) {
  console.error('Set SUPABASE_ACCESS_TOKEN or SUPABASE_DB_PASSWORD env var.');
  console.error('Get your access token from: https://supabase.com/dashboard/account/tokens');
  process.exit(1);
}

const sql = fs.readFileSync('../supabase/migrations/007_admin_provisioning.sql', 'utf8');
const body = JSON.stringify({ query: sql });

const options = {
  hostname: 'api.supabase.com',
  port: 443,
  path: `/v1/projects/${PROJECT_REF}/database/query`,
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'Authorization': `Bearer ${ACCESS_TOKEN}`,
  },
};

console.log('Applying migration 007...');
const req = https.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    console.log(`HTTP ${res.statusCode}:`, data);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      console.log('Migration applied successfully!');
    } else {
      console.error('Migration failed. Check the output above.');
      process.exit(1);
    }
  });
});
req.on('error', (e) => { console.error(e); process.exit(1); });
req.write(body);
req.end();