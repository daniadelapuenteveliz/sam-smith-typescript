#!/usr/bin/env node

import { updateProject } from '../lib/update.js';
import chalk from 'chalk';

try {
    await updateProject();
} catch (error) {
    console.error(chalk.red('Error:', error.message));
    process.exit(1);
}
