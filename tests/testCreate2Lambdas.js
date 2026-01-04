import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    addLambdaProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testCreate2Lambdas
 * Validates creating a project with initial lambda and adding 2 more lambdas via update
 */
export async function testCreate2Lambdas() {
    const testName = 'testCreate2Lambdas';
    const envFilePath = path.join(__dirname, 'envs', '.env.testLambdaWithEnvs');

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Set up environment for generation
        const originalEnv = process.env.DOTENV_CONFIG_PATH;
        process.env.DOTENV_CONFIG_PATH = envFilePath;

        // Step 1: Generate initial project with testCreate2Lambdas lambda with A2
        console.log(chalk.blue(`  Generating initial project in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: 'testCreate2Lambdas',
            apiName: 'testCreate2Lambdas-api',
            timeout: 60,
            envVars: ['A2'],
            templateName: 'basic',
            architecture: 'arm64'
        });

        results.push({ step: 'Initial project generated', passed: true });

        // Step 2: Add lambda2 with A1 and A3
        console.log(chalk.gray('  Adding lambda2...'));
        await addLambdaProgrammatically(outputPath, {
            lambdaName: 'lambda2',
            timeout: 30,
            envVars: ['A1', 'A3']
        });

        results.push({ step: 'lambda2 created', passed: true });

        // Step 3: Add lambda3 without env vars
        console.log(chalk.gray('  Adding lambda3...'));
        await addLambdaProgrammatically(outputPath, {
            lambdaName: 'lambda3',
            timeout: 90,
            envVars: []
        });

        results.push({ step: 'lambda3 created', passed: true });

        // Step 4: Compare template.yaml
        console.log(chalk.gray('  Comparing template.yaml...'));
        const templateResult = await compareFiles(
            path.join(outputPath, 'template.yaml'),
            path.join(expectedPath, 'template.yaml'),
            {
                transform: (content, filePath) => {
                    return content;
                }
            }
        );

        if (templateResult.equal) {
            results.push({ step: 'template.yaml matches', passed: true });
        } else {
            results.push({ step: 'template.yaml matches', passed: false, diff: templateResult.diff });
            success = false;
        }

        // Step 5: Compare samconfig.toml
        console.log(chalk.gray('  Comparing samconfig.toml...'));
        const samconfigResult = await compareFiles(
            path.join(outputPath, 'samconfig.toml'),
            path.join(expectedPath, 'samconfig.toml')
        );

        if (samconfigResult.equal) {
            results.push({ step: 'samconfig.toml matches', passed: true });
        } else {
            results.push({ step: 'samconfig.toml matches', passed: false, diff: samconfigResult.diff });
            success = false;
        }

        // Step 6: Compare src/ directory
        console.log(chalk.gray('  Comparing src/ directory...'));
        const srcResult = await compareDirectories(
            path.join(outputPath, 'src'),
            path.join(expectedPath, 'src'),
            {
                ignore: ['node_modules', '.DS_Store']
            }
        );

        if (srcResult.equal) {
            results.push({ step: 'src/ directory matches', passed: true });
        } else {
            results.push({ step: 'src/ directory matches', passed: false, diff: srcResult.diff });
            success = false;
        }

        // Restore environment
        if (originalEnv !== undefined) {
            process.env.DOTENV_CONFIG_PATH = originalEnv;
        } else {
            delete process.env.DOTENV_CONFIG_PATH;
        }

    } catch (error) {
        results.push({ step: 'Test execution', passed: false, error: error.message });
        success = false;
    }

    return {
        testName,
        success,
        results
    };
}
