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

  await ensureColumnExists("spam_score", "spam_score INT NOT NULL DEFAULT 0");
  await ensureColumnExists(
    "spam_label",
    "spam_label VARCHAR(16) NOT NULL DEFAULT 'not_spam'",
  );
  await ensureColumnExists(
    "spam_reasons_json",
    "spam_reasons_json LONGTEXT NULL",
  );
}

async function ensureColumnExists(columnName, definitionSql) {
  const [rows] = await pool.query(
    `
      SELECT COUNT(*) AS count
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = 'leads'
        AND COLUMN_NAME = ?
    `,
    [databaseName, columnName],
  );

  const exists = Number(rows?.[0]?.count || 0) > 0;
  if (exists) {
    return;
  }

  await pool.query(`ALTER TABLE leads ADD COLUMN ${definitionSql}`);
}

module.exports = {
  initializeDatabase,
  getPool,
};
