import path from 'path';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import fs from 'fs-extra';
import {
    generateProjectProgrammatically,
    compareFiles,
    compareDirectories,
    addCognitoAuthProgrammatically,
    cleanup
} from '../lib/test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Test: testCognitoAuthWorkflow
 * Validates the complete Cognito auth workflow:
 * 1. Create app with cognito-auth template
 * 2. Remove authentication
 * 3. Add cognito auth with new pool
 * 4. Add user group 1
 * 5. Add user group 2
 * 6. Delete user group 1
 */
export async function testCognitoAuthWorkflow() {
    const testName = 'testCognitoAuthWorkflow';
    const envFilePath = path.join(__dirname, 'envs', '.env.testLambdaWithEnvs');

    const expectedPath = path.join(__dirname, 'expected', testName);
    const outputPath = path.join(__dirname, 'testOutput', testName);

    const results = [];
    let success = true;

    try {
        // Set up environment for generation
        const originalEnv = process.env.DOTENV_CONFIG_PATH;
        process.env.DOTENV_CONFIG_PATH = envFilePath;

        // Step 1: Generate project with cognito-auth template
        console.log(chalk.blue(`  Generating project with cognito-auth template in testOutput/${testName}...`));
        await generateProjectProgrammatically({
            projectName: testName,
            functionName: testName,
            apiName: `${testName}-api`,
            timeout: 60,
            envVars: [],
            templateName: 'basic',  // Start with basic
            architecture: 'arm64'
        });

        results.push({ step: 'Initial project generated', passed: true });

        // Step 2: Add Cognito auth with pool1
        console.log(chalk.gray('  Adding Cognito auth with pool1...'));
        await addCognitoAuthProgrammatically(outputPath, `${testName}-api`, 'pool1');

        results.push({ step: 'Cognito auth added with pool1', passed: true });

        // Step 3: Remove authentication
        console.log(chalk.gray('  Removing authentication...'));
        const templatePath = path.join(outputPath, 'template.yaml');
        let templateContent = await fs.readFile(templatePath, 'utf8');
        let lines = templateContent.split('\n');

        // Find and remove Auth section from API Gateway
        const apiName = `${testName}api`;
        let authStartLine = -1;
        let authEndLine = -1;
        let inApi = false;
        let apiStartLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(new RegExp(`^  ${apiName}:`))) {
                inApi = true;
                apiStartLine = i;
            }
            if (inApi && lines[i].match(/^  [a-zA-Z0-9]+:/) && i > apiStartLine) {
                inApi = false;
            }
            if (inApi && lines[i].match(/^      Auth:/)) {
                authStartLine = i;
                // Find the end of Auth section - next line with 6 spaces that's NOT indented more
                for (let j = i + 1; j < lines.length; j++) {
                    // If we hit another property at the same level (6 spaces + letter) or a resource (2 spaces), we're done
                    if (lines[j].match(/^      [a-zA-Z]/) && !lines[j].match(/^        /)) {
                        authEndLine = j;
                        break;
                    }
                    if (lines[j].match(/^  [a-zA-Z0-9]+:/)) {
                        authEndLine = j;
                        break;
                    }
                }
                break;
            }
        }

        if (authStartLine !== -1) {
            if (authEndLine === -1) {
                // Find next section at same indentation
                for (let i = authStartLine + 1; i < lines.length; i++) {
                    if (lines[i].match(/^      [a-zA-Z]/) || lines[i].match(/^  [a-zA-Z0-9]+:/)) {
                        authEndLine = i;
                        break;
                    }
                }
            }
            if (authEndLine !== -1) {
                lines.splice(authStartLine, authEndLine - authStartLine);
            }
        }

        await fs.writeFile(templatePath, lines.join('\n'));
        results.push({ step: 'Authentication removed', passed: true });

        // Step 4: Add Cognito auth with pool2
        console.log(chalk.gray('  Adding Cognito auth with pool2...'));
        await addCognitoAuthProgrammatically(outputPath, `${testName}-api`, 'pool2');

        results.push({ step: 'Cognito auth added with pool2', passed: true });

        // Step 5: Add user group 1
        console.log(chalk.gray('  Adding user group 1...'));
        templateContent = await fs.readFile(templatePath, 'utf8');
        lines = templateContent.split('\n');

        // Find where to insert the user group (before Outputs)
        let insertLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^Outputs:/)) {
                insertLine = i;
                break;
            }
        }

        const group1Resource = [
            '  group1UserPoolGroup:',
            '    Type: AWS::Cognito::UserPoolGroup',
            '    Properties:',
            '      GroupName: group1',
            '      Description: "g1"',
            '      Precedence: 1',
            '      UserPoolId: !Ref pool2UserPool',
            ''
        ];

        lines.splice(insertLine, 0, ...group1Resource);
        await fs.writeFile(templatePath, lines.join('\n'));
        results.push({ step: 'User group 1 added', passed: true });

        // Step 6: Add user group 2
        console.log(chalk.gray('  Adding user group 2...'));
        templateContent = await fs.readFile(templatePath, 'utf8');
        lines = templateContent.split('\n');

        // Find where to insert group2 (after group1)
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^Outputs:/)) {
                insertLine = i;
                break;
            }
        }

        const group2Resource = [
            '  group2UserPoolGroup:',
            '    Type: AWS::Cognito::UserPoolGroup',
            '    Properties:',
            '      GroupName: group2',
            '      Description: "g2"',
            '      Precedence: 2',
            '      UserPoolId: !Ref pool2UserPool',
            ''
        ];

        lines.splice(insertLine, 0, ...group2Resource);
        await fs.writeFile(templatePath, lines.join('\n'));
        results.push({ step: 'User group 2 added', passed: true });

        // Step 7: Delete user group 1
        console.log(chalk.gray('  Deleting user group 1...'));
        templateContent = await fs.readFile(templatePath, 'utf8');
        lines = templateContent.split('\n');

        // Find and remove group1
        let group1StartLine = -1;
        let group1EndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^  group1UserPoolGroup:/)) {
                group1StartLine = i;
                break; // Stop once we find it
            }
        }

        if (group1StartLine !== -1) {
            // Now find the end of this resource
            for (let i = group1StartLine + 1; i < lines.length; i++) {
                if (lines[i].match(/^  [a-zA-Z0-9]+:/) || lines[i].match(/^Outputs:/)) {
                    group1EndLine = i;
                    break;
                }
            }
            if (group1EndLine !== -1) {
                lines.splice(group1StartLine, group1EndLine - group1StartLine);
            }
        }

        await fs.writeFile(templatePath, lines.join('\n'));
        results.push({ step: 'User group 1 deleted', passed: true });

        // Step 8: Compare with expected output
        console.log(chalk.gray('  Comparing template.yaml...'));
        const templateResult = await compareFiles(
            path.join(outputPath, 'template.yaml'),
            path.join(expectedPath, 'template.yaml')
        );

        if (templateResult.equal) {
            results.push({ step: 'template.yaml matches', passed: true });
        } else {
            results.push({ step: 'template.yaml matches', passed: false, diff: templateResult.diff });
            success = false;
        }

        // Step 9: Verify pool1 and pool2 exist
        console.log(chalk.gray('  Verifying pool1 and pool2 resources...'));
        templateContent = await fs.readFile(templatePath, 'utf8');

        const hasPool1 = templateContent.includes('pool1UserPool:');
        const hasPool2 = templateContent.includes('pool2UserPool:');
        const hasGroup2 = templateContent.includes('group2UserPoolGroup:');
        const hasNoGroup1 = !templateContent.includes('group1UserPoolGroup:');

        if (hasPool1 && hasPool2 && hasGroup2 && hasNoGroup1) {
            results.push({ step: 'Resource verification passed', passed: true });
        } else {
            results.push({
                step: 'Resource verification',
                passed: false,
                error: `pool1: ${hasPool1}, pool2: ${hasPool2}, group2: ${hasGroup2}, no group1: ${hasNoGroup1}`
            });
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
