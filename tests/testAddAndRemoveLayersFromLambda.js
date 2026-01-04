import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    createLayerProgrammatically,
    addLayerToLambdaProgrammatically,
    removeLayerFromLambdaProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testAddAndRemoveLayersFromLambda
 * Validates creating layers, adding them to a lambda, and removing one
 */
export async function testAddAndRemoveLayersFromLambda() {
    const testName = 'testAddAndRemoveLayersFromLambda';

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

        // Step 2: Create layer l1
        console.log(chalk.gray('  Creating layer l1...'));
        await createLayerProgrammatically(outputPath, 'l1');

        results.push({ step: 'layer l1 created', passed: true });

        // Step 3: Create layer l2
        console.log(chalk.gray('  Creating layer l2...'));
        await createLayerProgrammatically(outputPath, 'l2');

        results.push({ step: 'layer l2 created', passed: true });

        // Step 4: Add l1 to lambda
        console.log(chalk.gray('  Adding l1 to lambda...'));
        await addLayerToLambdaProgrammatically(outputPath, `${testName}Function`, 'l1');

        results.push({ step: 'layer l1 added to lambda', passed: true });

        // Step 5: Add l2 to lambda
        console.log(chalk.gray('  Adding l2 to lambda...'));
        await addLayerToLambdaProgrammatically(outputPath, `${testName}Function`, 'l2');

        results.push({ step: 'layer l2 added to lambda', passed: true });

        // Step 6: Remove l1 from lambda
        console.log(chalk.gray('  Removing l1 from lambda...'));
        await removeLayerFromLambdaProgrammatically(outputPath, `${testName}Function`, 'l1');

        results.push({ step: 'layer l1 removed from lambda', passed: true });

        // Step 7: Compare template.yaml
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

        // Step 8: Compare samconfig.toml
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

        // Step 9: Compare src/ directory
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
