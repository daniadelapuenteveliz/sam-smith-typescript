import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    updateProjectProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testAddDeleteAndUpdateEnvs
 * Validates that environment variable add/delete/update operations work correctly
 */
export async function testAddDeleteAndUpdateEnvs() {
    const testName = 'testAddDeleteAndUpdateEnvs';
    const envFilePath = path.join(__dirname, 'envs', '.env.testLambdaWithEnvs');

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Step 1: Set up environment for initial generation
        const originalEnv = process.env.DOTENV_CONFIG_PATH;
        process.env.DOTENV_CONFIG_PATH = envFilePath;
        // Step 2: Generate initial project with A1, A2, A3
        console.log(chalk.blue(`  Generating initial project in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: 'testAddDeleteAndUpdateEnvs',
            apiName: 'testAddDeleteAndUpdateEnvs-api',
            timeout: 60,
            envVars: ['A1', 'A2', 'A3'], // Lambda uses all three vars
            templateName: 'basic',
            architecture: 'arm64'
        });

        results.push({ step: 'Initial project generated', passed: true });

        // Step 3: Update .env file with new values
        const env2FilePath = path.join(__dirname, 'envs', '.env.env2');
        console.log(chalk.gray('  Updating .env file...'));
        await fs.copyFile(env2FilePath, path.join(outputPath, '.env'));
        results.push({ step: '.env updated', passed: true });

        // Step 4: Run environment update programmatically
        console.log(chalk.gray('  Running environment variable update...'));
        await updateProjectProgrammatically(outputPath, {
            addNew: true,
            removeOld: true,
            updateChanged: true
        });
        results.push({ step: 'Environment variables updated', passed: true });

        // Step 5: Compare template.yaml after update
        console.log(chalk.gray('  Comparing updated template.yaml...'));
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
            results.push({ step: 'template.yaml matches after update', passed: true });
        } else {
            results.push({ step: 'template.yaml matches after update', passed: false, diff: templateResult.diff });
            success = false;
        }

        // Step 6: Compare samconfig.toml (should remain unchanged)
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

        // Step 7: Compare src/ directory (should remain unchanged)
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
