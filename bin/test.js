#!/usr/bin/env node

import chalk from 'chalk';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs-extra';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import test cases
import { testBasicNoEnv } from '../tests/testBasicNoEnv.js';
import { testBasicWithEnvs } from '../tests/testBasicWithEnvs.js';
import { testLambdaWithEnvs } from '../tests/testLambdaWithEnvs.js';
import { testAddDeleteAndUpdateEnvs } from '../tests/testAddDeleteAndUpdateEnvs.js';
import { testCreate2Lambdas } from '../tests/testCreate2Lambdas.js';
import { createAndUpdateLambda } from '../tests/createAndUpdateLambda.js';
import { testCreateAndDeleteLambda } from '../tests/testCreateAndDeleteLambda.js';
import { testCreateTwoApigateways } from '../tests/testCreateTwoApigateways.js';
import { testCreateAndDeleteApigateway } from '../tests/testCreateAndDeleteApigateway.js';
import { testUpdateApigateway } from '../tests/testUpdateApigateway.js';
import { testCreateAndDeleteEndpoints } from '../tests/testCreateAndDeleteEndpoints.js';
import { testAddBasicAuth } from '../tests/testAddBasicAuth.js';
import { testAddAndRemoveAuth } from '../tests/testAddAndRemoveAuth.js';
import { testCreateAndDeleteLayer } from '../tests/testCreateAndDeleteLayer.js';
import { testAddAndRemoveLayersFromLambda } from '../tests/testAddAndRemoveLayersFromLambda.js';
import { testCreateAndDeleteTables } from '../tests/testCreateAndDeleteTables.js';
import { testAddAndRemoveTablesFromLambda } from '../tests/testAddAndRemoveTablesFromLambda.js';
import { testCognitoAuthWorkflow } from '../tests/testCognitoAuthWorkflow.js';

/**
 * Clean up testOutput directory before running tests
 */
async function cleanupOldTests() {
    const testOutputDir = path.join(__dirname, '..', 'tests', 'testOutput');

    if (await fs.pathExists(testOutputDir)) {
        console.log(chalk.gray(`Cleaning tests/testOutput directory...`));
        await fs.emptyDir(testOutputDir);
    } else {
        await fs.ensureDir(testOutputDir);
    }
}

async function runTests() {
    // Parse command line arguments
    const args = process.argv.slice(2);
    const keepOutput = args.includes('--keepOutput');
    const testNameArg = args.find(arg => !arg.startsWith('--'));

    console.log(chalk.blue.bold('\nRunning SAM Smith Tests...\n'));

    // Clean up old test projects first
    await cleanupOldTests();
    console.log('');

    const tests = [
        { name: 'testBasicNoEnv', fn: testBasicNoEnv },
        { name: 'testBasicWithEnvs', fn: testBasicWithEnvs },
        { name: 'testLambdaWithEnvs', fn: testLambdaWithEnvs },
        { name: 'testAddDeleteAndUpdateEnvs', fn: testAddDeleteAndUpdateEnvs },
        { name: 'testCreate2Lambdas', fn: testCreate2Lambdas },
        { name: 'createAndUpdateLambda', fn: createAndUpdateLambda },
        { name: 'testCreateAndDeleteLambda', fn: testCreateAndDeleteLambda },
        { name: 'testCreateTwoApigateways', fn: testCreateTwoApigateways },
        { name: 'testCreateAndDeleteApigateway', fn: testCreateAndDeleteApigateway },
        { name: 'testUpdateApigateway', fn: testUpdateApigateway },
        { name: 'testCreateAndDeleteEndpoints', fn: testCreateAndDeleteEndpoints },
        { name: 'testAddBasicAuth', fn: testAddBasicAuth },
        { name: 'testAddAndRemoveAuth', fn: testAddAndRemoveAuth },
        { name: 'testCreateAndDeleteLayer', fn: testCreateAndDeleteLayer },
        { name: 'testAddAndRemoveLayersFromLambda', fn: testAddAndRemoveLayersFromLambda },
        { name: 'testCreateAndDeleteTables', fn: testCreateAndDeleteTables },
        { name: 'testAddAndRemoveTablesFromLambda', fn: testAddAndRemoveTablesFromLambda },
        { name: 'testCognitoAuthWorkflow', fn: testCognitoAuthWorkflow }
    ];

    // Filter tests if a specific test name is provided
    const testsToRun = testNameArg
        ? tests.filter(t => t.name === testNameArg)
        : tests;

    if (testNameArg && testsToRun.length === 0) {
        console.log(chalk.red(`Test "${testNameArg}" not found.`));
        console.log(chalk.yellow(`Available tests: ${tests.map(t => t.name).join(', ')}`));
        process.exit(1);
    }

    if (testNameArg) {
        console.log(chalk.gray(`Running single test: ${testNameArg}\n`));
    }

    const results = [];

    for (const test of testsToRun) {
        console.log(chalk.cyan(`Running: ${test.name}`));
        try {
            const result = await test.fn();
            results.push(result);

            if (result.success) {
                console.log(chalk.green(`✓ ${test.name}`));
            } else {
                console.log(chalk.red(`✗ ${test.name}`));
            }

            // Print step results
            for (const step of result.results) {
                if (step.passed) {
                    console.log(chalk.gray(`  - ${step.step}`));
                } else {
                    console.log(chalk.red(`  ✗ ${step.step}`));
                    if (step.diff) {
                        console.log(chalk.yellow(`    ${step.diff.split('\n').join('\n    ')}`));
                    }
                    if (step.error) {
                        console.log(chalk.red(`    Error: ${step.error}`));
                    }
                }
            }
            console.log('');
        } catch (error) {
            console.log(chalk.red(`✗ ${test.name} - Error: ${error.message}`));
            console.log(chalk.gray(error.stack));
            results.push({
                testName: test.name,
                success: false,
                results: []
            });
        }
    }

    // Print summary
    const passed = results.filter(r => r.success).length;
    const failed = results.length - passed;

    console.log(chalk.bold('\nTest Summary:'));
    console.log(chalk.green(`  Passed: ${passed}`));
    if (failed > 0) {
        console.log(chalk.red(`  Failed: ${failed}`));
    }
    console.log('');

    // Clean up testOutput unless --keepOutput flag is set
    if (!keepOutput) {
        const testOutputDir = path.join(__dirname, '..', 'tests', 'testOutput');
        if (await fs.pathExists(testOutputDir)) {
            console.log(chalk.gray('Cleaning up testOutput directory...'));
            await fs.emptyDir(testOutputDir);
            console.log(chalk.green('✓ testOutput cleaned\n'));
        }
    } else {
        console.log(chalk.gray('Keeping testOutput directory (--keepOutput flag set)\n'));
    }

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(error => {
    console.error(chalk.red('Fatal error:'), error);
    process.exit(1);
});
