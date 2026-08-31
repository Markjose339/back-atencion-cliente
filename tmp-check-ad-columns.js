const { Client } = require('pg');
(async () => {
  const client = new Client({
    host: process.argv[2],
    port: Number(process.argv[3]),
    database: process.argv[4],
    user: process.argv[5],
    password: process.argv[6],
  });
  await client.connect();
  const result = await client.query("select column_name from information_schema.columns where table_name = 'advertisements' order by ordinal_position");
  console.log(JSON.stringify(result.rows, null, 2));
  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
