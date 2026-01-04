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

console.log(chalk.blue.bold('Welcome to sam-smith!'));
console.log(chalk.gray('Generate a new AWS SAM project\n'));

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
        type: 'input',
        name: 'environment',
        message: 'What is your environment?',
        default: 'dev',
        validate: function (value) {
            if (!value.length) {
                return 'Please enter a valid environment name.';
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

inquirer.prompt(questions).then(async (answers) => {
    generateProject(answers.projectName, answers.functionName, answers.apiName, answers.timeout, [], answers.template, answers.architecture, answers.environment);
}).catch((error) => {
    console.error(chalk.red('Error:', error.message));
    process.exit(1);
});
