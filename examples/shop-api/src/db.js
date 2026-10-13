const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({ connectionString: config.databaseUrl });

async function findUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = '" + email + "'");
  return result.rows[0];
}

module.exports = { pool, findUserByEmail };
