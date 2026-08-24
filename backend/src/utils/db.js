const fs = require("fs");
const path = require("path");

const dbPath = path.join(__dirname, "../../data/db.json");

function readDB() {
  const data = fs.readFileSync(dbPath, "utf8");
  return JSON.parse(data);
}

function writeDB(data) {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
}

module.exports = {
  readDB,
  writeDB
};