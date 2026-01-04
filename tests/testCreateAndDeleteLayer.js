import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    createLayerProgrammatically,
    deleteLayerProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testCreateAndDeleteLayer
 * Validates creating a layer and then deleting it
 */
export async function testCreateAndDeleteLayer() {
    const testName = 'testCreateAndDeleteLayer';
    const envFilePath = path.join(__dirname, 'envs', '.env.testLambdaWithEnvs');

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Set up environment for generation
        const originalEnv = process.env.DOTENV_CONFIG_PATH;
        process.env.DOTENV_CONFIG_PATH = envFilePath;

        // Step 1: Generate initial project without env vars
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

        // Step 2: Create layer milayer1
        console.log(chalk.gray('  Creating milayer1...'));
        await createLayerProgrammatically(outputPath, 'milayer1');

        results.push({ step: 'milayer1 created', passed: true });

        // Step 3: Delete layer milayer1
        console.log(chalk.gray('  Deleting milayer1...'));
        await deleteLayerProgrammatically(outputPath, 'milayer1');

        results.push({ step: 'milayer1 deleted successfully', passed: true });

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
