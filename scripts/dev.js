const { spawn } = require('child_process');
const nodemon = require.resolve('nodemon/bin/nodemon.js');

function watch(args) {
  const proc = spawn(process.execPath, [nodemon, ...args], { stdio: 'inherit' });
  proc.on('error', err => console.error(err));
  return proc;
}

const iconWatcher = watch([
  '--watch', 'build/icon.svg',
  '--ext', 'svg',
  '--exec', 'node scripts/generate-icons.js',
]);

const appWatcher = watch([
  '--watch', 'main',
  '--watch', 'renderer',
  '--watch', 'preload',
  '--ext', 'js,html,css',
  '--ignore', 'node_modules',
  '--exec', 'electron .',
]);

function cleanup() {
  iconWatcher.kill();
  appWatcher.kill();
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
