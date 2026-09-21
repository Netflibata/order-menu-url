import { createClient } from "@libsql/client";

function plainRow(row) {
  return row ? Object.fromEntries(Object.entries(row)) : null;
}

class TursoStatement {
  constructor(client, sql, args = []) {
    this.client = client;
    this.sql = sql;
    this.args = args;
  }

  bind(...args) {
    return new TursoStatement(this.client, this.sql, args);
  }

  async first() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return plainRow(result.rows[0]);
  }

  async all() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { results: result.rows.map(plainRow) };
  }

  async run() {
    const result = await this.client.execute({ sql: this.sql, args: this.args });
    return { meta: { changes: result.rowsAffected } };
  }

  toStatement() {
    return { sql: this.sql, args: this.args };
  }
}

export function createTursoD1(options = {}) {
  const url = options.url || process.env.TURSO_DATABASE_URL;
  const authToken = options.authToken ?? process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("缺少 TURSO_DATABASE_URL 配置");
  const client = options.client || createClient({ url, authToken });

  return {
    prepare(sql) {
      return new TursoStatement(client, sql);
    },
    async batch(statements) {
      const result = await client.batch(statements.map((statement) => statement.toStatement()), "write");
      return result.map((item) => ({ results: item.rows.map(plainRow), meta: { changes: item.rowsAffected } }));
    },
    client,
  };
}
