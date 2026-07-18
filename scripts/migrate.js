import fs from "node:fs";
import path from "node:path";
import { pool } from "../src/db/client.js";

const schemaPath = path.resolve("src/db/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

async function main() {
  await pool.query(sql);
  console.log("Schema applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
