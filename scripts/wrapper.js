const { spawn } = require('child_process');

const serviceName = process.argv[2];
const command = process.argv[3];
const args = process.argv.slice(4);

function escapeShellArg(arg) {
  if (/^[a-zA-Z0-9_\-\.\/\:]+$/.test(arg)) {
    return arg;
  }
  return `"${arg.replace(/"/g, '""')}"`;
}

function formatTimestamp() {
  return new Date().toISOString();
}

function formatLine(line) {
  const timestamp = formatTimestamp();
  return `[${timestamp}] [${serviceName}] ${line}`;
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

let stdoutBuffer = '';
let stderrBuffer = '';

proc.stdout.on('data', (data) => {
  stdoutBuffer += data.toString();
  const lines = stdoutBuffer.split('\n');
  stdoutBuffer = lines.pop() || '';
  lines.forEach(line => {
    if (line.trim()) {
      process.stdout.write(formatLine(line) + '\n');
    }
  });
});

proc.stderr.on('data', (data) => {
  stderrBuffer += data.toString();
  const lines = stderrBuffer.split('\n');
  stderrBuffer = lines.pop() || '';
  lines.forEach(line => {
    if (line.trim()) {
      process.stderr.write(formatLine(line) + '\n');
    }
  });
});

proc.on('exit', (code) => {
  if (stdoutBuffer.trim()) {
    process.stdout.write(formatLine(stdoutBuffer) + '\n');
  }
  if (stderrBuffer.trim()) {
    process.stderr.write(formatLine(stderrBuffer) + '\n');
  }
  process.exit(code || 0);
});

proc.on('error', (err) => {
  process.stderr.write(formatLine(`Error: ${err.message}`) + '\n');
  process.exit(1);
});

let isExiting = false;

function gracefulShutdown() {
  if (isExiting) return;
  isExiting = true;
  
  if (process.platform === 'win32') {
    proc.kill('SIGTERM');
    setTimeout(() => {
      try {
        proc.kill('SIGKILL');
      } catch (e) {}
      process.exit(0);
    }, 3000);
  } else {
    proc.kill('SIGTERM');
  }
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGBREAK', gracefulShutdown);
