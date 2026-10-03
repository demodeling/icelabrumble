#!/usr/bin/env node
// Reads the agent-<n>.json files of a play-test run and prints what the ten agents found.
//   node tools/playtest/summarize.js [dir]        (exit code 1 if any agent saw an error or an anomaly, or is missing)
const fs = require('fs'), path = require('path');
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', '..', 'test-results', 'playtest'));
const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => /^agent-\d+\.json$/.test(f)).sort((a, b) => parseInt(a.slice(6), 10) - parseInt(b.slice(6), 10)) : [];
const reps = files.map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
const FIGHTERS = ['Anton', 'June', 'Sarah', 'Aswin', 'Åke', 'Abigail', 'Sasha', 'Suvam'];
const med = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
console.log('# Play-test: ' + reps.length + ' of 10 agents reported' + (reps[0] ? ' · ' + reps[0].game + ' · ' + reps[0].speed + '× game speed' : ''));
console.log('\n| agent | plays | fights | win | peace | loss | timeout | page errors | anomalies |\n|---|---|---|---|---|---|---|---|---|');
let problems = 10 - reps.length;
reps.forEach(r => {
  const c = o => r.rounds.filter(x => x.outcome === o).length;
  const who = r.policy === 'brawler' ? FIGHTERS[r.agent] + (r.agent % 2 ? ' (rushes round 13)' : ' (waits in round 13)') : r.policy === 'monkey' ? 'random keys and menus, ' + (r.monkey ? r.monkey.actions + ' actions' : '') : 'June, never hits';
  console.log('| ' + r.agent + ' · ' + r.policy + ' | ' + who + ' | ' + r.rounds.length + ' | ' + c('win') + ' | ' + c('peace') + ' | ' + c('loss') + ' | ' + c('timeout') + ' | ' + r.errors.length + ' | ' + (r.anomalies.length + r.consoleErrors.length) + ' |');
  problems += r.errors.length + r.anomalies.length + r.consoleErrors.length;
});
// per round, over the brawlers: how hard is it for a bot that walks up and swings?
console.log('\n| round | fights | won | lost | timed out | median win (game s) | median HP left on a win |\n|---|---|---|---|---|---|---|');
for (let rd = 1; rd <= 13; rd++) {
  const f = [].concat(...reps.filter(r => r.policy === 'brawler').map(r => r.rounds.filter(x => x.round === rd)));
  if (!f.length) continue;
  const w = f.filter(x => x.outcome === 'win' || x.outcome === 'peace');
  console.log('| ' + rd + ' | ' + f.length + ' | ' + w.length + ' | ' + f.filter(x => x.outcome === 'loss').length + ' | ' + f.filter(x => x.outcome === 'timeout').length + ' | ' + (med(w.map(x => x.elapsed)) || '—') + ' | ' + (w.length ? med(w.map(x => x.hp)) : '—') + ' |');
}
const pac = reps.find(r => r.policy === 'pacifist');
if (pac) console.log('\nPacifist endings reached: ' + (pac.rounds.filter(x => x.outcome === 'peace').map(x => 'round ' + x.round + ' (' + x.title + ')').join('; ') || 'none') + '.');
const mk = reps.find(r => r.policy === 'monkey');
if (mk && mk.monkey) console.log('Monkey: ' + mk.monkey.actions + ' actions; screens ' + Object.keys(mk.monkey.scenes).join(', ') + '; rounds it landed in: ' + (Object.keys(mk.monkey.roundsSeen).join(', ') || 'none') + '.');
const saved = reps.filter(r => r.savedScore);
if (saved.length) console.log('Scores saved (this browser only): ' + saved.length + ', every row dated ' + [...new Set(saved.map(r => r.savedScore.date))].join(' / ') + '.');
console.log('\n## Problems: ' + problems);
if (reps.length < 10) console.log('- ' + (10 - reps.length) + ' agent(s) wrote no report');
reps.forEach(r => {
  r.errors.forEach(e => console.log('- agent ' + r.agent + ' page error: ' + e.split('\n')[0]));
  r.consoleErrors.forEach(e => console.log('- agent ' + r.agent + ' console error: ' + e));
  r.anomalies.forEach(a => console.log('- agent ' + r.agent + ' anomaly: ' + a.what + (a.where ? ' (' + a.where + ')' : '')));
});
process.exit(problems ? 1 : 0);
