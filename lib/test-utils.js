

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateProject } from './generator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


/**
 * Generate a SAM project programmatically without interactive prompts
 * @param {Object} config - Project configuration
 * @param {string} config.projectName - Name of the project
 * @param {string} config.functionName - Name of the Lambda function
 * @param {string} config.apiName - Name of the API Gateway
 * @param {number} config.timeout - Lambda timeout in seconds
 * @param {string[]} config.envVars - Environment variables to include
 * @param {string} config.templateName - Template to use (basic, basic-auth, cognito-auth-api)
 * @param {string} config.architecture - Architecture (arm64 or x86_64)
 * @returns {Promise<void>}
 */
export async function generateProjectProgrammatically(config) {
    const {
        projectName,
        functionName,
        apiName,
        timeout = 60,
        envVars = [],
        templateName = 'basic',
        architecture = 'arm64'
    } = config;

    // Save original working directory
    const originalCwd = process.cwd();

    try {
        // Change to tests/testOutput directory
        const testOutputDir = path.join(originalCwd, 'tests', 'testOutput');
        await fs.ensureDir(testOutputDir);
        process.chdir(testOutputDir);

        // Generate project
        await generateProject(
            projectName,
            functionName,
            apiName,
            timeout,
            envVars,
            templateName,
            architecture
        );
    } finally {
        // Always restore original working directory
        process.chdir(originalCwd);
    }
}

/**
 * Compare two files for equality
 * @param {string} file1Path - Absolute path to first file
 * @param {string} file2Path - Absolute path to second file
 * @param {Object} options - Comparison options
 * @param {Function} options.transform - Optional transform function for content
 * @returns {Promise<{equal: boolean, diff: string}>}
 */
export async function compareFiles(file1Path, file2Path, options = {}) {
    if (!await fs.pathExists(file1Path)) {
        return { equal: false, diff: `File not found: ${file1Path}` };
    }
    if (!await fs.pathExists(file2Path)) {
        return { equal: false, diff: `File not found: ${file2Path}` };
    }

    let content1 = await fs.readFile(file1Path, 'utf8');
    let content2 = await fs.readFile(file2Path, 'utf8');

    if (options.transform) {
        content1 = options.transform(content1, file1Path);
        content2 = options.transform(content2, file2Path);
    }

    if (content1 === content2) {
        return { equal: true, diff: '' };
    }

    // Generate simple diff
    const lines1 = content1.split('\n');
    const lines2 = content2.split('\n');
    const diffLines = [];

    const maxLines = Math.max(lines1.length, lines2.length);
    for (let i = 0; i < maxLines; i++) {
        if (lines1[i] !== lines2[i]) {
            diffLines.push(`Line ${i + 1}:`);
            if (lines1[i] !== undefined) diffLines.push(`  - ${lines1[i]}`);
            if (lines2[i] !== undefined) diffLines.push(`  + ${lines2[i]}`);
        }
    }

    return {
        equal: false,
        diff: diffLines.slice(0, 10).join('\n') + (diffLines.length > 10 ? '\n  ...' : '')
    };
}

/**
 * Compare two directories recursively
 * @param {string} dir1Path - Absolute path to first directory
 * @param {string} dir2Path - Absolute path to second directory
 * @param {Object} options - Comparison options
 * @param {string[]} options.ignore - File/folder names to ignore
 * @param {Function} options.transformFile - Optional transform function for file content
 * @returns {Promise<{equal: boolean, diff: string}>}
 */
export async function compareDirectories(dir1Path, dir2Path, options = {}) {
    const { ignore = [], transformFile } = options;

    if (!await fs.pathExists(dir1Path)) {
        return { equal: false, diff: `Directory not found: ${dir1Path}` };
    }
    if (!await fs.pathExists(dir2Path)) {
        return { equal: false, diff: `Directory not found: ${dir2Path}` };
    }

    const diffs = [];

    async function compareRecursive(relPath = '') {
        const fullPath1 = path.join(dir1Path, relPath);
        const fullPath2 = path.join(dir2Path, relPath);

        const stat1 = await fs.stat(fullPath1);
        const stat2 = await fs.stat(fullPath2);

        if (stat1.isDirectory() !== stat2.isDirectory()) {
            diffs.push(`Type mismatch: ${relPath}`);
            return;
        }

        if (stat1.isDirectory()) {
            const entries1 = await fs.readdir(fullPath1);
            const entries2 = await fs.readdir(fullPath2);

            const filtered1 = entries1.filter(e => !ignore.includes(e));
            const filtered2 = entries2.filter(e => !ignore.includes(e));

            const allEntries = new Set([...filtered1, ...filtered2]);

            for (const entry of allEntries) {
                if (ignore.includes(entry)) continue;

                const entryPath1 = path.join(fullPath1, entry);
                const entryPath2 = path.join(fullPath2, entry);

                const exists1 = await fs.pathExists(entryPath1);
                const exists2 = await fs.pathExists(entryPath2);

                if (!exists1) {
                    diffs.push(`Missing in first: ${path.join(relPath, entry)}`);
                    continue;
                }
                if (!exists2) {
                    diffs.push(`Missing in second: ${path.join(relPath, entry)}`);
                    continue;
                }

                await compareRecursive(path.join(relPath, entry));
            }
        } else {
            // Compare files
            const result = await compareFiles(fullPath1, fullPath2, { transform: transformFile });
            if (!result.equal) {
                diffs.push(`File differs: ${relPath}`);
                if (result.diff) {
                    diffs.push(`  ${result.diff.replace(/\n/g, '\n  ')}`);
                }
            }
        }
    }

    await compareRecursive();

    return {
        equal: diffs.length === 0,
        diff: diffs.join('\n')
    };
}

/**
 * Safely delete a test project directory
 * @param {string} projectPath - Absolute path to project directory
 * @returns {Promise<void>}
 */
export async function cleanup(projectPath) {
    if (await fs.pathExists(projectPath)) {
        await fs.remove(projectPath);
    }
}
/**
 * Update environment variables in a project programmatically (for testing)
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Update options
 * @param {boolean} options.addNew - Add new env vars found in .env
 * @param {boolean} options.removeOld - Remove env vars no longer in .env
 * @param {boolean} options.updateChanged - Update changed env var values
 * @returns {Promise<void>}
 */
export async function updateProjectProgrammatically(projectPath, options = {}) {
    const {
        addNew = true,
        removeOld = true,
        updateChanged = true
    } = options;

    const templatePath = path.join(projectPath, 'template.yaml');
    const envPath = path.join(projectPath, '.env');

    if (!await fs.pathExists(templatePath)) {
        throw new Error('template.yaml not found');
    }
    if (!await fs.pathExists(envPath)) {
        throw new Error('.env not found');
    }

    // Read .env file
    const envContent = await fs.readFile(envPath, 'utf8');
    const envVars = {};
    envContent.split('\n').forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#')) {
            const [key, ...valueParts] = line.split('=');
            if (key && key.trim() !== 'ENVIRONMENT') {
                envVars[key.trim()] = valueParts.join('=').trim();
            }
        }
    });

    // Read template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');

    // Extract existing parameters from template
    const paramRegex = /  Env([a-zA-Z0-9_]+):\s+Type:\s+String\s+Default:\s*'([^']*)'/g;
    const templateVars = {};
    let match;
    while ((match = paramRegex.exec(templateContent)) !== null) {
        templateVars[match[1]] = match[2];
    }

    // Find new, removed, and changed vars
    const newVars = Object.keys(envVars).filter(k => !templateVars[k]);
    const removedVars = Object.keys(templateVars).filter(k => !envVars[k]);
    const changedVars = Object.keys(envVars).filter(k =>
        templateVars[k] !== undefined && templateVars[k] !== envVars[k]
    ).map(k => ({ name: k, oldValue: templateVars[k], newValue: envVars[k] }));

    // Add new variables
    if (addNew && newVars.length > 0) {
        const environment = process.env.ENVIRONMENT || 'dev';
        const projectName = path.basename(projectPath);

        // Create Parameters YAML
        const newParamsYaml = newVars.map(varName => {
            const value = envVars[varName];
            return `  Env${varName}:\n    Type: String\n    Default: '${value}'`;
        }).join('\n') + '\n';

        // Create SSM Resources YAML
        const newResourcesYaml = newVars.map(varName => {
            return `  Param${varName}:\n    Type: AWS::SSM::Parameter\n    Properties:\n      Name: !Sub '/sam-smith/${environment}/${projectName}/${varName}'\n      Type: String\n      Value: !Ref Env${varName}\n`;
        }).join('\n');

        // Insert Parameters
        const parametersIndex = templateContent.indexOf('Parameters:');
        const resourcesIndex = templateContent.indexOf('Resources:');

        if (parametersIndex !== -1 && resourcesIndex !== -1) {
            // Find last parameter
            const parametersSection = templateContent.slice(parametersIndex, resourcesIndex);
            const lastParamMatch = parametersSection.match(/  Env[a-zA-Z0-9_]+:/g);

            if (lastParamMatch) {
                const lastParam = lastParamMatch[lastParamMatch.length - 1];
                const lastParamIndexInSection = parametersSection.lastIndexOf(lastParam);
                const lastParamIndex = parametersIndex + lastParamIndexInSection;
                const afterParam = templateContent.slice(lastParamIndex);
                const defaultLineMatch = afterParam.match(/Default: '[^']*'\n/);

                if (defaultLineMatch) {
                    const insertPos = lastParamIndex + defaultLineMatch.index + defaultLineMatch[0].length;
                    const before = templateContent.slice(0, insertPos);
                    const after = templateContent.slice(insertPos);
                    templateContent = before + newParamsYaml + after;
                }
            } else {
                templateContent = templateContent.replace(
                    /Parameters:\s*\n/,
                    `Parameters:\n${newParamsYaml}`
                );
            }
        } else if (resourcesIndex !== -1) {
            templateContent = templateContent.replace(
                /(Resources:)/,
                `Parameters:\n${newParamsYaml}\n$1`
            );
        }

        // Insert SSM Resources
        const ssmType = 'Type: AWS::SSM::Parameter';
        const lastSsmIndex = templateContent.lastIndexOf(ssmType);

        if (lastSsmIndex !== -1) {
            const remaining = templateContent.slice(lastSsmIndex);
            const doubleNewline = remaining.indexOf('\n\n');

            if (doubleNewline !== -1) {
                const insertPos = lastSsmIndex + doubleNewline;
                const before = templateContent.slice(0, insertPos);
                const after = templateContent.slice(insertPos);
                templateContent = before + `\n\n${newResourcesYaml.trimEnd()}` + after;
            }
        } else {
            templateContent = templateContent.replace(
                /(Resources:\s*\n)/,
                `$1${newResourcesYaml}`
            );
        }
    }

    // Remove old variables
    if (removeOld && removedVars.length > 0) {
        for (const v of removedVars) {
            // Remove Parameter
            const paramRegex = new RegExp(`  Env${v}:\\n( {4,}.*\\n)*\\n?`, 'g');
            templateContent = templateContent.replace(paramRegex, '');

            // Remove SSM Resource
            const resourceRegex = new RegExp(`  Param${v}:\\n( {4,}.*\\n)*\\n?`, 'g');
            templateContent = templateContent.replace(resourceRegex, '');

            // Remove from Lambda Environment
            const usageRegex = new RegExp(`^\\s+${v}: !Ref Env${v}.*\\n?`, 'gm');
            templateContent = templateContent.replace(usageRegex, '');
        }

        // Cleanup empty Environment blocks
        const emptyEnvRegex = /( {6}Environment:\n {8}Variables:\n)(?![ ]{10})/g;
        templateContent = templateContent.replace(emptyEnvRegex, '');

        // Remove empty Parameters section
        const emptyParamsRegex = /Parameters:\s*\n(?=[a-zA-Z0-9])/;
        if (emptyParamsRegex.test(templateContent)) {
            templateContent = templateContent.replace(emptyParamsRegex, '');
        }

        // Ensure blank line before Resources
        templateContent = templateContent.replace(/Default: '[^']*'\nResources:/, (match) => {
            return match.replace('\nResources:', '\n\nResources:');
        });

        // Collapse multiple blank lines
        templateContent = templateContent.replace(/\n{3,}/g, '\n\n');
    }

    // Update changed variables
    if (updateChanged && changedVars.length > 0) {
        for (const v of changedVars) {
            const paramRegex = new RegExp(`(  Env${v.name}:\\s+Type:\\s+String\\s+Default:\\s*')([^']*)(')`, 'g');
            templateContent = templateContent.replace(paramRegex, (match, p1, p2, p3) => p1 + v.newValue + p3);
        }
    }

    // Write updated template
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Add a new Lambda function to a project programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Lambda configuration
 * @param {string} options.lambdaName - Name of the lambda
 * @param {number} options.timeout - Timeout in seconds
 * @param {string[]} options.envVars - Environment variables to include
 * @returns {Promise<void>}
 */
export async function addLambdaProgrammatically(projectPath, options) {
    const { lambdaName, timeout = 60, envVars = [] } = options;
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    if (!await fs.pathExists(templatePath)) {
        throw new Error('template.yaml not found');
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Detect architecture from existing lambda
    let architecture = 'arm64';
    for (let i = 0; i < lines.length; i++) {
        const archMatch = lines[i].match(/^\s+- (arm64|x86_64)$/);
        if (archMatch) {
            architecture = archMatch[1];
            break;
        }
    }

    // Build Lambda YAML
    const functionName = `${lambdaName}Function`;
    let lambdaYaml = `  ${functionName}:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub \${AWS::StackName}-${functionName}
      CodeUri: src/
      Handler: ${lambdaName}/handler.${lambdaName}
      Runtime: nodejs20.x
      Timeout: ${timeout}
      Architectures:
        - ${architecture}`;

    if (envVars.length > 0) {
        lambdaYaml += `
      Environment:
        Variables:`;
        envVars.forEach(v => {
            lambdaYaml += `
          ${v}: !Ref Env${v}`;
        });
    }

    lambdaYaml += `
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: false
        Target: es2020
        Sourcemap: true
        EntryPoints:
          - ${lambdaName}/handler.ts
        External:
          - aws-sdk

  ${functionName}LogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/\${${functionName}}'
      RetentionInDays: 7
`;

    // Insert before Outputs
    let insertLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            insertLine = i;
            break;
        }
    }

    if (insertLine === -1) {
        lines.push(lambdaYaml);
    } else {
        lines.splice(insertLine, 0, lambdaYaml);
    }

    await fs.writeFile(templatePath, lines.join('\n'));

    // Create src files
    const lambdaFolderPath = path.join(srcPath, lambdaName);
    await fs.ensureDir(lambdaFolderPath);

    const handlerTs = `import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const ${lambdaName} = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "hello from ${lambdaName}",
        }),
    };
};
`;
    await fs.writeFile(path.join(lambdaFolderPath, 'handler.ts'), handlerTs);

    const handlerTestTs = `import { ${lambdaName} } from './handler';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Unit test for ${lambdaName} handler', function () {
    it('verifies successful response', async () => {
        const event: APIGatewayProxyEvent = {} as any;
        const result = await ${lambdaName}(event);

        expect(result.statusCode).toEqual(200);
        expect(result.body).toEqual(
            JSON.stringify({
                message: 'hello from ${lambdaName}',
            })
        );
    });
});
`;
    await fs.writeFile(path.join(lambdaFolderPath, 'handler.test.ts'), handlerTestTs);
}

/**
 * Update an existing Lambda function programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Lambda configuration updates
 * @param {string} options.lambdaName - Name of the lambda
 * @param {number} [options.timeout] - New timeout value
 * @param {string[]} [options.envVars] - New environment variables array
 * @returns {Promise<void>}
 */
export async function updateLambdaProgrammatically(projectPath, options) {
    const { lambdaName, timeout, envVars } = options;
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const functionName = `${lambdaName}Function`;

    // Find lambda block
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === functionName) {
                lambdaStartLine = i;
            } else if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                lambdaEndLine = i;
                break;
            }
        }
    }

    if (lambdaStartLine === -1) {
        throw new Error(`Lambda ${functionName} not found in template`);
    }
    if (lambdaEndLine === -1) {
        lambdaEndLine = lines.length;
    }

    // Update timeout if provided
    if (timeout !== undefined) {
        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Timeout:\s*\d+/)) {
                lines[i] = lines[i].replace(/Timeout:\s*\d+/, `Timeout: ${timeout}`);
                break;
            }
        }
    }

    // Update environment variables if provided
    if (envVars !== undefined) {
        // Remove existing Environment block
        let envStartLine = -1;
        let envEndLine = -1;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Environment:\s*$/)) {
                envStartLine = i;
            }
            if (envStartLine !== -1 && envEndLine === -1) {
                // Find where Environment block ends
                if (i > envStartLine && lines[i].match(/^\s{6}\S/) && !lines[i].match(/^\s{8}/)) {
                    envEndLine = i;
                    break;
                }
            }
        }

        if (envStartLine !== -1 && envEndLine === -1) {
            envEndLine = lambdaEndLine;
        }

        // Remove old Environment block if it exists
        if (envStartLine !== -1) {
            lines.splice(envStartLine, envEndLine - envStartLine);
            lambdaEndLine -= (envEndLine - envStartLine);
        }

        // Add new Environment block if vars provided
        if (envVars.length > 0) {
            // Find where to insert (after Architectures and before Events/Metadata)
            let insertLine = -1;

            // First, try to find Architectures and insert right after its array item
            for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
                if (lines[i].match(/^\s+Architectures:/)) {
                    // Find the array item (next line with "- arch")
                    for (let j = i + 1; j < lambdaEndLine; j++) {
                        if (lines[j].match(/^\s+- (arm64|x86_64)/)) {
                            insertLine = j + 1;
                            break;
                        }
                    }
                    break;
                }
            }

            // If Architectures not found, insert before Metadata or Events
            if (insertLine === -1) {
                for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
                    if (lines[i].match(/^\s+Metadata:/) || lines[i].match(/^\s+Events:/)) {
                        insertLine = i;
                        break;
                    }
                }
            }

            // If still not found, insert at end of lambda properties
            if (insertLine === -1) {
                insertLine = lambdaEndLine;
            }

            const envBlock = ['      Environment:', '        Variables:'];
            envVars.forEach(v => {
                envBlock.push(`          ${v}: !Ref Env${v}`);
            });

            lines.splice(insertLine, 0, ...envBlock);
        }
    }

    await fs.writeFile(templatePath, lines.join('\n'));
}

/**
 * Delete a Lambda function programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {string} lambdaName - Name of the lambda to delete
 * @returns {Promise<void>}
 */
export async function deleteLambdaProgrammatically(projectPath, lambdaName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const functionName = `${lambdaName}Function`;
    const logGroupName = `${functionName}LogGroup`;

    // Remove Lambda Resource
    let start = -1;
    let end = -1;

    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (match) {
            if (match[1] === functionName) {
                start = i;
            } else if (start !== -1 && end === -1) {
                end = i;
                break;
            }
        }
    }
    if (start !== -1) {
        if (end === -1) end = lines.length;
        lines.splice(start, end - start);
    }

    // Remove LogGroup
    start = -1;
    end = -1;
    for (let i = 0; i < lines.length; i++) {
        const match = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (match) {
            if (match[1] === logGroupName) {
                start = i;
            } else if (start !== -1 && end === -1) {
                end = i;
                break;
            }
        }
    }
    if (start !== -1) {
        if (end === -1) end = lines.length;
        lines.splice(start, end - start);
    }

    // Clean up newlines
    const content = lines.join('\n').replace(/\n{3,}/g, '\n\n');
    await fs.writeFile(templatePath, content);

    // Remove source folder
    await fs.remove(path.join(srcPath, lambdaName));
}

/**
 * Create an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - API Gateway configuration
 * @param {string} options.gatewayName - Name of the API Gateway
 * @param {Object} [options.endpoint] - Optional endpoint configuration
 * @param {string} [options.endpoint.method] - HTTP method
 * @param {string} [options.endpoint.path] - Path
 * @param {string} [options.endpoint.lambdaName] - Lambda function name
 * @returns {Promise<void>}
 */
export async function createApiGatewayProgrammatically(projectPath, options) {
    const { gatewayName, endpoint } = options;
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');

    // Build API Gateway YAML
    const apiGatewayYaml = `  ${resourceName}:
    Type: AWS::Serverless::Api
    Properties:
      Name: !Sub \${AWS::StackName}-${resourceName}
      StageName: default
      Cors:
        AllowOrigin: "'*'"
        AllowHeaders: "'Content-Type,Authorization'"
        AllowMethods: "'GET,POST,PUT,DELETE,OPTIONS'"
`;

    // Find where to insert (before Outputs)
    let insertLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            insertLine = i;
            break;
        }
    }

    if (insertLine === -1) {
        lines.push(apiGatewayYaml);
    } else {
        lines.splice(insertLine, 0, apiGatewayYaml);
    }

    // Add Output for the API Gateway URL
    const outputYaml = `  ${resourceName}Url:
    Description: "API Gateway endpoint URL"
    Value: !Sub "https://\${${resourceName}}.execute-api.\${AWS::Region}.amazonaws.com/default/"`;

    // Find Outputs section
    let outputsLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            outputsLine = i;
            break;
        }
    }

    if (outputsLine !== -1) {
        lines.splice(outputsLine + 1, 0, outputYaml);
    } else {
        lines.push('');
        lines.push('Outputs:');
        lines.push(outputYaml);
    }

    await fs.writeFile(templatePath, lines.join('\n'));

    // Add endpoint if specified
    if (endpoint) {
        templateContent = await fs.readFile(templatePath, 'utf8');
        lines = templateContent.split('\n');

        const { method, path: endpointPath, lambdaName } = endpoint;
        const functionName = `${lambdaName}Function`;

        // Find lambda
        let lambdaStartLine = -1;
        let lambdaEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (resMatch[1] === functionName) {
                    lambdaStartLine = i;
                } else if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                    lambdaEndLine = i;
                    break;
                }
            }
        }

        if (lambdaStartLine === -1) {
            throw new Error(`Lambda ${functionName} not found`);
        }
        if (lambdaEndLine === -1) lambdaEndLine = lines.length;

        // Find Events section
        let eventsLine = -1;
        let metadataLine = -1;
        let existingEventCount = 0;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Events:\s*$/)) {
                eventsLine = i;
            }
            if (lines[i].match(/^\s+Metadata:/)) {
                metadataLine = i;
                break;
            }
            const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
            if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
                existingEventCount++;
            }
        }

        // Generate new event
        const newEventName = `event${existingEventCount + 1}`;
        const newEventBlock = [
            `        ${newEventName}:`,
            `          Type: Api`,
            `          Properties:`,
            `            RestApiId: !Ref ${resourceName}`,
            `            Path: ${endpointPath}`,
            `            Method: ${method.toLowerCase()}`
        ];

        if (eventsLine !== -1) {
            lines.splice(eventsLine + 1, 0, ...newEventBlock);
        } else if (metadataLine !== -1) {
            const eventsSection = [
                `      Events:`,
                ...newEventBlock
            ];
            lines.splice(metadataLine, 0, ...eventsSection);
        }

        await fs.writeFile(templatePath, lines.join('\n'));
    }
}

/**
 * Delete an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {string} gatewayName - Name of the API Gateway to delete
 * @returns {Promise<void>}
 */
export async function deleteApiGatewayProgrammatically(projectPath, gatewayName) {
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');

    // 1. Delete events that reference this API Gateway from lambdas
    // Find all lambdas and remove events referencing this gateway
    let currentResource = null;
    let lambdaBlocks = [];

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            currentResource = resMatch[1];
        }
        if (currentResource && lines[i].includes('Type: AWS::Serverless::Function')) {
            let lambdaEnd = lines.length;
            for (let j = i + 1; j < lines.length; j++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[j])) {
                    lambdaEnd = j;
                    break;
                }
            }
            lambdaBlocks.push({ name: currentResource, start: i - 1, end: lambdaEnd });
        }
    }

    // Process each lambda to remove events
    for (const lambda of lambdaBlocks) {
        lines = templateContent.split('\n');

        let eventsLineIndex = -1;
        let eventPositions = [];
        let currentEventStart = -1;
        let currentEventName = null;
        let currentEventApiRef = null;
        let inEventsSection = false;

        for (let i = lambda.start; i < lambda.end; i++) {
            if (lines[i].match(/^\s+Events:\s*$/)) {
                eventsLineIndex = i;
                inEventsSection = true;
                continue;
            }
            if (inEventsSection && lines[i].match(/^\s+Metadata:/)) {
                if (currentEventStart !== -1) {
                    eventPositions.push({
                        eventName: currentEventName,
                        startLine: currentEventStart,
                        endLine: i,
                        apiRef: currentEventApiRef
                    });
                }
                break;
            }
            if (inEventsSection) {
                const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
                if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
                    if (currentEventStart !== -1) {
                        eventPositions.push({
                            eventName: currentEventName,
                            startLine: currentEventStart,
                            endLine: i,
                            apiRef: currentEventApiRef
                        });
                    }
                    currentEventName = eventMatch[1];
                    currentEventStart = i;
                    currentEventApiRef = null;
                }
                const apiRefMatch = lines[i].match(/RestApiId:\s*!Ref\s+(\w+)/);
                if (apiRefMatch) {
                    currentEventApiRef = apiRefMatch[1];
                }
            }
        }

        const eventsToRemove = eventPositions.filter(ep => ep.apiRef === resourceName);
        eventsToRemove.sort((a, b) => b.startLine - a.startLine);

        for (const eventPos of eventsToRemove) {
            lines.splice(eventPos.startLine, eventPos.endLine - eventPos.startLine);
        }

        // Remove Events: line if all events were deleted
        if (eventsToRemove.length > 0 && eventPositions.length === eventsToRemove.length && eventsLineIndex !== -1) {
            const adjustedEventsLine = eventsLineIndex;
            if (lines[adjustedEventsLine] && lines[adjustedEventsLine].match(/^\s+Events:/)) {
                lines.splice(adjustedEventsLine, 1);
            }
        }

        templateContent = lines.join('\n');
    }

    // 2. Delete the API Gateway resource
    lines = templateContent.split('\n');
    let gatewayStartLine = -1;
    let gatewayEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === resourceName) {
                gatewayStartLine = i;
            } else if (gatewayStartLine !== -1 && gatewayEndLine === -1) {
                gatewayEndLine = i;
                break;
            }
        }
    }

    if (gatewayStartLine !== -1) {
        if (gatewayEndLine === -1) {
            // Find Outputs section
            for (let i = gatewayStartLine; i < lines.length; i++) {
                if (lines[i].match(/^Outputs:/)) {
                    gatewayEndLine = i;
                    break;
                }
            }
            if (gatewayEndLine === -1) gatewayEndLine = lines.length;
        }
        lines.splice(gatewayStartLine, gatewayEndLine - gatewayStartLine);
    }

    // 3. Delete Outputs that reference this API Gateway
    let outputsToDelete = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(`\${${resourceName}}`) || lines[i].includes(`!Ref ${resourceName}`)) {
            // Find the start of this output
            for (let j = i; j >= 0; j--) {
                if (lines[j].match(/^  [a-zA-Z0-9]+:/)) {
                    let outputEnd = lines.length;
                    for (let k = j + 1; k < lines.length; k++) {
                        if (lines[k].match(/^  [a-zA-Z0-9]+:/) || lines[k].match(/^[a-zA-Z]/)) {
                            outputEnd = k;
                            break;
                        }
                    }
                    outputsToDelete.push({ start: j, end: outputEnd });
                    break;
                }
            }
        }
    }

    // Delete outputs in reverse order
    outputsToDelete.sort((a, b) => b.start - a.start);
    for (const output of outputsToDelete) {
        lines.splice(output.start, output.end - output.start);
    }

    // Clean up multiple blank lines
    templateContent = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Add an endpoint to an existing API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Endpoint configuration
 * @param {string} options.gatewayName - Name of the API Gateway
 * @param {string} options.method - HTTP method
 * @param {string} options.path - Path
 * @param {string} options.lambdaName - Lambda function name
 * @returns {Promise<void>}
 */
export async function addApiGatewayEndpointProgrammatically(projectPath, options) {
    const { gatewayName, method, path: endpointPath, lambdaName } = options;
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');
    const functionName = `${lambdaName}Function`;

    // Find lambda
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === functionName) {
                lambdaStartLine = i;
            } else if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                lambdaEndLine = i;
                break;
            }
        }
    }

    if (lambdaStartLine === -1) {
        throw new Error(`Lambda ${functionName} not found`);
    }
    if (lambdaEndLine === -1) lambdaEndLine = lines.length;

    // Find Events section
    let eventsLine = -1;
    let metadataLine = -1;
    let existingEventCount = 0;

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        if (lines[i].match(/^\s+Events:\s*$/)) {
            eventsLine = i;
        }
        if (lines[i].match(/^\s+Metadata:/)) {
            metadataLine = i;
            break;
        }
        const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
        if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
            existingEventCount++;
        }
    }

    // Generate new event
    const newEventName = `event${existingEventCount + 1}`;
    const newEventBlock = [
        `        ${newEventName}:`,
        `          Type: Api`,
        `          Properties:`,
        `            RestApiId: !Ref ${resourceName}`,
        `            Path: ${endpointPath}`,
        `            Method: ${method.toLowerCase()}`
    ];

    if (eventsLine !== -1) {
        lines.splice(eventsLine + 1, 0, ...newEventBlock);
    } else if (metadataLine !== -1) {
        const eventsSection = [
            `      Events:`,
            ...newEventBlock
        ];
        lines.splice(metadataLine, 0, ...eventsSection);
    }

    await fs.writeFile(templatePath, lines.join('\n'));
}

/**
 * Update an existing API Gateway endpoint programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Update configuration
 * @param {string} options.gatewayName - Name of the API Gateway
 * @param {string} options.oldMethod - Current HTTP method
 * @param {string} options.oldPath - Current path
 * @param {string} options.oldLambdaName - Current Lambda name
 * @param {string} options.newMethod - New HTTP method
 * @param {string} options.newPath - New path
 * @param {string} options.newLambdaName - New Lambda name
 * @returns {Promise<void>}
 */
export async function updateApiGatewayEndpointProgrammatically(projectPath, options) {
    const {
        gatewayName,
        oldMethod,
        oldPath,
        oldLambdaName,
        newMethod,
        newPath,
        newLambdaName
    } = options;

    const templatePath = path.join(projectPath, 'template.yaml');
    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');
    const oldFunctionName = `${oldLambdaName}Function`;
    const newFunctionName = `${newLambdaName}Function`;

    // Find the old lambda and the event to update
    let oldLambdaStart = -1;
    let oldLambdaEnd = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === oldFunctionName) {
                oldLambdaStart = i;
            } else if (oldLambdaStart !== -1 && oldLambdaEnd === -1) {
                oldLambdaEnd = i;
                break;
            }
        }
    }

    if (oldLambdaStart === -1) {
        throw new Error(`Lambda ${oldFunctionName} not found`);
    }
    if (oldLambdaEnd === -1) oldLambdaEnd = lines.length;

    // Find and delete the old event
    let eventToDeleteStart = -1;
    let eventToDeleteEnd = -1;
    let eventsLineInOldLambda = -1;

    for (let i = oldLambdaStart; i < oldLambdaEnd; i++) {
        if (lines[i].match(/^\s+Events:\s*$/)) {
            eventsLineInOldLambda = i;
        }

        const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
        if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
            // Check if this event matches old method and path
            let foundMethod = false;
            let foundPath = false;
            let foundRestApiId = false;

            for (let j = i + 1; j < oldLambdaEnd && j < i + 10; j++) {
                if (lines[j].includes(`Method: ${oldMethod.toLowerCase()}`)) {
                    foundMethod = true;
                }
                if (lines[j].includes(`Path: ${oldPath}`)) {
                    foundPath = true;
                }
                if (lines[j].includes(`RestApiId: !Ref ${resourceName}`)) {
                    foundRestApiId = true;
                }
                if (lines[j].match(/^        [a-zA-Z0-9]+:\s*$/)) {
                    break;
                }
            }

            if (foundMethod && foundPath && foundRestApiId) {
                eventToDeleteStart = i;
                // Find end of this event
                for (let j = i + 1; j < oldLambdaEnd; j++) {
                    if (lines[j].match(/^        [a-zA-Z0-9]+:\s*$/) || lines[j].match(/^\s+Metadata:/)) {
                        eventToDeleteEnd = j;
                        break;
                    }
                }
                if (eventToDeleteEnd === -1) eventToDeleteEnd = oldLambdaEnd;
                break;
            }
        }
    }

    if (eventToDeleteStart === -1) {
        throw new Error(`Event not found: ${oldMethod} ${oldPath}`);
    }

    // Delete the old event
    lines.splice(eventToDeleteStart, eventToDeleteEnd - eventToDeleteStart);

    // Check if Events section is now empty and remove it
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Re-find old lambda after deletion
    oldLambdaStart = -1;
    oldLambdaEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === oldFunctionName) {
                oldLambdaStart = i;
            } else if (oldLambdaStart !== -1 && oldLambdaEnd === -1) {
                oldLambdaEnd = i;
                break;
            }
        }
    }
    if (oldLambdaEnd === -1) oldLambdaEnd = lines.length;

    let hasOtherEvents = false;
    eventsLineInOldLambda = -1;
    for (let i = oldLambdaStart; i < oldLambdaEnd; i++) {
        if (lines[i].match(/^\s+Events:\s*$/)) {
            eventsLineInOldLambda = i;
        }
        const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
        if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
            hasOtherEvents = true;
            break;
        }
    }

    if (!hasOtherEvents && eventsLineInOldLambda !== -1) {
        lines.splice(eventsLineInOldLambda, 1);
    }

    // Now add the event to the new lambda
    await fs.writeFile(templatePath, lines.join('\n'));

    await addApiGatewayEndpointProgrammatically(projectPath, {
        gatewayName,
        method: newMethod,
        path: newPath,
        lambdaName: newLambdaName
    });
}

/**
 * Delete an endpoint from an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {Object} options - Deletion configuration
 * @param {string} options.gatewayName - Name of the API Gateway
 * @param {string} options.method - HTTP method of endpoint to delete
 * @param {string} options.path - Path of endpoint to delete
 * @param {string} options.lambdaName - Lambda function name that has the endpoint
 * @returns {Promise<void>}
 */
export async function deleteApiGatewayEndpointProgrammatically(projectPath, options) {
    const { gatewayName, method, path: endpointPath, lambdaName } = options;
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');
    const functionName = `${lambdaName}Function`;

    // Find the lambda
    let lambdaStart = -1;
    let lambdaEnd = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === functionName) {
                lambdaStart = i;
            } else if (lambdaStart !== -1 && lambdaEnd === -1) {
                lambdaEnd = i;
                break;
            }
        }
    }

    if (lambdaStart === -1) {
        throw new Error(`Lambda ${functionName} not found`);
    }
    if (lambdaEnd === -1) lambdaEnd = lines.length;

    // Find and delete the endpoint
    let eventToDeleteStart = -1;
    let eventToDeleteEnd = -1;
    let eventsLineInLambda = -1;

    for (let i = lambdaStart; i < lambdaEnd; i++) {
        if (lines[i].match(/^\s+Events:\s*$/)) {
            eventsLineInLambda = i;
        }

        const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
        if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
            // Check if this event matches method and path
            let foundMethod = false;
            let foundPath = false;
            let foundRestApiId = false;

            for (let j = i + 1; j < lambdaEnd && j < i + 10; j++) {
                if (lines[j].includes(`Method: ${method.toLowerCase()}`)) {
                    foundMethod = true;
                }
                if (lines[j].includes(`Path: ${endpointPath}`)) {
                    foundPath = true;
                }
                if (lines[j].includes(`RestApiId: !Ref ${resourceName}`)) {
                    foundRestApiId = true;
                }
                if (lines[j].match(/^        [a-zA-Z0-9]+:\s*$/)) {
                    break;
                }
            }

            if (foundMethod && foundPath && foundRestApiId) {
                eventToDeleteStart = i;
                // Find end of this event
                for (let j = i + 1; j < lambdaEnd; j++) {
                    if (lines[j].match(/^        [a-zA-Z0-9]+:\s*$/) || lines[j].match(/^\s+Metadata:/)) {
                        eventToDeleteEnd = j;
                        break;
                    }
                }
                if (eventToDeleteEnd === -1) eventToDeleteEnd = lambdaEnd;
                break;
            }
        }
    }

    if (eventToDeleteStart === -1) {
        throw new Error(`Endpoint not found: ${method} ${endpointPath}`);
    }

    // Delete the event
    lines.splice(eventToDeleteStart, eventToDeleteEnd - eventToDeleteStart);

    // Check if Events section is now empty and remove it
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Re-find lambda after deletion
    lambdaStart = -1;
    lambdaEnd = -1;
    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            if (resMatch[1] === functionName) {
                lambdaStart = i;
            } else if (lambdaStart !== -1 && lambdaEnd === -1) {
                lambdaEnd = i;
                break;
            }
        }
    }
    if (lambdaEnd === -1) lambdaEnd = lines.length;

    let hasOtherEvents = false;
    eventsLineInLambda = -1;
    for (let i = lambdaStart; i < lambdaEnd; i++) {
        if (lines[i].match(/^\s+Events:\s*$/)) {
            eventsLineInLambda = i;
        }
        const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
        if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
            hasOtherEvents = true;
            break;
        }
    }

    if (!hasOtherEvents && eventsLineInLambda !== -1) {
        lines.splice(eventsLineInLambda, 1);
    }

    await fs.writeFile(templatePath, lines.join('\n'));
}

/**
 * Add basic auth to an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {string} gatewayName - Name of the API Gateway
 * @returns {Promise<void>}
 */
export async function addBasicAuthProgrammatically(projectPath, gatewayName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    // 1. Copy authorizer code to src
    const authorizerSourcePath = path.join(__dirname, '../templates/src/authorizer');
    const authorizerDestPath = path.join(srcPath, 'authorizer');

    if (!await fs.pathExists(authorizerDestPath)) {
        await fs.copy(authorizerSourcePath, authorizerDestPath);
    }

    // 2. Update template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Check if BasicAuthorizerFunction already exists
    const hasAuthorizer = lines.some(line => line.includes('BasicAuthorizerFunction:'));
    if (!hasAuthorizer) {
        // Get architecture from existing lambda
        let architecture = 'arm64';
        for (let i = 0; i < lines.length; i++) {
            const archMatch = lines[i].match(/^\s+- (arm64|x86_64)$/);
            if (archMatch) {
                architecture = archMatch[1];
                break;
            }
        }

        // Add BasicAuthorizerFunction before Outputs or at end of Resources
        const authorizerFunctionYaml = `  BasicAuthorizerFunction:
    Type: AWS::Serverless::Function
    Properties:
      FunctionName: !Sub \${AWS::StackName}-BasicAuthorizerFunction
      CodeUri: src/
      Handler: authorizer/authorizer.basicAuthorizer
      Runtime: nodejs20.x
      Timeout: 60
      Architectures:
        - ${architecture}
    Metadata:
      BuildMethod: esbuild
      BuildProperties:
        Minify: false
        Target: es2020
        Sourcemap: true
        EntryPoints:
          - authorizer/authorizer.ts
        External:
          - aws-sdk

  BasicAuthorizerFunctionLogGroup:
    Type: AWS::Logs::LogGroup
    Properties:
      LogGroupName: !Sub '/aws/lambda/\${BasicAuthorizerFunction}'
      RetentionInDays: 7
`;

        // Find where to insert (before Outputs)
        let insertLine = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^Outputs:/)) {
                insertLine = i;
                break;
            }
        }

        if (insertLine === -1) {
            lines.push('');
            lines.push(authorizerFunctionYaml.trim());
        } else {
            lines.splice(insertLine, 0, authorizerFunctionYaml);
        }
    }

    // 3. Add Auth section to the API Gateway
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Clean the gateway name
    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');

    // Find the API Gateway resource
    let apiStartLine = -1;
    let apiEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (apiStartLine !== -1 && apiEndLine === -1) {
                apiEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (apiStartLine !== -1 && apiEndLine === -1) {
                    apiEndLine = i;
                    break;
                }
                if (resMatch[1] === resourceName) {
                    apiStartLine = i;
                }
            }
        }
    }

    if (apiStartLine === -1) {
        throw new Error(`API Gateway ${resourceName} not found`);
    }

    if (apiEndLine === -1) apiEndLine = lines.length;

    // Check if Auth already exists
    let hasAuth = false;
    for (let i = apiStartLine; i < apiEndLine; i++) {
        if (lines[i].match(/^\s+Auth:/)) {
            hasAuth = true;
            break;
        }
    }

    if (!hasAuth) {
        // Find where to insert Auth (after StageName)
        let insertLine = -1;
        for (let i = apiStartLine; i < apiEndLine; i++) {
            if (lines[i].match(/^\s+StageName:/)) {
                insertLine = i + 1;
                break;
            }
        }

        if (insertLine === -1) {
            throw new Error('Could not find StageName in API Gateway');
        }

        const authBlock = [
            `      Auth:`,
            `        DefaultAuthorizer: BasicAuthorizer`,
            `        Authorizers:`,
            `          BasicAuthorizer:`,
            `            FunctionPayloadType: REQUEST`,
            `            FunctionArn: !GetAtt BasicAuthorizerFunction.Arn`,
            `            Identity:`,
            `              Headers:`,
            `                - Key`,
            `              ReauthorizeEvery: 0`
        ];

        lines.splice(insertLine, 0, ...authBlock);
    }

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Add Cognito auth to an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {string} gatewayName - Name of the API Gateway
 * @param {string} poolName - Name of the Cognito User Pool
 * @returns {Promise<void>}
 */
export async function addCognitoAuthProgrammatically(projectPath, gatewayName, poolName) {
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');
    const userPoolName = `${poolName}UserPool`;
    const userPoolClientName = `${poolName}UserPoolClient`;

    // 1. Add Auth section to API Gateway
    let apiStartLine = -1;
    let apiPropertiesLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch && resMatch[1] === resourceName) {
                apiStartLine = i;
            }
            if (apiStartLine !== -1 && lines[i].match(/^    Properties:/)) {
                apiPropertiesLine = i;
                break;
            }
        }
    }

    if (apiPropertiesLine === -1) {
        throw new Error(`API Gateway ${resourceName} not found`);
    }

    const authSection = [
        '      Auth:',
        '        DefaultAuthorizer: CognitoAuthorizer',
        '        Authorizers:',
        '          CognitoAuthorizer:',
        `            UserPoolArn: !GetAtt ${userPoolName}.Arn`
    ];

    lines.splice(apiPropertiesLine + 1, 0, ...authSection);

    // 2. Create UserPool, UserPoolClient resources
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Find where to insert resources (before Outputs)
    let resourcesEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            resourcesEndLine = i;
            break;
        }
    }

    if (resourcesEndLine === -1) {
        resourcesEndLine = lines.length;
    }

    const baseName = userPoolName.replace(/UserPool$/, '');
    const userPoolResource = [
        `  ${userPoolName}:`,
        `    Type: AWS::Cognito::UserPool`,
        `    Properties:`,
        `      UserPoolName: !Sub \${AWS::StackName}-${userPoolName}`,
        `      AutoVerifiedAttributes:`,
        `        - email`,
        `      Policies:`,
        `        PasswordPolicy:`,
        `          MinimumLength: 8`,
        `          RequireLowercase: true`,
        `          RequireNumbers: true`,
        `          RequireSymbols: true`,
        `          RequireUppercase: true`,
        '',
        `  ${userPoolClientName}:`,
        `    Type: AWS::Cognito::UserPoolClient`,
        `    Properties:`,
        `      ClientName: !Sub \${AWS::StackName}-${userPoolClientName}`,
        `      UserPoolId: !Ref ${userPoolName}`,
        `      GenerateSecret: false`,
        `      ExplicitAuthFlows:`,
        `        - ALLOW_USER_PASSWORD_AUTH`,
        `        - ALLOW_REFRESH_TOKEN_AUTH`,
        `        - ALLOW_USER_SRP_AUTH`,
        ''
    ];

    lines.splice(resourcesEndLine, 0, ...userPoolResource);

    // 3. Add Outputs
    let currentOutputsStartLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            currentOutputsStartLine = i;
            break;
        }
    }

    if (currentOutputsStartLine !== -1) {
        // Find insertion point within Outputs
        let insertPosition = currentOutputsStartLine + 1;

        // Find the end of the last output
        for (let i = currentOutputsStartLine + 1; i < lines.length; i++) {
            if (lines[i].match(/^  [a-zA-Z0-9]+:/)) {
                // Find the end of this output block
                let j = i + 1;
                while (j < lines.length && lines[j].match(/^    /)) {
                    j++;
                }
                insertPosition = j;
            }
        }

        const cognitoOutputs = [
            `  ${userPoolName}Id:`,
            `    Description: "Cognito User Pool ID"`,
            `    Value: !Ref ${userPoolName}`,
            `  ${userPoolClientName}Id:`,
            `    Description: "Cognito User Pool Client ID"`,
            `    Value: !Ref ${userPoolClientName}`
        ];

        lines.splice(insertPosition, 0, ...cognitoOutputs);
    } else {
        // Create Outputs section
        const outputsSection = [
            '',
            'Outputs:',
            `  ${userPoolName}Id:`,
            `    Description: "Cognito User Pool ID"`,
            `    Value: !Ref ${userPoolName}`,
            `  ${userPoolClientName}Id:`,
            `    Description: "Cognito User Pool Client ID"`,
            `    Value: !Ref ${userPoolClientName}`
        ];

        lines.push(...outputsSection);
    }

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Remove basic auth from an API Gateway programmatically
 * @param {string} projectPath - Absolute path to the project
 * @param {string} gatewayName - Name of the API Gateway
 * @returns {Promise<void>}
 */
export async function removeBasicAuthProgrammatically(projectPath, gatewayName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Clean the gateway name
    const resourceName = gatewayName.replace(/[^a-zA-Z0-9]/g, '');

    // Find the API Gateway resource
    let apiStartLine = -1;
    let apiEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (apiStartLine !== -1 && apiEndLine === -1) {
                apiEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (apiStartLine !== -1 && apiEndLine === -1) {
                    apiEndLine = i;
                    break;
                }
                if (resMatch[1] === resourceName) {
                    apiStartLine = i;
                }
            }
        }
    }

    if (apiStartLine === -1) {
        throw new Error(`API Gateway ${resourceName} not found`);
    }

    if (apiEndLine === -1) apiEndLine = lines.length;

    // Find and remove Auth section
    let authStartLine = -1;
    let authEndLine = -1;
    for (let i = apiStartLine; i < apiEndLine; i++) {
        if (lines[i].match(/^\s+Auth:/)) {
            authStartLine = i;
            for (let j = i + 1; j < apiEndLine; j++) {
                if (lines[j].match(/^\s{6}\S/) && !lines[j].match(/^\s{8}/)) {
                    authEndLine = j;
                    break;
                }
            }
            if (authEndLine === -1) authEndLine = apiEndLine;
            break;
        }
    }

    if (authStartLine !== -1) {
        lines.splice(authStartLine, authEndLine - authStartLine);
    }

    // Update template content
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Check if BasicAuthorizerFunction is referenced in other API Gateways
    const otherApiGateways = [];
    let currentResource = null;
    inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                currentResource = resMatch[1];
            }
            if (currentResource && currentResource !== resourceName && lines[i].includes('Type: AWS::Serverless::Api')) {
                otherApiGateways.push(currentResource);
            }
        }
    }

    // Check if any other API Gateway references BasicAuthorizerFunction
    let isReferencedElsewhere = false;
    for (const gateway of otherApiGateways) {
        let gatewayStartLine = -1;
        let gatewayEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (gatewayStartLine !== -1 && gatewayEndLine === -1) {
                    gatewayEndLine = i;
                    break;
                }
                if (resMatch[1] === gateway) {
                    gatewayStartLine = i;
                }
            }
        }

        if (gatewayStartLine !== -1) {
            if (gatewayEndLine === -1) gatewayEndLine = lines.length;

            for (let i = gatewayStartLine; i < gatewayEndLine; i++) {
                if (lines[i].includes('BasicAuthorizerFunction')) {
                    isReferencedElsewhere = true;
                    break;
                }
            }
        }

        if (isReferencedElsewhere) break;
    }

    // If not referenced elsewhere, remove BasicAuthorizerFunction and LogGroup
    if (!isReferencedElsewhere) {
        // Remove BasicAuthorizerFunction
        let authorizerStartLine = -1;
        let authorizerEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^  BasicAuthorizerFunction:/)) {
                authorizerStartLine = i;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/^  [a-zA-Z0-9]+:/) || lines[j].match(/^Outputs:/)) {
                        authorizerEndLine = j;
                        break;
                    }
                }
                if (authorizerEndLine === -1) authorizerEndLine = lines.length;
                break;
            }
        }

        if (authorizerStartLine !== -1) {
            lines.splice(authorizerStartLine, authorizerEndLine - authorizerStartLine);
        }

        // Update template content
        templateContent = lines.join('\n');
        lines = templateContent.split('\n');

        // Remove BasicAuthorizerFunctionLogGroup
        let logGroupStartLine = -1;
        let logGroupEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^  BasicAuthorizerFunctionLogGroup:/)) {
                logGroupStartLine = i;
                for (let j = i + 1; j < lines.length; j++) {
                    if (lines[j].match(/^  [a-zA-Z0-9]+:/) || lines[j].match(/^Outputs:/)) {
                        logGroupEndLine = j;
                        break;
                    }
                }
                if (logGroupEndLine === -1) logGroupEndLine = lines.length;
                break;
            }
        }

        if (logGroupStartLine !== -1) {
            lines.splice(logGroupStartLine, logGroupEndLine - logGroupStartLine);
        }

        // Delete authorizer source folder
        const authorizerPath = path.join(srcPath, 'authorizer');
        if (await fs.pathExists(authorizerPath)) {
            await fs.remove(authorizerPath);
        }
    }

    // Clean up and write
    templateContent = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Create a layer programmatically in a test project
 */
export async function createLayerProgrammatically(projectPath, layerName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    // Read template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Build the layer YAML
    const layerYaml = `  ${layerName}:
    Type: 'AWS::Serverless::LayerVersion'
    Properties:
      ContentUri: ./src/layers/${layerName}
      CompatibleRuntimes:
        - nodejs20.x
`;

    // Find where to insert (before Outputs section)
    let insertLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            insertLine = i;
            break;
        }
    }

    if (insertLine === -1) {
        lines.push('');
        lines.push(layerYaml.trim());
    } else {
        lines.splice(insertLine, 0, layerYaml);
    }

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Create layer directory structure
    const layersDir = path.join(srcPath, 'layers');
    const layerDir = path.join(layersDir, layerName);

    await fs.ensureDir(layerDir);

    // Copy template files from templates/src/layers/BoilerPlateLayer
    const templateLayerPath = path.join(__dirname, '../templates/src/layers/BoilerPlateLayer');

    // Copy and customize boilerPlateLayerFunctions.ts
    const templateFunctionFile = path.join(templateLayerPath, 'boilerPlateLayerFunctions.ts');
    let functionContent = await fs.readFile(templateFunctionFile, 'utf8');

    functionContent = functionContent.replace(/boilerPlateLayer/g, layerName);

    const layerFunctionFile = path.join(layerDir, `${layerName}Functions.ts`);
    await fs.writeFile(layerFunctionFile, functionContent);

    // Copy and customize boilerPlateLayerFunctions.test.ts
    const templateTestFile = path.join(templateLayerPath, 'boilerPlateLayerFunctions.test.ts');
    let testContent = await fs.readFile(templateTestFile, 'utf8');

    testContent = testContent.replace(/boilerPlateLayer/g, layerName);

    const layerTestFile = path.join(layerDir, `${layerName}Functions.test.ts`);
    await fs.writeFile(layerTestFile, testContent);
}

/**
 * Delete a layer programmatically in a test project
 */
export async function deleteLayerProgrammatically(projectPath, layerName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const srcPath = path.join(projectPath, 'src');

    // Read template.yaml and find the layer block
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    let layerStartLine = -1;
    let layerEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (layerStartLine !== -1 && layerEndLine === -1) {
                layerEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (layerStartLine !== -1 && layerEndLine === -1) {
                    layerEndLine = i;
                    break;
                }
                if (resMatch[1] === layerName) {
                    layerStartLine = i;
                }
            }
        }
    }

    if (layerStartLine !== -1) {
        if (layerEndLine === -1) layerEndLine = lines.length;

        lines.splice(layerStartLine, layerEndLine - layerStartLine);

        templateContent = lines.join('\n');
        await fs.writeFile(templatePath, templateContent);
    }

    // Delete the layer source directory
    const layerDir = path.join(srcPath, 'layers', layerName);
    if (await fs.pathExists(layerDir)) {
        await fs.remove(layerDir);
    }

    // Check if layers directory is empty and delete it if so
    const layersDir = path.join(srcPath, 'layers');
    if (await fs.pathExists(layersDir)) {
        const remainingLayers = await fs.readdir(layersDir);
        if (remainingLayers.length === 0) {
            await fs.remove(layersDir);
        }
    }
}

/**
 * Add a layer to a lambda programmatically in a test project
 */
export async function addLayerToLambdaProgrammatically(projectPath, lambdaName, layerName) {
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Find the lambda function
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch && resMatch[1] === lambdaName) {
            lambdaStartLine = i;
            // Find end of this lambda
            for (let j = i + 1; j < lines.length; j++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[j])) {
                    lambdaEndLine = j;
                    break;
                }
            }
            if (lambdaEndLine === -1) lambdaEndLine = lines.length;
            break;
        }
    }

    if (lambdaStartLine === -1) {
        throw new Error(`Lambda ${lambdaName} not found`);
    }

    // Check if Layers section exists
    let layersLineIndex = -1;
    let insertLine = -1;

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        if (lines[i].match(/^\s+Layers:/)) {
            layersLineIndex = i;
            // Find the last layer line
            for (let j = i + 1; j < lambdaEndLine; j++) {
                if (lines[j].match(/^\s{6}\S/) && !lines[j].match(/^\s{8}/)) {
                    insertLine = j;
                    break;
                }
                if (lines[j].match(/- !Ref\s+/)) {
                    insertLine = j + 1;
                }
            }
            break;
        }
    }

    if (layersLineIndex === -1) {
        // Need to create Layers section
        let insertPosition = -1;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Architectures:/)) {
                for (let j = i + 1; j < lambdaEndLine; j++) {
                    if (lines[j].match(/^\s+- (arm64|x86_64)/)) {
                        insertPosition = j + 1;
                        break;
                    }
                }
                break;
            }
        }

        if (insertPosition === -1) {
            for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
                if (lines[i].match(/^\s+(Events|Metadata):/)) {
                    insertPosition = i;
                    break;
                }
            }
        }

        if (insertPosition === -1) {
            insertPosition = lambdaEndLine;
        }

        const layersBlock = [
            '      Layers:',
            `        - !Ref ${layerName}`
        ];

        lines.splice(insertPosition, 0, ...layersBlock);
    } else {
        // Add to existing Layers section
        lines.splice(insertLine, 0, `        - !Ref ${layerName}`);
    }

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);
}

/**
 * Remove a layer from a lambda programmatically in a test project
 */
export async function removeLayerFromLambdaProgrammatically(projectPath, lambdaName, layerName) {
    const templatePath = path.join(projectPath, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Find the lambda function
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch && resMatch[1] === lambdaName) {
            lambdaStartLine = i;
            for (let j = i + 1; j < lines.length; j++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[j])) {
                    lambdaEndLine = j;
                    break;
                }
            }
            if (lambdaEndLine === -1) lambdaEndLine = lines.length;
            break;
        }
    }

    if (lambdaStartLine === -1) {
        throw new Error(`Lambda ${lambdaName} not found`);
    }

    // Find current layers in the lambda
    const currentLayers = [];
    let layersStartLine = -1;
    let inLayers = false;

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        if (lines[i].match(/^\s+Layers:/)) {
            layersStartLine = i;
            inLayers = true;
            continue;
        }
        if (inLayers) {
            if (lines[i].match(/^\s{6}\S/) && !lines[i].match(/^\s{8}/)) {
                break;
            }
            const layerMatch = lines[i].match(/- !Ref\s+(\w+)/);
            if (layerMatch) {
                currentLayers.push({ name: layerMatch[1], line: i });
            }
        }
    }

    // Find and remove the layer line
    const layerToRemove = currentLayers.find(l => l.name === layerName);
    if (layerToRemove) {
        lines.splice(layerToRemove.line, 1);

        // If this was the last layer, remove the Layers: line too
        if (currentLayers.length === 1) {
            layersStartLine = layerToRemove.line > layersStartLine ? layersStartLine : layersStartLine - 1;
            lines.splice(layersStartLine, 1);
        }

        templateContent = lines.join('\n');
        await fs.writeFile(templatePath, templateContent);
    }
}

/**
 * Create a DynamoDB table programmatically in a test project
 */
export async function createTableProgrammatically(projectPath, tableName, primaryKeys, secondaryKeys) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const utilsPath = path.join(projectPath, 'src', 'utils');

    // Read template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Parse keys - only use first key for AttributeDefinitions
    const pkKeys = primaryKeys.split('#');
    const skKeys = secondaryKeys.split('#');

    const pkAttr = `        - AttributeName: ${primaryKeys}\n          AttributeType: 'S'`;
    const skAttr = `        - AttributeName: ${secondaryKeys}\n          AttributeType: 'S'`;

    const pkKeySchema = `        - AttributeName: ${primaryKeys}\n          KeyType: 'HASH'`;
    const skKeySchema = `        - AttributeName: ${secondaryKeys}\n          KeyType: 'RANGE'`;

    const tableYaml = `  ${tableName}:
    Type: 'AWS::DynamoDB::Table'
    DeletionPolicy: Retain
    Properties:
      TableName: !Sub \${AWS::StackName}-${tableName}
      AttributeDefinitions:
${pkAttr}
${skAttr}
      KeySchema:
${pkKeySchema}
${skKeySchema}
      BillingMode: PAY_PER_REQUEST

  ${tableName}Policy:
    Type: AWS::IAM::ManagedPolicy
    Properties:
      ManagedPolicyName: !Sub \${AWS::StackName}-${tableName}Policy
      PolicyDocument:
        Version: '2012-10-17'
        Statement:
          - Effect: Allow
            Action:
              - dynamodb:Query
              - dynamodb:Scan
              - dynamodb:GetItem
              - dynamodb:PutItem
              - dynamodb:UpdateItem
              - dynamodb:DeleteItem
            Resource: !GetAtt ${tableName}.Arn
`;

    // Find Outputs section
    let insertLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            insertLine = i;
            break;
        }
    }

    if (insertLine === -1) {
        lines.push('');
        lines.push(tableYaml.trim());
    } else {
        lines.splice(insertLine, 0, tableYaml);
    }

    // Write template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Copy and customize boilerplate files
    await fs.ensureDir(utilsPath);

    const templateHandlerPath = path.join(__dirname, '../templates/.boilerplates/dynamoTableHandler.ts');
    const templateTestPath = path.join(__dirname, '../templates/.boilerplates/dynamoTableHandler.spec.ts');

    const capitalize = (str) => str.charAt(0).toUpperCase() + str.slice(1);
    const projectName = path.basename(projectPath);
    const env = 'dev';
    const fullTableName = `sam-smith-${projectName}-${env}-${tableName}`;

    // Handler file
    let handlerContent = await fs.readFile(templateHandlerPath, 'utf8');
    handlerContent = handlerContent.replace(/const tableName = ".*";/, `const tableName = "${fullTableName}";`);
    handlerContent = handlerContent.replace(/export async function tryDynamoQuery/g, `export async function try${capitalize(tableName)}Query`);

    // Replace PK type and keys
    const pkType = pkKeys.map((key, i) => `        ${key}: string;`).join('\n');
    handlerContent = handlerContent.replace(/type pk = \{[^}]+\};/s, `type pk = {\n${pkType}\n    };`);

    // Replace SK type and keys
    const skType = skKeys.map((key, i) => `        ${key}: string;`).join('\n');
    handlerContent = handlerContent.replace(/type sk = \{[^}]+\};/s, `type sk = {\n${skType}\n    };`);

    const pkKeysArray = pkKeys.map(k => `'${k}'`).join(', ');
    const skKeysArray = skKeys.map(k => `'${k}'`).join(', ');

    handlerContent = handlerContent.replace(
        /pk: \{[^}]+\}/s,
        `pk: {
            name: '${primaryKeys}',
            keys: [${pkKeysArray}],
            separator: '#'
        }`
    );

    handlerContent = handlerContent.replace(
        /sk: \{[^}]+\}/s,
        `sk: {
            name: '${secondaryKeys}',
            keys: [${skKeysArray}],
            separator: '#',
        }`
    );

    // Deduplicate keys for put/getOne/delete
    const allKeys = [...new Set([...pkKeys, ...skKeys])];
    const allProps = allKeys.map(key => `${key}: '${key}'`).join(',\n        ');
    const pkProps = pkKeys.map(key => `${key}: '${key}'`).join(',\n        ');
    const skProps = skKeys.map(key => `${key}: '${key}'`).join(',\n        ');

    handlerContent = handlerContent.replace(
        /await messageTable\.put\(\{[^}]+\}\);/s,
        `await messageTable.put({\n        ${allProps},\n        data: 'Hello!',\n    });`
    );

    handlerContent = handlerContent.replace(
        /await messageTable\.getOne\(\{[^}]+\},\s*\{[^}]+\}\);/s,
        `await messageTable.getOne({\n        ${pkProps},\n    }, {\n        ${skProps},\n    });`
    );

    handlerContent = handlerContent.replace(
        /await messageTable\.delete\(\{[^}]+\},\s*\{[^}]+\}\);/s,
        `await messageTable.delete({\n        ${pkProps},\n    }, {\n        ${skProps},\n    });`
    );

    await fs.writeFile(path.join(utilsPath, `${tableName}Handler.ts`), handlerContent);

    // Test file
    let testContent = await fs.readFile(templateTestPath, 'utf8');
    testContent = testContent.replace(/from '\.\/dynamoTableHandler'/g, `from './${tableName}Handler'`);
    testContent = testContent.replace(/tryDynamoQuery/g, `try${capitalize(tableName)}Query`);
    testContent = testContent.replace(/dynamoTableHandler/g, `${tableName}Handler`);

    // For mockResolvedValue: 12 spaces
    const mockResult = allKeys.map(key => `${key}: '${key}'`).join(',\n            ');
    // For expect: 16 spaces
    const expectedResult = allKeys.map(key => `${key}: '${key}'`).join(',\n                ');

    testContent = testContent.replace(
        /getOne: jest\.fn\(\)\.mockResolvedValue\(\{[^}]+\}\),/s,
        `getOne: jest.fn().mockResolvedValue({\n            ${mockResult},\n            data: 'Hello!',\n        }),`
    );

    testContent = testContent.replace(
        /expect\(result\)\.toEqual\(\{[^}]+\}\);/s,
        `expect(result).toEqual({\n                ${expectedResult},\n                data: 'Hello!',\n            });`
    );

    await fs.writeFile(path.join(utilsPath, `${tableName}Handler.spec.ts`), testContent);
}

/**
 * Delete a DynamoDB table programmatically in a test project
 */
export async function deleteTableProgrammatically(projectPath, tableName) {
    const templatePath = path.join(projectPath, 'template.yaml');
    const utilsPath = path.join(projectPath, 'src', 'utils');

    // Read template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Find and remove the table resource
    let tableStartLine = -1;
    let tableEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(new RegExp(`^  ${tableName}:`))) {
            tableStartLine = i;
            // Find end of table resource
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].match(/^  [a-zA-Z0-9]+:/) || lines[j].match(/^Outputs:/)) {
                    tableEndLine = j - 1;
                    break;
                }
            }
            break;
        }
    }

    // Find and remove the table policy
    let policyStartLine = -1;
    let policyEndLine = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(new RegExp(`^  ${tableName}Policy:`))) {
            policyStartLine = i;
            // Find end of policy resource
            for (let j = i + 1; j < lines.length; j++) {
                if (lines[j].match(/^  [a-zA-Z0-9]+:/) || lines[j].match(/^Outputs:/)) {
                    policyEndLine = j - 1;
                    break;
                }
            }
            break;
        }
    }

    // Remove resources
    if (policyStartLine !== -1 && policyStartLine > (tableStartLine || 0)) {
        // Remove trailing blank lines
        while (policyEndLine + 1 < lines.length && lines[policyEndLine + 1].trim() === '') {
            policyEndLine++;
        }
        lines.splice(policyStartLine, policyEndLine - policyStartLine + 1);

        if (tableStartLine !== -1) {
            while (tableEndLine + 1 < lines.length && lines[tableEndLine + 1].trim() === '') {
                tableEndLine++;
            }
            lines.splice(tableStartLine, tableEndLine - tableStartLine + 1);
        }
    } else if (tableStartLine !== -1) {
        while (tableEndLine + 1 < lines.length && lines[tableEndLine + 1].trim() === '') {
            tableEndLine++;
        }
        lines.splice(tableStartLine, tableEndLine - tableStartLine + 1);

        if (policyStartLine !== -1) {
            const removedLines = tableEndLine - tableStartLine + 1;
            policyStartLine -= removedLines;
            policyEndLine -= removedLines;

            while (policyEndLine + 1 < lines.length && lines[policyEndLine + 1].trim() === '') {
                policyEndLine++;
            }
            lines.splice(policyStartLine, policyEndLine - policyStartLine + 1);
        }
    }

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Delete handler files
    const handlerFile = path.join(utilsPath, `${tableName}Handler.ts`);
    const testFile = path.join(utilsPath, `${tableName}Handler.spec.ts`);

    if (await fs.pathExists(handlerFile)) {
        await fs.remove(handlerFile);
    }
    if (await fs.pathExists(testFile)) {
        await fs.remove(testFile);
    }
}

/**
 * Attach DynamoDB tables to a Lambda function programmatically
 */
export async function attachTablesToLambdaProgrammatically(projectPath, lambdaName, tableNames) {
    const templatePath = path.join(projectPath, 'template.yaml');
    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Find the lambda
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                lambdaEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                    lambdaEndLine = i;
                    break;
                }
                if (resMatch[1] === lambdaName) {
                    lambdaStartLine = i;
                }
            }
        }
    }

    if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
        lambdaEndLine = lines.length;
    }

    // Check if Policies section exists
    let policiesLineIndex = -1;
    let insertLine = -1;

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        if (lines[i].match(/^\s+Policies:/)) {
            policiesLineIndex = i;
            // Find the last policy line
            for (let j = i + 1; j < lambdaEndLine; j++) {
                if (lines[j].match(/^\s{6}\S/) && !lines[j].match(/^\s{8}/)) {
                    break;
                }
                if (lines[j].match(/- !Ref\s+/)) {
                    insertLine = j + 1;
                }
            }
            break;
        }
    }

    if (policiesLineIndex === -1) {
        // Need to create Policies section
        let insertPosition = -1;

        // Insert after Layers or Architectures
        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Layers:/)) {
                // Find end of Layers section
                for (let j = i + 1; j < lambdaEndLine; j++) {
                    if (lines[j].match(/^\s{6}\S/) && !lines[j].match(/^\s{8}/)) {
                        insertPosition = j;
                        break;
                    }
                }
                if (insertPosition !== -1) break;
            }
        }

        if (insertPosition === -1) {
            for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
                if (lines[i].match(/^\s+Architectures:/)) {
                    for (let j = i + 1; j < lambdaEndLine; j++) {
                        if (lines[j].match(/^\s+- (arm64|x86_64)/)) {
                            insertPosition = j + 1;
                            break;
                        }
                    }
                    break;
                }
            }
        }

        if (insertPosition === -1) {
            for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
                if (lines[i].match(/^\s+(Events|Metadata):/)) {
                    insertPosition = i;
                    break;
                }
            }
        }

        if (insertPosition === -1) {
            insertPosition = lambdaEndLine;
        }

        const policiesBlock = ['      Policies:'];
        tableNames.forEach(tableName => {
            policiesBlock.push(`        - !Ref ${tableName}Policy`);
        });

        lines.splice(insertPosition, 0, ...policiesBlock);
    } else {
        // Add to existing Policies section
        tableNames.forEach(tableName => {
            lines.splice(insertLine, 0, `        - !Ref ${tableName}Policy`);
            insertLine++;
        });
    }

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Add imports to lambda handler
    const handlerPath = await getHandlerPathForTest(lambdaName, lines, projectPath);
    if (handlerPath) {
        await addTableImportsForTest(handlerPath, tableNames);
    }
}

/**
 * Remove DynamoDB tables from a Lambda function programmatically
 */
export async function removeTablesFromLambdaProgrammatically(projectPath, lambdaName, tableNames) {
    const templatePath = path.join(projectPath, 'template.yaml');
    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Find the lambda
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                lambdaEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                    lambdaEndLine = i;
                    break;
                }
                if (resMatch[1] === lambdaName) {
                    lambdaStartLine = i;
                }
            }
        }
    }

    if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
        lambdaEndLine = lines.length;
    }

    // Find current tables in the lambda
    const currentTables = [];
    let policiesLineIndex = -1;
    let inPolicies = false;
    const policyLines = [];

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        if (lines[i].match(/^\s+Policies:/)) {
            policiesLineIndex = i;
            inPolicies = true;
            continue;
        }
        if (inPolicies) {
            if (lines[i].match(/^\s{6}\S/) && !lines[i].match(/^\s{8}/)) {
                break;
            }
            const policyMatch = lines[i].match(/- !Ref\s+(\w+)Policy/);
            if (policyMatch) {
                currentTables.push(policyMatch[1]);
                policyLines.push(i);
            }
        }
    }

    // Remove policies from bottom to top to avoid index issues
    for (let i = policyLines.length - 1; i >= 0; i--) {
        const tableName = currentTables[i];
        if (tableNames.includes(tableName)) {
            lines.splice(policyLines[i], 1);
        }
    }

    // Check if Policies section is now empty
    const remainingPolicies = currentTables.filter(t => !tableNames.includes(t));
    if (remainingPolicies.length === 0 && policiesLineIndex !== -1) {
        // Remove the entire Policies: line
        lines.splice(policiesLineIndex, 1);
    }

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Remove imports from lambda handler
    const handlerPath = await getHandlerPathForTest(lambdaName, lines, projectPath);
    if (handlerPath) {
        await removeTableImportsForTest(handlerPath, tableNames);
    }
}

// Helper functions for test
async function getHandlerPathForTest(lambdaName, templateLines, projectPath) {
    let inLambda = false;
    let handlerValue = null;

    for (let i = 0; i < templateLines.length; i++) {
        if (templateLines[i].includes(`${lambdaName}:`)) {
            inLambda = true;
            continue;
        }
        if (inLambda) {
            if (templateLines[i].match(/^  [a-zA-Z0-9]+:/)) {
                break;
            }
            const handlerMatch = templateLines[i].match(/Handler:\s+(.+)/);
            if (handlerMatch) {
                handlerValue = handlerMatch[1].trim();
                break;
            }
        }
    }

    if (!handlerValue) return null;

    const handlerParts = handlerValue.split('.');
    if (handlerParts.length < 2) return null;

    const modulePath = handlerParts[0];
    const handlerFilePath = path.join(projectPath, 'src', `${modulePath}.ts`);

    if (!await fs.pathExists(handlerFilePath)) {
        return null;
    }

    return handlerFilePath;
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

async function addTableImportsForTest(handlerPath, tableNames) {
    let content = await fs.readFile(handlerPath, 'utf8');
    const lines = content.split('\n');

    let lastImportLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith('import ')) {
            lastImportLine = i;
        } else if (lastImportLine !== -1 && lines[i].trim() !== '') {
            break;
        }
    }

    const insertAt = lastImportLine + 1;

    const newImports = [];
    for (const tableName of tableNames) {
        const functionName = `try${capitalize(tableName)}Query`;
        const importStatement = `import { ${functionName} } from '../utils/${tableName}Handler';`;

        const importExists = lines.some(line => line.includes(`from '../utils/${tableName}Handler'`));
        if (!importExists) {
            newImports.push(importStatement);
        }
    }

    if (newImports.length > 0) {
        lines.splice(insertAt, 0, ...newImports);
        await fs.writeFile(handlerPath, lines.join('\n'));
    }
}

async function removeTableImportsForTest(handlerPath, tableNames) {
    let content = await fs.readFile(handlerPath, 'utf8');
    const lines = content.split('\n');

    let removedCount = 0;
    for (let i = lines.length - 1; i >= 0; i--) {
        for (const tableName of tableNames) {
            if (lines[i].includes(`from '../utils/${tableName}Handler'`)) {
                lines.splice(i, 1);
                removedCount++;
                break;
            }
        }
    }

    if (removedCount > 0) {
        await fs.writeFile(handlerPath, lines.join('\n'));
    }
}
