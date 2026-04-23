require('dotenv').config();
const db = require('../src/db');
const { rescoreAll } = require('../src/engines/scorer');

rescoreAll(db)
  .then(() => {
    console.log(`[${new Date().toISOString()}] rescore_all: done`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`[${new Date().toISOString()}] rescore_all error:`, err.message);
    process.exit(1);
  });
