const { Client } = require('pg');
const fs = require('fs');
(async () => {
  const client = new Client({
    host: process.argv[2],
    port: Number(process.argv[3]),
    database: process.argv[4],
    user: process.argv[5],
    password: process.argv[6],
  });
  await client.connect();
  const sql = fs.readFileSync('drizzle/0003_advertisement_playback_controls.sql', 'utf8');
  await client.query(sql);
  console.log('MIGRATION_OK');
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
