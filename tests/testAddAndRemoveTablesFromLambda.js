import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    createTableProgrammatically,
    attachTablesToLambdaProgrammatically,
    removeTablesFromLambdaProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testAddAndRemoveTablesFromLambda
 * Validates att

aching tables to a lambda and then removing them
 */
export async function testAddAndRemoveTablesFromLambda() {
    const testName = 'testAddAndRemoveTablesFromLambda';
    const envFilePath = path.join(__dirname, 'envs', '.env.testLambdaWithEnvs');

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Set up environment for generation
        const originalEnv = process.env.DOTENV_CONFIG_PATH;
        process.env.DOTENV_CONFIG_PATH = envFilePath;

        // Step 1: Generate initial project
        console.log(chalk.blue(`  Generating initial project in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: testName,
            apiName: `${testName}-api`,
            timeout: 60,
            envVars: [],
            templateName: 'basic',
            architecture: 'arm64'
        });

        results.push({ step: 'Initial project generated', passed: true });

        // Step 2: Create tabla1 with pk=a#b, sk=c#e#a
        console.log(chalk.gray('  Creating tabla1...'));
        await createTableProgrammatically(outputPath, 'tabla1', 'a#b', 'c#e#a');

        results.push({ step: 'tabla1 created', passed: true });

        // Step 3: Create tabla2 with pk=x, sk=y
        console.log(chalk.gray('  Creating tabla2...'));
        await createTableProgrammatically(outputPath, 'tabla2', 'x', 'y');

        results.push({ step: 'tabla2 created', passed: true });

        // Step 4: Attach both tables to the lambda
        console.log(chalk.gray('  Attaching tables to lambda...'));
        await attachTablesToLambdaProgrammatically(outputPath, `${testName}Function`, ['tabla1', 'tabla2']);

        results.push({ step: 'Tables attached to lambda', passed: true });

        // Step 5: Remove tabla1
        console.log(chalk.gray('  Removing tabla1 from lambda...'));
        await removeTablesFromLambdaProgrammatically(outputPath, `${testName}Function`, ['tabla1']);

        results.push({ step: 'tabla1 removed from lambda', passed: true });

        // Step 6: Compare template.yaml
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

        // Step 7: Compare samconfig.toml
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

        // Step 8: Compare src/ directory
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
