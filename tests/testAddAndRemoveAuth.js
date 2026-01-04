import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    addBasicAuthProgrammatically,
    removeBasicAuthProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testAddAndRemoveAuth
 * Validates adding and then removing basic auth from an API Gateway
 */
export async function testAddAndRemoveAuth() {
    const testName = 'testAddAndRemoveAuth';

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Step 1: Generate initial project with env vars
        console.log(chalk.blue(`  Generating initial project in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: testName,
            apiName: `${testName}-api`,
            timeout: 60,
            envVars: [],
            templateName: 'basic',
            architecture: 'arm64',
            environment: 'dev',
            envVarsWithValues: { A1: 'a1', A2: 'a2', A3: 'a3' }
        });

        results.push({ step: 'Initial project generated', passed: true });

        // Step 2: Add basic auth to the API Gateway
        console.log(chalk.gray('  Adding basic auth...'));
        await addBasicAuthProgrammatically(outputPath, `${testName}-api`);

        results.push({ step: 'Basic auth added', passed: true });

        // Step 3: Remove basic auth from the API Gateway
        console.log(chalk.gray('  Removing basic auth...'));
        await removeBasicAuthProgrammatically(outputPath, `${testName}-api`);

        results.push({ step: 'Basic auth removed', passed: true });

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

        // Step 7: Verify that authorizer folder was removed
        console.log(chalk.gray('  Verifying authorizer folder was removed...'));
        const authorizerPath = path.join(outputPath, 'src', 'authorizer');
        const authorizerExists = await fs.pathExists(authorizerPath);

        if (!authorizerExists) {
            results.push({ step: 'authorizer folder removed', passed: true });
        } else {
            results.push({ step: 'authorizer folder removed', passed: false, error: 'authorizer folder still exists' });
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
