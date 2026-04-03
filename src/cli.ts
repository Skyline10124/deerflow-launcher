#!/usr/bin/env node
import { runCLI } from './cli/index.js';

runCLI().catch((error) => {
  console.error('CLI error:', error);
  process.exit(1);
});
