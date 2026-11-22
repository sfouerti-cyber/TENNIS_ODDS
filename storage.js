'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function atomicWrite(file, contents, exclusive = false) {
  const temp = file + '.' + randomUUID() + '.tmp';
  try {
    const fd = fs.openSync(temp, 'wx', 0o600);
    try {
      fs.writeFileSync(fd, contents);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    if (exclusive) fs.linkSync(temp, file);
    else fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp,{force:true});
  }
}

function readStore(file, initialize, production) {
  let original;
  try {
    original = fs.readFileSync(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (production || fs.existsSync(file + '.pre-season.bak')) {
      throw Error('Existing BTA database required. Verify the mounted data file before starting.');
    }
    fs.mkdirSync(path.dirname(file), {recursive:true});
    return {db:initialize(), original:null};
  }
  const db = JSON.parse(original);
  if (![1,2].includes(db.schema) || !['weeks','users','sessions','tickets'].every(k => Array.isArray(db[k])) ||
      !db.weeks.some(w => w.week === db.currentWeek)) {
    throw Error('Unrecognized BTA database format. Existing file was left intact.');
  }
  return {db, original};
}

function backupMigration(file, original) {
  const backup = file + '.pre-season.bak';
  try {
    atomicWrite(backup, original, true);
  } catch (error) {
    if (error.code !== 'EEXIST' || fs.readFileSync(backup,'utf8') !== original) throw error;
  }
}

module.exports = {atomicWrite,readStore,backupMigration};
