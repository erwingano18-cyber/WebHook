const mysql = require("mysql2/promise");

const baseConfig = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
};

const databaseName = process.env.MYSQL_DATABASE || "webhook_leads";
let pool = null;

function createDatabasePool() {
  return mysql.createPool({
    ...baseConfig,
    database: databaseName,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  });
}

function getPool() {
  if (!pool) {
    throw new Error(
      "Database is not initialized. Call initializeDatabase first.",
    );
  }

  return pool;
}

async function ensureDatabaseExists() {
  const connection = await mysql.createConnection(baseConfig);
  try {
    await connection.query("CREATE DATABASE IF NOT EXISTS ??", [databaseName]);
  } finally {
    await connection.end();
  }
}

async function initializeDatabase() {
  await ensureDatabaseExists();
  pool = createDatabasePool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS leads (
      id VARCHAR(64) PRIMARY KEY,
      created_at DATETIME NOT NULL,
      updated_at DATETIME NULL,
      source VARCHAR(32) NOT NULL,
      name VARCHAR(255) NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(80) NULL,
      message TEXT NULL,
      fields_json LONGTEXT NULL,
      raw_payload_json LONGTEXT NULL,
      email_forwarded TINYINT(1) NOT NULL DEFAULT 0,
      email_forwarded_at DATETIME NULL,
      email_forward_error TEXT NULL,
      suitecrm_synced TINYINT(1) NOT NULL DEFAULT 0,
      suitecrm_synced_at DATETIME NULL,
      suitecrm_response_json LONGTEXT NULL,
      suitecrm_error TEXT NULL
    )
  `);
}

module.exports = {
  initializeDatabase,
  getPool,
};
