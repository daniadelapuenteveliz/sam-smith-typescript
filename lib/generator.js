import fs from 'fs-extra';
import path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { fileURLToPath } from 'url';
import { addBasicAuthProgrammatically, addCognitoAuthProgrammatically } from './test-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function generateProject(projectName, functionName, apiName, timeout, envVars = [], templateName = 'basic', architecture = 'x86_64') {
    const projectPath = path.join(process.cwd(), projectName);
    const templatePath = path.join(__dirname, '../templates');

    try {
        console.log(chalk.green(`\n✓ Creating project in ${projectPath}...`));
        await fs.ensureDir(projectPath);

        // Read and customize template.yaml
        let templateContent = await fs.readFile(
            path.join(templatePath, 'template.yaml'),
            'utf8'
        );

        // Convert names to Safe Name (preserve case but remove special chars) for CloudFormation resource names
        const safeFunctionName = toSafeName(functionName);
        const safeApiName = toSafeName(apiName);
        const camelFunctionName = toCamelCase(functionName);
        const environment = process.env.ENVIRONMENT;

        // Update Handler path FIRST (before BoilerPlate replacement)
        templateContent = templateContent.replace(
            /Handler: BoilerPlate\.hello/g,
            `Handler: ${functionName}/handler.${camelFunctionName}`
        );

        // Update EntryPoints path for esbuild
        templateContent = templateContent.replace(
            /- BoilerPlate\.ts/g,
            `- ${functionName}/handler.ts`
        );

        // Replace placeholders
        templateContent = templateContent.replace(/BoilerPlateApi/g, safeApiName);
        templateContent = templateContent.replace(/BoilerPlate/g, safeFunctionName);
        templateContent = templateContent.replace(/Timeout: 60/g, `Timeout: ${String(timeout)}`);

        // Update architecture
        templateContent = templateContent.replace(/x86_64/g, architecture);


        // Read all env vars from .env file
        // Use custom path from DOTENV_CONFIG_PATH if set (for testing), otherwise use default
        const envPath = process.env.DOTENV_CONFIG_PATH || path.join(process.cwd(), '.env');
        const envObject = {};

        if (fs.existsSync(envPath)) {
            const envContent = fs.readFileSync(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key, ...valueParts] = line.split('=');
                    if (key && key.trim() !== 'ENVIRONMENT') {
                        envObject[key.trim()] = valueParts.join('=').trim();
                    }
                }
            });
        }


        const allEnvVarNames = Object.keys(envObject);

        if (allEnvVarNames.length > 0) {
            // 1. Create Parameters section
            const parametersYaml = allEnvVarNames.map(varName => {
                const value = envObject[varName];
                return `  Env${varName}:\n    Type: String\n    Default: '${value}'`;
            }).join('\n');

            const parametersSection = `Parameters:\n${parametersYaml}\n`;

            // Insert Parameters section before Resources
            templateContent = templateContent.replace(
                /(Resources:\s*\n)/,
                `${parametersSection}\n$1`
            );

            // 2. Create SSM Parameter resources
            const parametersResources = allEnvVarNames.map(varName => {
                return `  Param${varName}:\n    Type: AWS::SSM::Parameter\n    Properties:\n      Name: !Sub '/sam-smith/${environment}/${projectName}/${varName}'\n      Type: String\n      Value: !Ref Env${varName}\n`;
            }).join('\n');

            // Insert SSM resources after Resources declaration
            templateContent = templateContent.replace(
                /(Resources:\s*\n)/,
                `$1${parametersResources}\n`
            );
        }

        // 3. Add environment variables to Lambda if any were selected
        if (envVars.length > 0) {
            const envVarsYaml = envVars.map(varName =>
                `          ${varName}: !Ref Env${varName}`
            ).join('\n');
            const environmentSection = `      Environment:\n        Variables:\n${envVarsYaml}\n`;

            // Insert environment variables after Architectures section
            const archRegex = new RegExp(`(Architectures:\\s*\\n\\s*-\\s*${architecture}\\s*\\n)`);
            templateContent = templateContent.replace(
                archRegex,
                `$1${environmentSection}`
            );
        }

        await fs.writeFile(path.join(projectPath, 'template.yaml'), String(templateContent));

        // Read and customize package.json
        const packageJson = await fs.readJson(path.join(templatePath, 'package.json'));

        // Add output printing to sam-smith:deploy script - show ALL API Gateway URLs
        const stackName = `sam-smith-${projectName}-${environment}`;
        // Command to get all Outputs whose key contains 'Url' - using text format for reliability
        const printUrlCmd = `aws cloudformation describe-stacks --stack-name ${stackName} --query "Stacks[0].Outputs[?contains(OutputKey, 'Url')].OutputValue" --output text | tr '\\t' '\\n'`;

        // Append the command to sam-smith:deploy
        if (packageJson.scripts && packageJson.scripts['sam-smith:deploy']) {
            packageJson.scripts['sam-smith:deploy'] += ` && echo "" && echo "API Gateway URLs:" && ${printUrlCmd}`;
        }

        await fs.writeJson(path.join(projectPath, 'package.json'), packageJson, { spaces: 4 });
        await fs.copyFile(
            path.join(templatePath, 'tsconfig.json'),
            path.join(projectPath, 'tsconfig.json')
        );
        await fs.copyFile(
            path.join(templatePath, 'jest.config.js'),
            path.join(projectPath, 'jest.config.js')
        );

        // Copy node_modules from root to project root
        if (!process.env.SKIP_NODE_MODULES) {
            const rootNodeModules = path.join(__dirname, '../node_modules');
            const projectNodeModules = path.join(projectPath, 'node_modules');
            if (await fs.pathExists(rootNodeModules)) {
                await fs.copy(rootNodeModules, projectNodeModules);
            }
        }

        // Copy update scripts
        await fs.ensureDir(path.join(projectPath, 'bin'));
        await fs.ensureDir(path.join(projectPath, 'lib'));

        await fs.copyFile(
            path.join(__dirname, '../bin/update.js'),
            path.join(projectPath, 'bin/update.js')
        );

        await fs.copyFile(
            path.join(__dirname, '../lib/update.js'),
            path.join(projectPath, 'lib/update.js')
        );

        // Copy BoilerPlateFunction directory to src/{functionName}/
        const boilerPlateFunctionDir = path.join(templatePath, 'src/BoilerPlateFunction');
        const handlerDir = path.join(projectPath, 'src', functionName);

        // Copy the entire BoilerPlateFunction directory
        await fs.copy(boilerPlateFunctionDir, handlerDir);

        // Copy utils folder to src/utils (at the same level as the function folder, NOT inside the function)
        const utilsSourceDir = path.join(templatePath, 'src/utils');
        const utilsDestDir = path.join(projectPath, 'src/utils');
        if (await fs.pathExists(utilsSourceDir)) {
            await fs.copy(utilsSourceDir, utilsDestDir);
        }

        // Read and update handler.ts
        let handlerContent = await fs.readFile(
            path.join(handlerDir, 'handler.ts'),
            'utf8'
        );

        // Replace the function name in the handler
        handlerContent = handlerContent.replace(/hello/g, camelFunctionName);
        // Replace the path in the decorator if exists
        handlerContent = handlerContent.replace(/\/hello/g, `/${camelFunctionName}`);
        // Replace the greet() parameter with the actual function name
        handlerContent = handlerContent.replace(/greet\("BoilerPlateFunction"\)/g, `greet("${camelFunctionName}")`);

        await fs.writeFile(
            path.join(handlerDir, 'handler.ts'),
            handlerContent
        );

        // Read and update handler.test.ts
        let testContent = await fs.readFile(
            path.join(handlerDir, 'handler.test.ts'),
            'utf8'
        );

        // Replace the function name in the test
        testContent = testContent.replace(/hello/g, camelFunctionName);

        await fs.writeFile(
            path.join(handlerDir, 'handler.test.ts'),
            testContent
        );

        // Note: authorizer directory is excluded from basic template
        // It will be used for basic-auth and cognito templates in the future


        // Generate samconfig.toml
        const samConfigContent = `version = 0.1
[default]
[default.deploy]
[default.deploy.parameters]
stack_name = "sam-smith-${projectName}-${environment}"
s3_prefix = "sam-smith-${projectName}-${environment}"
region = "${process.env.AWS_REGION || 'us-east-1'}"
confirm_changeset = true
capabilities = "CAPABILITY_IAM"
disable_rollback = false
image_repositories = []
resolve_s3 = true
`;

        await fs.writeFile(
            path.join(projectPath, 'samconfig.toml'),
            samConfigContent
        );

        console.log(chalk.green('✓ Project created successfully!\n'));

        // If template is basic-auth, automatically add basic auth to the API Gateway
        if (templateName === 'basic-auth') {
            console.log(chalk.blue('Adding basic authentication...'));
            try {
                await addBasicAuthProgrammatically(projectPath, safeApiName);
                console.log(chalk.green('✓ Basic auth added successfully!\n'));
            } catch (error) {
                console.error(chalk.red('✗ Error adding basic auth:'), error.message);
                console.log(chalk.yellow('You can add it manually later using: npm run sam-smith:update\n'));
            }
        }

        // If template is cognito-auth, automatically add cognito auth to the API Gateway
        if (templateName === 'cognito-auth') {
            console.log(chalk.blue('Adding Cognito authentication...'));
            try {
                // Ask for pool name
                const { poolName } = await inquirer.prompt([{
                    type: 'input',
                    name: 'poolName',
                    message: 'Enter name for Cognito User Pool:',
                    default: 'main',
                    validate: (value) => {
                        if (!value.length) {
                            return 'Please enter a valid name.';
                        }
                        return true;
                    },
                }]);

                await addCognitoAuthProgrammatically(projectPath, safeApiName, poolName);
                console.log(chalk.green('✓ Cognito auth added successfully!'));
                console.log(chalk.gray(`  - Created ${poolName}UserPool`));
                console.log(chalk.gray(`  - Created ${poolName}UserPoolClient`));
                console.log(chalk.gray(`  - Configured API Gateway with Cognito authorizer\n`));
            } catch (error) {
                console.error(chalk.red('✗ Error adding Cognito auth:'), error.message);
                console.log(chalk.yellow('You can add it manually later using: npm run sam-smith:update\n'));
            }
        }

        console.log(chalk.cyan('Next steps:'));
        console.log(chalk.gray(`  cd ${projectName}`));
        console.log(chalk.gray(`  sam build`));
        console.log(chalk.gray(`  sam deploy --guided\n`));

    } catch (err) {
        console.error(chalk.red('✗ Error creating project:'), err.message);
        process.exit(1);
    }
}

function toPascalCase(str) {
    return str
        .replace(/(?:^\w|[A-Z]|\b\w)/g, function (word) {
            return word.toUpperCase();
        })
        .replace(/\s+/g, '')
        .replace(/-/g, '')
        .replace(/_/g, '');
}

function toCamelCase(str) {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function toSafeName(str) {
    return str.replace(/[^a-zA-Z0-9]/g, '');
}
