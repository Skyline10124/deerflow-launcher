const { spawn } = require('child_process');

const command = process.argv[2];
const args = process.argv.slice(3);

function escapeShellArg(arg) {
  if (/^[a-zA-Z0-9_\-\.\/\:]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '""')}"`;
}

const escapedArgs = args.map(escapeShellArg);
const fullCommand = escapedArgs.length > 0 
  ? `${command} ${escapedArgs.join(' ')}`
  : command;

const proc = spawn(fullCommand, [], {
  stdio: ['inherit', 'pipe', 'pipe'],
  shell: true,
  windowsHide: true,
  env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' }
});

proc.stdout.on('data', (data) => {
  process.stdout.write(data);
});

proc.stderr.on('data', (data) => {
  process.stderr.write(data);
});

proc.on('exit', (code) => {
  process.exit(code || 0);
});

proc.on('error', (err) => {
  console.error(err);
  process.exit(1);
});

process.on('SIGINT', () => {
  proc.kill('SIGINT');
});
process.on('SIGTERM', () => {
  proc.kill('SIGTERM');
});
