#!/usr/bin/env node

import inquirer from 'inquirer';
import chalk from 'chalk';
import { generateProject } from '../lib/generator.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables from .env file
dotenv.config();

// Check for commands
const args = process.argv.slice(2);
if (args[0] === 'doc') {
    generateSwagger();
    process.exit(0);
}

if (!process.env.ENVIRONMENT) {
    console.error(chalk.red('✗ Error: ENVIRONMENT environment variable is not set.'));
    console.error(chalk.yellow('Please create a .env file with ENVIRONMENT=<your-ENVIRONMENT-name>'));
    console.error(chalk.gray('Example: ENVIRONMENT=dev or ENVIRONMENT=prod\n'));
    process.exit(1);
}

// Validate environment variables
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const invalidVars = [];

    envContent.split('\n').forEach(line => {
        line = line.trim();
        // Ignore empty lines and comments
        if (line && !line.startsWith('#')) {
            const [key] = line.split('=');
            if (key) {
                const trimmedKey = key.trim();
                // Rules:
                // 1. Must not start with a number
                // 2. Must contain only letters, numbers, and underscores
                // 3. Must be longer than 1 character
                const isValidFormat = /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmedKey);
                const isValidLength = trimmedKey.length > 1;

                if (!isValidFormat || !isValidLength) {
                    invalidVars.push(trimmedKey);
                }
            }
        }
    });

    if (invalidVars.length > 0) {
        console.error(chalk.red('✗ Error: The following environment variables have invalid names:'));
        invalidVars.forEach(v => console.error(chalk.yellow(`  - ${v}`)));
        console.error(chalk.gray('\nInvalid Variable Naming Rules:'));
        console.error(chalk.gray('  1. Must not start with a number'));
        console.error(chalk.gray('  2. Must contain only letters, numbers, and underscores'));
        console.error(chalk.gray('  3. Must be length > 1\n'));
        process.exit(1);
    }
}


console.log(chalk.blue.bold('Welcome to sam-smith!'));
console.log(chalk.gray('Generate a new AWS SAM project'));
console.log(chalk.gray(`ENVIRONMENT: ${process.env.ENVIRONMENT}\n`));

// Define available templates
const templateChoices = ['basic', 'basic-auth', 'cognito-auth'];

const questions = [
    {
        type: 'rawlist',
        name: 'template',
        message: 'Which template do you want to use?',
        choices: templateChoices,
        default: 'basic',
    },
    {
        type: 'input',
        name: 'projectName',
        message: 'What is the name of your project?',
        validate: function (value) {
            if (!value.length) {
                return 'Please enter a valid project name.';
            }
            const projectPath = path.join(process.cwd(), value);
            if (fs.existsSync(projectPath)) {
                return `Directory '${value}' already exists. Please choose a different name.`;
            }
            return true;
        },
    },
    {
        type: 'list',
        name: 'architecture',
        message: 'Which architecture do you want to use?',
        choices: ['x86_64', 'arm64'],
        default: process.arch === 'arm64' ? 'arm64' : 'x86_64',
    },
    {
        type: 'input',
        name: 'apiName',
        message: 'What is the name of your API Gateway?',
        default: (answers) => answers.projectName + '-api',
    },
    {
        type: 'input',
        name: 'functionName',
        message: 'What is the name of your Lambda function?',
        default: (answers) => answers.projectName,
    },
    {
        type: 'input',
        name: 'timeout',
        message: 'What is the timeout in seconds?',
        default: '60',
        validate: function (value) {
            const valid = !isNaN(parseFloat(value)) && parseFloat(value) > 0;
            return valid || 'Please enter a valid number greater than 0';
        },
        filter: Number,
    },
];

// Read all environment variables from .env file (excluding ENVIRONMENT)
function getEnvVariables() {
    const envPath = path.join(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) {
        return [];
    }

    const envContent = fs.readFileSync(envPath, 'utf8');
    const envVars = [];

    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key] = line.split('=');
            if (key && key.trim() !== 'ENVIRONMENT') {
                envVars.push(key.trim());
            }
        }
    });

    return envVars;
}

inquirer.prompt(questions).then(async (answers) => {
    const envVars = getEnvVariables();
    let selectedEnvVars = [];

    if (envVars.length > 0) {
        // Ask if the Lambda needs environment variables
        const envQuestion = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'needsEnvVars',
                message: 'Does this Lambda need environment variables?',
                default: false,
            }
        ]);

        if (envQuestion.needsEnvVars) {
            // Show checkbox with available env vars
            const envSelection = await inquirer.prompt([
                {
                    type: 'checkbox',
                    name: 'selectedVars',
                    message: 'Select environment variables to include:',
                    choices: envVars,
                }
            ]);
            selectedEnvVars = envSelection.selectedVars;
        }
    }

    generateProject(answers.projectName, answers.functionName, answers.apiName, answers.timeout, selectedEnvVars, answers.template, answers.architecture);
}).catch((error) => {
    console.error(chalk.red('Error:', error.message));
    process.exit(1);
});
