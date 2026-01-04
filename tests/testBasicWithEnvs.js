
import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    cleanup
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testBasicWithEnvs
 * Validates that a basic project with environment variables generates correctly
 */
export async function testBasicWithEnvs() {
    const testName = 'testBasicWithEnvs';
    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Step 1: Generate project with environment variables
        console.log(chalk.blue(`  Generating project in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: 'testBasicWithEnvs',
            apiName: 'testBasicWithEnvs-api',
            timeout: 60,
            envVars: [], // Don't assign env vars to Lambda, just create SSM parameters
            templateName: 'basic',
            architecture: 'arm64',
            environment: 'dev',
            envVarsWithValues: { A1: 'a1', A2: 'a2', A3: 'a3' }
        });

        results.push({ step: 'Project generated', passed: true });

        // Step 3: Compare template.yaml
        console.log(chalk.gray('  Comparing template.yaml...'));
        const templateResult = await compareFiles(
            path.join(outputPath, 'template.yaml'),
            path.join(expectedPath, 'template.yaml'),
            {
                // Transform to normalize project name differences (if any)
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

        // Step 4: Compare samconfig.toml
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

        // Step 5: Compare src/ directory
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
    } finally {
        // Cleanup disabled for now - keeping generated projects for inspection
        // Step 6: Cleanup
        // console.log(chalk.gray('  Cleaning up...'));
        // try {
        //     await cleanup(outputPath);
        //     results.push({ step: 'Cleanup completed', passed: true });
        // } catch (error) {
        //     results.push({ step: 'Cleanup completed', passed: false, error: error.message });
        // }
    }

    return {
        testName,
        success,
        results
    };
}
