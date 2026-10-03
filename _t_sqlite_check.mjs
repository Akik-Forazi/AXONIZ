import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE t (id TEXT PRIMARY KEY, v TEXT)");
db.prepare("INSERT INTO t (id, v) VALUES (?, ?)").run("a", "hello");
console.log("node:sqlite OK", JSON.stringify(db.prepare("SELECT * FROM t").all()));
db.exec("CREATE TABLE e (src TEXT, dst TEXT)");
db.prepare("INSERT INTO e VALUES (?,?)").run("a", "b");
db.prepare("INSERT INTO e VALUES (?,?)").run("b", "c");
const path = db
  .prepare(
    `WITH RECURSIVE r(n, depth) AS (
       SELECT ?, 0 UNION ALL SELECT e.dst, r.depth+1 FROM e JOIN r ON e.src = r.n WHERE r.depth < 5
     ) SELECT * FROM r`,
  )
  .all("a");
console.log("CTE OK", JSON.stringify(path));
console.log("sqlite version:", db.prepare("SELECT sqlite_version() AS v").get().v);
try {
  db.exec("CREATE VIRTUAL TABLE ft USING fts5(x)");
  console.log("fts5 OK");
} catch (e) {
  console.log("fts5 NOT available:", String(e));
}
