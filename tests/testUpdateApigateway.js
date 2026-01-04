import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    addLambdaProgrammatically,
    addApiGatewayEndpointProgrammatically,
    updateApiGatewayEndpointProgrammatically
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testUpdateApigateway
 * Validates updating API Gateway endpoints
 */
export async function testUpdateApigateway() {
    const testName = 'testUpdateApigateway';
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

        // Step 2: Add lambda2
        console.log(chalk.gray('  Adding lambda2...'));
        await addLambdaProgrammatically(outputPath, {
            lambdaName: 'lambda2',
            timeout: 60,
            envVars: []
        });

        results.push({ step: 'lambda2 created', passed: true });

        // Step 3: Add new endpoint POST /test to lambda2
        console.log(chalk.gray('  Adding endpoint POST /test to lambda2...'));
        await addApiGatewayEndpointProgrammatically(outputPath, {
            gatewayName: `${testName}-api`,
            method: 'post',
            path: '/test',
            lambdaName: 'lambda2'
        });

        results.push({ step: 'POST /test endpoint added', passed: true });

        // Step 4: Update existing endpoint GET /hello to DELETE /hello2 and change to lambda2
        console.log(chalk.gray('  Updating GET /hello to DELETE /hello2...'));
        await updateApiGatewayEndpointProgrammatically(outputPath, {
            gatewayName: `${testName}-api`,
            oldMethod: 'get',
            oldPath: '/hello',
            oldLambdaName: testName,
            newMethod: 'delete',
            newPath: '/hello2',
            newLambdaName: 'lambda2'
        });

        results.push({ step: 'Endpoint updated to DELETE /hello2', passed: true });

        // Step 5: Compare template.yaml
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

        // Step 6: Compare samconfig.toml
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

        // Step 7: Compare src/ directory
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
