
import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs-extra';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function updateProject() {
    console.log(chalk.blue.bold('SAM Smith Update Tool'));

    const questions = [
        {
            type: 'rawlist',
            name: 'actions',
            message: 'Select what you want to update:',
            choices: ['Environment Variables', 'Lambdas', 'API Gateways', 'Layers'],
        },
    ];

    const answers = await inquirer.prompt(questions);

    if (answers.actions && answers.actions.includes('Environment Variables')) {
        await checkEnvironmentVariables();
    }

    if (answers.actions && answers.actions.includes('Lambdas')) {
        await manageLambdas();
    }

    if (answers.actions && answers.actions.includes('API Gateways')) {
        await manageApiGateways();
    }

    if (answers.actions && answers.actions.includes('Layers')) {
        await manageLayers();
    }
}

async function manageApiGateways() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    const templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Build API Gateway structure: { apiName: { lambdaName: [{ eventName: { path, method } }] } }
    const apiGateways = {};

    // First, find all API Gateways
    let currentResource = null;
    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            currentResource = resMatch[1];
        }
        if (currentResource && lines[i].includes('Type: AWS::Serverless::Api')) {
            apiGateways[currentResource] = {};
        }
    }

    // Now find all Lambdas and their events referencing these API Gateways
    currentResource = null;
    let currentResourceStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            currentResource = resMatch[1];
            currentResourceStartLine = i;
        }

        if (currentResource && lines[i].includes('Type: AWS::Serverless::Function')) {
            // Find the end of this lambda block
            let lambdaEndLine = lines.length;
            for (let j = currentResourceStartLine + 1; j < lines.length; j++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[j])) {
                    lambdaEndLine = j;
                    break;
                }
            }

            // Parse Events section
            let inEvents = false;
            let currentEventName = null;
            let currentEventApiRef = null;
            let currentEventPath = null;
            let currentEventMethod = null;

            for (let j = currentResourceStartLine; j < lambdaEndLine; j++) {
                const line = lines[j];

                if (line.match(/^\s+Events:\s*$/)) {
                    inEvents = true;
                    continue;
                }

                if (inEvents) {
                    // Stop parsing events if we hit Metadata section
                    if (line.match(/^\s+Metadata:/)) {
                        break;
                    }

                    // Check for event name - must be exactly 8 spaces, and not a reserved keyword
                    const eventNameMatch = line.match(/^        ([a-zA-Z0-9]+):\s*$/);
                    if (eventNameMatch && !['Type', 'Properties'].includes(eventNameMatch[1])) {
                        // Save previous event if exists
                        if (currentEventName && currentEventApiRef && apiGateways[currentEventApiRef]) {
                            if (!apiGateways[currentEventApiRef][currentResource]) {
                                apiGateways[currentEventApiRef][currentResource] = [];
                            }
                            apiGateways[currentEventApiRef][currentResource].push({
                                [currentEventName]: {
                                    path: currentEventPath,
                                    method: currentEventMethod
                                }
                            });
                        }
                        currentEventName = eventNameMatch[1];
                        currentEventApiRef = null;
                        currentEventPath = null;
                        currentEventMethod = null;
                        continue;
                    }

                    const apiRefMatch = line.match(/RestApiId:\s*!Ref\s+(\w+)/);
                    if (apiRefMatch) {
                        currentEventApiRef = apiRefMatch[1];
                    }

                    const pathMatch = line.match(/Path:\s*(.+)/);
                    if (pathMatch) {
                        currentEventPath = pathMatch[1].trim();
                    }

                    // More specific match for Method (only lowercase http methods)
                    const methodMatch = line.match(/^\s+Method:\s*(get|post|put|delete|patch|options|head)/i);
                    if (methodMatch) {
                        currentEventMethod = methodMatch[1].trim();
                    }
                }
            }

            // Save last event
            if (currentEventName && currentEventApiRef && apiGateways[currentEventApiRef]) {
                if (!apiGateways[currentEventApiRef][currentResource]) {
                    apiGateways[currentEventApiRef][currentResource] = [];
                }
                apiGateways[currentEventApiRef][currentResource].push({
                    [currentEventName]: {
                        path: currentEventPath,
                        method: currentEventMethod
                    }
                });
            }
        }
    }

    const questions = [
        {
            type: 'rawlist',
            name: 'action',
            message: 'What do you want to do with API Gateways?',
            choices: [
                'update',
                'create',
                'delete'
            ],
        },
    ];

    const answers = await inquirer.prompt(questions);

    if (answers.action && answers.action.includes('update')) {
        await updateApiGateway(apiGateways);
    }
    if (answers.action && answers.action.includes('create')) {
        await createApiGateway(apiGateways);
    }
    if (answers.action && answers.action.includes('delete')) {
        await deleteApiGateway(apiGateways);
    }
}

async function deleteApiGateway(apiGateways) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    const gatewayNames = Object.keys(apiGateways);

    if (gatewayNames.length === 0) {
        console.log(chalk.yellow('No API Gateways found in template.yaml'));
        return;
    }

    // Build display list with endpoints
    console.log(chalk.blue('\nAPI Gateways:'));
    const gatewayChoices = [];

    for (const gatewayName of gatewayNames) {
        const gateway = apiGateways[gatewayName];
        const endpoints = [];

        for (const [lambdaName, events] of Object.entries(gateway)) {
            for (const event of events) {
                for (const [eventName, details] of Object.entries(event)) {
                    endpoints.push(`${details.method.toUpperCase()} ${details.path} → ${lambdaName}`);
                }
            }
        }

        console.log(chalk.cyan(`  ${gatewayName}:`));
        if (endpoints.length > 0) {
            endpoints.forEach(ep => console.log(chalk.gray(`    - ${ep}`)));
        } else {
            console.log(chalk.gray(`    (no endpoints)`));
        }

        gatewayChoices.push({
            name: `${gatewayName} (${endpoints.length} endpoint${endpoints.length !== 1 ? 's' : ''})`,
            value: gatewayName
        });
    }
    console.log('');

    // Ask which gateway to delete
    const { selectedGateway } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedGateway',
        message: 'Which API Gateway do you want to delete?',
        choices: gatewayChoices,
    }]);

    // Count endpoints that will be deleted
    const gateway = apiGateways[selectedGateway];
    let endpointCount = 0;
    for (const [lambdaName, events] of Object.entries(gateway)) {
        endpointCount += events.length;
    }

    // Confirm deletion
    const { confirmDelete } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmDelete',
        message: `Delete '${selectedGateway}' and its ${endpointCount} endpoint(s)?`,
        default: false,
    }]);

    if (!confirmDelete) {
        console.log(chalk.gray('Deletion cancelled.'));
        return;
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // 1. Delete all events that reference this API Gateway
    // We need to process lambdas that have events referencing this gateway
    for (const [lambdaName, events] of Object.entries(gateway)) {
        // Re-read lines after each modification
        lines = templateContent.split('\n');

        // Find lambda block
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

        if (lambdaStartLine === -1) continue;
        if (lambdaEndLine === -1) lambdaEndLine = lines.length;

        // Find events referencing this gateway and delete them
        let eventsLineIndex = -1;
        let totalEventsInLambda = 0;
        let eventsToDeleteCount = 0;
        const eventPositions = [];
        let currentEventStart = -1;
        let currentEventName = null;
        let currentEventApiRef = null;
        let inEventsSection = false;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
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
                    totalEventsInLambda++;
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
                        totalEventsInLambda++;
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

        // Filter events that reference this gateway and delete them (in reverse order)
        const eventsToRemove = eventPositions.filter(ep => ep.apiRef === selectedGateway);
        eventsToRemove.sort((a, b) => b.startLine - a.startLine);

        for (const eventPos of eventsToRemove) {
            lines.splice(eventPos.startLine, eventPos.endLine - eventPos.startLine);
            eventsToDeleteCount++;
        }

        // If all events were deleted, remove Events: line too
        const remainingEvents = totalEventsInLambda - eventsToRemove.length;
        if (remainingEvents === 0 && eventsLineIndex !== -1) {
            // Need to recalculate the adjusted line index
            let linesRemoved = 0;
            for (const eventPos of eventsToRemove) {
                linesRemoved += eventPos.endLine - eventPos.startLine;
            }

            // Find and remove Events: line - search the adjusted lambda block
            const adjustedLambdaEnd = lambdaEndLine - linesRemoved;
            for (let i = lambdaStartLine; i < adjustedLambdaEnd; i++) {
                if (lines[i] && lines[i].match(/^\s+Events:/)) {
                    lines.splice(i, 1);
                    console.log(chalk.gray(`    Removed empty Events section from ${lambdaName}`));
                    break;
                }
            }
        }

        templateContent = lines.join('\n');
    }

    // 2. Delete the API Gateway resource itself
    lines = templateContent.split('\n');
    let gatewayStartLine = -1;
    let gatewayEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        if (lines[i].match(/^Outputs:/)) {
            if (gatewayStartLine !== -1 && gatewayEndLine === -1) {
                gatewayEndLine = i;
            }
            break;
        }
        if (inResources) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                if (gatewayStartLine !== -1 && gatewayEndLine === -1) {
                    gatewayEndLine = i;
                    break;
                }
                if (resMatch[1] === selectedGateway) {
                    gatewayStartLine = i;
                }
            }
        }
    }

    if (gatewayStartLine !== -1) {
        if (gatewayEndLine === -1) gatewayEndLine = lines.length;
        lines.splice(gatewayStartLine, gatewayEndLine - gatewayStartLine);
    }

    // 3. Delete Outputs that reference this API Gateway
    let inOutputs = false;
    let outputsToDelete = [];
    let currentOutputName = null;
    let currentOutputStart = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            inOutputs = true;
            continue;
        }
        if (inOutputs) {
            const outputMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (outputMatch) {
                // Save previous output if it referenced the gateway
                if (currentOutputStart !== -1) {
                    outputsToDelete.push({ name: currentOutputName, start: currentOutputStart, end: i });
                    currentOutputStart = -1;
                }
                currentOutputName = outputMatch[1];
            }
            // Check if this output references the deleted gateway
            if (lines[i].includes(`\${${selectedGateway}}`) || lines[i].includes(`!Ref ${selectedGateway}`) || lines[i].includes(`!GetAtt ${selectedGateway}`)) {
                currentOutputStart = -1;
                // Find the start of this output
                for (let j = i; j >= 0; j--) {
                    if (lines[j].match(/^  [a-zA-Z0-9]+:/)) {
                        currentOutputStart = j;
                        break;
                    }
                }
            }
        }
    }
    // Save last output if it referenced the gateway
    if (currentOutputStart !== -1) {
        outputsToDelete.push({ name: currentOutputName, start: currentOutputStart, end: lines.length });
    }

    // Delete outputs in reverse order
    outputsToDelete.sort((a, b) => b.start - a.start);
    for (const output of outputsToDelete) {
        // Find the end of this output
        let outputEnd = lines.length;
        for (let i = output.start + 1; i < lines.length; i++) {
            if (lines[i].match(/^  [a-zA-Z0-9]+:/) || lines[i].match(/^[a-zA-Z]/)) {
                outputEnd = i;
                break;
            }
        }
        lines.splice(output.start, outputEnd - output.start);
        console.log(chalk.gray(`    Removed output '${output.name}'`));
    }

    // Check if Outputs section is now empty and remove it
    let outputsSectionStart = -1;
    let outputsSectionHasContent = false;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:\s*$/)) {
            outputsSectionStart = i;
            continue;
        }
        if (outputsSectionStart !== -1) {
            // Check if there's any content (lines starting with 2 spaces)
            if (lines[i].match(/^  [a-zA-Z0-9]+:/)) {
                outputsSectionHasContent = true;
                break;
            }
            // Stop if we hit another top-level section or end
            if (lines[i].match(/^[a-zA-Z]/) || i === lines.length - 1) {
                break;
            }
        }
    }

    if (outputsSectionStart !== -1 && !outputsSectionHasContent) {
        // Remove the empty Outputs: line
        lines.splice(outputsSectionStart, 1);
        console.log(chalk.gray(`    Removed empty Outputs section`));
    }

    // Clean up multiple blank lines
    templateContent = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green(`✓ API Gateway '${selectedGateway}' deleted successfully!`));
    console.log(chalk.gray(`  - Removed ${endpointCount} endpoint(s)`));
}

async function createApiGateway(existingApiGateways) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Get existing API Gateway names
    const existingNames = Object.keys(existingApiGateways);

    // Ask for API Gateway name
    const { gatewayName } = await inquirer.prompt([{
        type: 'input',
        name: 'gatewayName',
        message: 'What is the name of your API Gateway?',
        validate: (value) => {
            if (!value.length) {
                return 'Please enter a valid name.';
            }
            // Remove spaces and special chars for resource name
            const resourceName = value.replace(/[^a-zA-Z0-9]/g, '');
            if (existingNames.includes(resourceName)) {
                return `API Gateway '${resourceName}' already exists.`;
            }
            return true;
        },
    }]);

    // Clean the name for resource
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

    // Find where to insert (before Outputs or at end of Resources)
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
    Value: !Sub "https://\${${resourceName}}.execute-api.\${AWS::Region}.amazonaws.com/default"`;

    // Find where to insert in Outputs section
    let outputsLine = -1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(/^Outputs:/)) {
            outputsLine = i;
            break;
        }
    }

    if (outputsLine !== -1) {
        // Insert after Outputs: line
        lines.splice(outputsLine + 1, 0, outputYaml);
    } else {
        // Create Outputs section at the end
        lines.push('');
        lines.push('Outputs:');
        lines.push(outputYaml);
    }

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green(`✓ API Gateway '${resourceName}' created successfully!`));

    // Ask if want to add an endpoint
    const { addEndpoint } = await inquirer.prompt([{
        type: 'confirm',
        name: 'addEndpoint',
        message: 'Do you want to add an endpoint to this API Gateway?',
        default: true,
    }]);

    if (addEndpoint) {
        // Re-read template after changes
        templateContent = await fs.readFile(templatePath, 'utf8');
        const updatedLines = templateContent.split('\n');

        // Get all lambdas
        const allLambdas = [];
        let currentResource = null;
        let inResources = false;

        for (let i = 0; i < updatedLines.length; i++) {
            if (updatedLines[i].match(/^Resources:/)) {
                inResources = true;
                continue;
            }
            if (updatedLines[i].match(/^Outputs:/)) {
                break;
            }
            if (inResources) {
                const resMatch = updatedLines[i].match(/^  ([a-zA-Z0-9]+):/);
                if (resMatch) {
                    currentResource = resMatch[1];
                }
                if (currentResource && updatedLines[i].includes('Type: AWS::Serverless::Function')) {
                    allLambdas.push(currentResource);
                }
            }
        }

        if (allLambdas.length === 0) {
            console.log(chalk.yellow('No Lambda functions found to connect.'));
            return;
        }

        // Ask for method
        const { method } = await inquirer.prompt([{
            type: 'input',
            name: 'method',
            message: 'HTTP Method:',
            default: 'get',
            validate: (value) => {
                const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
                if (validMethods.includes(value.toLowerCase())) {
                    return true;
                }
                return 'Please enter a valid HTTP method';
            },
        }]);

        // Ask for path
        const { endpointPath } = await inquirer.prompt([{
            type: 'input',
            name: 'endpointPath',
            message: 'Path (e.g. /users):',
            validate: (value) => {
                if (value.startsWith('/')) {
                    return true;
                }
                return 'Path must start with /';
            },
        }]);

        // Ask for lambda
        const { selectedLambda } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'selectedLambda',
            message: 'Select the Lambda function:',
            choices: allLambdas,
        }]);

        // Validate that path + method doesn't already exist on ANY API Gateway
        const normalizedMethod = method.toLowerCase();

        // Scan all lambdas for existing events with this path + method
        let duplicateFound = false;
        let duplicateApiGateway = null;
        let inEvents = false;
        let currentEventApiRef = null;
        let currentEventPath = null;
        let currentEventMethod = null;

        for (let i = 0; i < updatedLines.length; i++) {
            const resMatch = updatedLines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                inEvents = false;
            }
            if (updatedLines[i].match(/^\s+Events:\s*$/)) {
                inEvents = true;
                continue;
            }
            if (inEvents && updatedLines[i].match(/^\s+Metadata:/)) {
                inEvents = false;
            }
            if (inEvents) {
                const apiRefMatch = updatedLines[i].match(/RestApiId:\s*!Ref\s+(\w+)/);
                if (apiRefMatch) {
                    currentEventApiRef = apiRefMatch[1];
                }
                const pathMatch = updatedLines[i].match(/Path:\s*(.+)/);
                if (pathMatch) {
                    currentEventPath = pathMatch[1].trim();
                }
                const methodMatch = updatedLines[i].match(/^\s+Method:\s*(get|post|put|delete|patch|options|head)/i);
                if (methodMatch) {
                    currentEventMethod = methodMatch[1].trim().toLowerCase();
                    // Check if path + method already exists
                    if (currentEventPath === endpointPath &&
                        currentEventMethod === normalizedMethod) {
                        duplicateFound = true;
                        duplicateApiGateway = currentEventApiRef;
                        break;
                    }
                }
            }
        }

        if (duplicateFound) {
            console.error(chalk.red(`✗ Error: An endpoint with ${normalizedMethod.toUpperCase()} ${endpointPath} already exists on ${duplicateApiGateway}.`));
            return;
        }

        // Find the lambda and add the event
        let lambdaStartLine = -1;
        let lambdaEndLine = -1;
        inResources = false;

        for (let i = 0; i < updatedLines.length; i++) {
            if (updatedLines[i].match(/^Resources:/)) {
                inResources = true;
                continue;
            }
            if (updatedLines[i].match(/^Outputs:/)) {
                if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                    lambdaEndLine = i;
                }
                break;
            }
            if (inResources) {
                const resMatch = updatedLines[i].match(/^  ([a-zA-Z0-9]+):/);
                if (resMatch) {
                    if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
                        lambdaEndLine = i;
                        break;
                    }
                    if (resMatch[1] === selectedLambda) {
                        lambdaStartLine = i;
                    }
                }
            }
        }

        if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
            lambdaEndLine = updatedLines.length;
        }

        // Find Events section and count existing events
        let eventsLine = -1;
        let metadataLine = -1;
        let existingEventCount = 0;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (updatedLines[i].match(/^\s+Events:\s*$/)) {
                eventsLine = i;
            }
            if (updatedLines[i].match(/^\s+Metadata:/)) {
                metadataLine = i;
                break;
            }
            const eventMatch = updatedLines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
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
            `            Method: ${normalizedMethod}`
        ];

        if (eventsLine !== -1) {
            updatedLines.splice(eventsLine + 1, 0, ...newEventBlock);
        } else if (metadataLine !== -1) {
            const eventsSection = [
                `      Events:`,
                ...newEventBlock
            ];
            updatedLines.splice(metadataLine, 0, ...eventsSection);
        }

        await fs.writeFile(templatePath, updatedLines.join('\n'));

        console.log(chalk.green(`✓ Endpoint created successfully!`));
        console.log(chalk.gray(`  ${normalizedMethod.toUpperCase()} ${endpointPath} → ${selectedLambda}`));
    }
}

async function updateApiGateway(apiGateways) {
    const gatewayNames = Object.keys(apiGateways);

    if (gatewayNames.length === 0) {
        console.log(chalk.yellow('No API Gateways found in template.yaml'));
        return;
    }

    // Select which API Gateway to edit
    const { selectedGateway } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedGateway',
        message: 'Which API Gateway do you want to edit?',
        choices: gatewayNames,
    }]);

    const gateway = apiGateways[selectedGateway];

    // Build list of endpoints: "METHOD path → lambda"
    const endpoints = [];
    for (const [lambdaName, events] of Object.entries(gateway)) {
        for (const event of events) {
            for (const [eventName, details] of Object.entries(event)) {
                endpoints.push({
                    display: `${details.method.toUpperCase()} ${details.path} → ${lambdaName}`,
                    lambdaName,
                    eventName,
                    path: details.path,
                    method: details.method
                });
            }
        }
    }

    // Show current endpoints
    console.log(chalk.blue(`\nEndpoints in ${selectedGateway}:`));
    endpoints.forEach((ep, index) => {
        console.log(chalk.cyan(`  ${index + 1}) ${ep.display}`));
    });
    console.log('');

    // Ask what to do
    const { endpointAction } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'endpointAction',
        message: 'What do you want to do?',
        choices: [
            'edit an endpoint',
            'create new endpoint',
            'delete an endpoint',
            'update auth'
        ],
    }]);

    if (endpointAction && endpointAction.includes('edit an endpoint')) {
        await editEndpoint(selectedGateway, endpoints, apiGateways);
    }
    if (endpointAction && endpointAction.includes('create new endpoint')) {
        await createEndpoint(selectedGateway, endpoints, apiGateways);
    }
    if (endpointAction && endpointAction.includes('delete an endpoint')) {
        await deleteEndpoints(selectedGateway, endpoints);
    }
    if (endpointAction && endpointAction.includes('update auth')) {
        await updateAuth(selectedGateway);
    }
}

async function deleteEndpoints(selectedGateway, endpoints) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    if (endpoints.length === 0) {
        console.log(chalk.yellow('No endpoints to delete.'));
        return;
    }

    const { selectedEndpoints } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'selectedEndpoints',
        message: 'Which endpoints do you want to delete?',
        choices: endpoints.map(ep => ep.display),
    }]);

    if (selectedEndpoints.length === 0) {
        console.log(chalk.yellow('No endpoints selected.'));
        return;
    }

    // Confirm deletion
    const { confirmDelete } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmDelete',
        message: `Delete ${selectedEndpoints.length} endpoint(s)?`,
        default: false,
    }]);

    if (!confirmDelete) {
        console.log(chalk.gray('Deletion cancelled.'));
        return;
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

    // Process each endpoint to delete (from last to first to avoid index shifting issues)
    const endpointsToDelete = endpoints.filter(ep => selectedEndpoints.includes(ep.display));

    // Group by lambda to handle multiple deletions from same lambda
    const deletesByLambda = {};
    for (const ep of endpointsToDelete) {
        if (!deletesByLambda[ep.lambdaName]) {
            deletesByLambda[ep.lambdaName] = [];
        }
        deletesByLambda[ep.lambdaName].push(ep);
    }

    let deletedCount = 0;

    for (const [lambdaName, eventsToDelete] of Object.entries(deletesByLambda)) {
        // Re-read lines after each lambda processing (content may have changed)
        lines = templateContent.split('\n');

        // Find lambda block
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

        // Find and count all events in this lambda
        let eventsLineIndex = -1;
        let totalEventsInLambda = 0;
        const eventPositions = []; // { eventName, startLine, endLine }
        let currentEventStart = -1;
        let currentEventName = null;
        let inEventsSection = false;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Events:\s*$/)) {
                eventsLineIndex = i;
                inEventsSection = true;
                continue;
            }
            if (inEventsSection && lines[i].match(/^\s+Metadata:/)) {
                // Save last event
                if (currentEventStart !== -1) {
                    eventPositions.push({ eventName: currentEventName, startLine: currentEventStart, endLine: i });
                }
                break;
            }
            if (inEventsSection) {
                const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
                if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
                    // Save previous event
                    if (currentEventStart !== -1) {
                        eventPositions.push({ eventName: currentEventName, startLine: currentEventStart, endLine: i });
                    }
                    currentEventName = eventMatch[1];
                    currentEventStart = i;
                    totalEventsInLambda++;
                }
            }
        }

        // Delete events from this lambda (process in reverse order)
        const eventsToDeleteNames = eventsToDelete.map(e => e.eventName);
        const eventsToRemove = eventPositions.filter(ep => eventsToDeleteNames.includes(ep.eventName));
        eventsToRemove.sort((a, b) => b.startLine - a.startLine); // Reverse order

        for (const eventPos of eventsToRemove) {
            lines.splice(eventPos.startLine, eventPos.endLine - eventPos.startLine);
            deletedCount++;
        }

        // Check if all events were deleted from this lambda
        const remainingEvents = totalEventsInLambda - eventsToRemove.length;
        if (remainingEvents === 0 && eventsLineIndex !== -1) {
            // Adjust eventsLineIndex based on deletions
            let adjustment = 0;
            for (const eventPos of eventsToRemove) {
                if (eventPos.startLine > eventsLineIndex) {
                    adjustment += eventPos.endLine - eventPos.startLine;
                }
            }
            const adjustedEventsLine = eventsLineIndex;
            if (lines[adjustedEventsLine] && lines[adjustedEventsLine].match(/^\s+Events:/)) {
                lines.splice(adjustedEventsLine, 1);
            }
        }

        templateContent = lines.join('\n');
    }

    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green(`✓ Deleted ${deletedCount} endpoint(s) successfully!`));
}

async function createEndpoint(selectedGateway, endpoints, apiGateways) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    // Get all lambdas
    const templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    const allLambdas = [];
    let currentResource = null;
    let inResources = false;

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
            if (currentResource && lines[i].includes('Type: AWS::Serverless::Function')) {
                allLambdas.push(currentResource);
            }
        }
    }

    if (allLambdas.length === 0) {
        console.log(chalk.yellow('No Lambda functions found to connect.'));
        return;
    }

    // Ask for method
    const { method } = await inquirer.prompt([{
        type: 'input',
        name: 'method',
        message: 'HTTP Method:',
        default: 'get',
        validate: (value) => {
            const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
            if (validMethods.includes(value.toLowerCase())) {
                return true;
            }
            return 'Please enter a valid HTTP method (get, post, put, delete, patch, options, head)';
        },
    }]);

    // Ask for path
    const { path: endpointPath } = await inquirer.prompt([{
        type: 'input',
        name: 'path',
        message: 'Path (e.g. /users):',
        validate: (value) => {
            if (value.startsWith('/')) {
                return true;
            }
            return 'Path must start with /';
        },
    }]);

    // Ask for lambda
    const { selectedLambda } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedLambda',
        message: 'Select the Lambda function:',
        choices: allLambdas,
    }]);

    // Normalize
    const normalizedMethod = method.toLowerCase();
    const normalizedPath = endpointPath;

    // Check if triplet already exists
    for (const ep of endpoints) {
        if (ep.path === normalizedPath &&
            ep.method.toLowerCase() === normalizedMethod &&
            ep.lambdaName === selectedLambda) {
            console.error(chalk.red(`✗ Error: An endpoint with ${normalizedMethod.toUpperCase()} ${normalizedPath} → ${selectedLambda} already exists.`));
            return;
        }
    }

    // Find the lambda and add the event
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;
    inResources = false;

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
                if (resMatch[1] === selectedLambda) {
                    lambdaStartLine = i;
                }
            }
        }
    }

    if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
        lambdaEndLine = lines.length;
    }

    // Find Events section and count existing events
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

    // Generate new event name
    const newEventName = `event${existingEventCount + 1}`;
    const newEventBlock = [
        `        ${newEventName}:`,
        `          Type: Api`,
        `          Properties:`,
        `            RestApiId: !Ref ${selectedGateway}`,
        `            Path: ${normalizedPath}`,
        `            Method: ${normalizedMethod}`
    ];

    if (eventsLine !== -1) {
        // Insert after existing Events: line
        lines.splice(eventsLine + 1, 0, ...newEventBlock);
    } else if (metadataLine !== -1) {
        // Create Events section before Metadata
        const eventsSection = [
            `      Events:`,
            ...newEventBlock
        ];
        lines.splice(metadataLine, 0, ...eventsSection);
    }

    await fs.writeFile(templatePath, lines.join('\n'));

    console.log(chalk.green(`✓ Endpoint created successfully!`));
    console.log(chalk.gray(`  ${normalizedMethod.toUpperCase()} ${normalizedPath} → ${selectedLambda}`));
}

async function editEndpoint(selectedGateway, endpoints, apiGateways) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');

    if (endpoints.length === 0) {
        console.log(chalk.yellow('No endpoints to edit.'));
        return;
    }

    // Select which endpoint to edit
    const { selectedEndpoint } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedEndpoint',
        message: 'Which endpoint do you want to edit?',
        choices: endpoints.map(ep => ep.display),
    }]);

    const endpoint = endpoints.find(ep => ep.display === selectedEndpoint);

    // Ask for new method
    const { newMethod } = await inquirer.prompt([{
        type: 'input',
        name: 'newMethod',
        message: `Method (${endpoint.method}):`,
        default: endpoint.method,
        validate: (value) => {
            const validMethods = ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'];
            if (validMethods.includes(value.toLowerCase())) {
                return true;
            }
            return 'Please enter a valid HTTP method (get, post, put, delete, patch, options, head)';
        },
    }]);

    // Ask for new path
    const { newPath } = await inquirer.prompt([{
        type: 'input',
        name: 'newPath',
        message: `Path (${endpoint.path}):`,
        default: endpoint.path,
        validate: (value) => {
            if (value.startsWith('/')) {
                return true;
            }
            return 'Path must start with /';
        },
    }]);

    // Ask if want to change lambda
    let newLambda = endpoint.lambdaName;
    const { changeLambda } = await inquirer.prompt([{
        type: 'confirm',
        name: 'changeLambda',
        message: 'Do you want to change the Lambda?',
        default: false,
    }]);

    if (changeLambda) {
        // Get all lambdas from apiGateways
        const allLambdas = new Set();
        for (const [gatewayName, lambdas] of Object.entries(apiGateways)) {
            for (const lambdaName of Object.keys(lambdas)) {
                allLambdas.add(lambdaName);
            }
        }

        // Also read template for all lambdas
        const templateContent = await fs.readFile(templatePath, 'utf8');
        const lines = templateContent.split('\n');
        let currentResource = null;
        for (let i = 0; i < lines.length; i++) {
            const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
            if (resMatch) {
                currentResource = resMatch[1];
            }
            if (currentResource && lines[i].includes('Type: AWS::Serverless::Function')) {
                allLambdas.add(currentResource);
            }
        }

        const { selectedLambda } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'selectedLambda',
            message: 'Select the new Lambda:',
            choices: Array.from(allLambdas),
        }]);
        newLambda = selectedLambda;
    }

    // Check if the triplet (path, method, lambda) already exists
    const normalizedNewMethod = newMethod.toLowerCase();
    const normalizedNewPath = newPath;

    // Check all endpoints for duplicates (excluding current one)
    for (const ep of endpoints) {
        if (ep === endpoint) continue; // Skip the one we're editing
        if (ep.path === normalizedNewPath &&
            ep.method.toLowerCase() === normalizedNewMethod &&
            ep.lambdaName === newLambda) {
            console.error(chalk.red(`✗ Error: An endpoint with ${normalizedNewMethod.toUpperCase()} ${normalizedNewPath} → ${newLambda} already exists.`));
            return;
        }
    }

    // Update the template.yaml
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Find the lambda that has the event we're editing
    let lambdaStartLine = -1;
    let lambdaEndLine = -1;
    let inResources = false;

    for (let i = 0; i < lines.length; i++) {
        // Track when we enter Resources section
        if (lines[i].match(/^Resources:/)) {
            inResources = true;
            continue;
        }
        // Stop if we hit Outputs section
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
                    // We found the next resource, so end the lambda block
                    lambdaEndLine = i;
                    break;
                }
                if (resMatch[1] === endpoint.lambdaName) {
                    lambdaStartLine = i;
                }
            }
        }
    }

    // If we didn't find end, use total lines or Outputs position
    if (lambdaStartLine !== -1 && lambdaEndLine === -1) {
        lambdaEndLine = lines.length;
    }

    // Find the event within the lambda
    let eventStartLine = -1;
    let eventEndLine = -1;
    let inEvents = false;

    console.log(chalk.gray(`  Searching for event '${endpoint.eventName}' in lambda '${endpoint.lambdaName}'`));
    console.log(chalk.gray(`  Lambda block: lines ${lambdaStartLine} to ${lambdaEndLine}`));

    for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
        const line = lines[i];
        if (line.match(/^\s+Events:\s*$/)) {
            inEvents = true;
            console.log(chalk.gray(`  Found Events section at line ${i}`));
            continue;
        }
        if (inEvents && line.match(/^\s+Metadata:/)) {
            if (eventStartLine !== -1 && eventEndLine === -1) {
                eventEndLine = i;
            }
            break;
        }
        if (inEvents) {
            // Match event name - exactly 8 spaces, exclude reserved keywords
            const eventNameMatch = line.match(/^        ([a-zA-Z0-9]+):\s*$/);
            if (eventNameMatch && !['Type', 'Properties'].includes(eventNameMatch[1])) {
                console.log(chalk.gray(`  Found event '${eventNameMatch[1]}' at line ${i}`));
                if (eventStartLine !== -1 && eventEndLine === -1) {
                    eventEndLine = i;
                }
                if (eventNameMatch[1] === endpoint.eventName) {
                    eventStartLine = i;
                    eventEndLine = -1;
                    console.log(chalk.green(`  ✓ Matched target event at line ${i}`));
                }
            }
        }
    }

    if (eventStartLine === -1) {
        console.error(chalk.red(`✗ Error: Could not find the event '${endpoint.eventName}' to edit.`));
        console.log(chalk.yellow(`  Looking for: '${endpoint.eventName}'`));
        return;
    }
    if (eventEndLine === -1) {
        // Find next section - look for next event at 8 spaces or Metadata
        for (let i = eventStartLine + 1; i < lambdaEndLine; i++) {
            if (lines[i].match(/^        [a-zA-Z0-9]+:\s*$/) || lines[i].match(/^\s+Metadata:/)) {
                eventEndLine = i;
                break;
            }
        }
        if (eventEndLine === -1) eventEndLine = lambdaEndLine;
    }

    // If lambda is changing, we need to remove from old and add to new
    if (newLambda !== endpoint.lambdaName) {
        // Check if this is the only event in the old lambda
        // Count events ONLY within the Events section (between Events: and Metadata:)
        let eventsInOldLambda = 0;
        let eventsLineIndex = -1;
        let inEventsSection = false;

        for (let i = lambdaStartLine; i < lambdaEndLine; i++) {
            if (lines[i].match(/^\s+Events:\s*$/)) {
                eventsLineIndex = i;
                inEventsSection = true;
                continue;
            }
            if (inEventsSection && lines[i].match(/^\s+Metadata:/)) {
                break; // Stop counting at Metadata
            }
            if (inEventsSection) {
                // Only count event names (exactly 8 spaces + name + colon)
                const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
                if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
                    eventsInOldLambda++;
                }
            }
        }

        console.log(chalk.gray(`  Events in old lambda: ${eventsInOldLambda}, Events line at: ${eventsLineIndex}`));

        // Remove the event from old lambda
        lines.splice(eventStartLine, eventEndLine - eventStartLine);

        // If this was the only event, also remove the Events: line
        if (eventsInOldLambda === 1 && eventsLineIndex !== -1) {
            // Adjust eventsLineIndex since we just removed lines
            const linesRemoved = eventEndLine - eventStartLine;
            const adjustedEventsLine = eventsLineIndex < eventStartLine ? eventsLineIndex : eventsLineIndex - linesRemoved;

            if (adjustedEventsLine >= 0 && lines[adjustedEventsLine] && lines[adjustedEventsLine].match(/^\s+Events:/)) {
                lines.splice(adjustedEventsLine, 1);
                console.log(chalk.gray(`  Removed empty Events section from old lambda`));
            }
        }

        // Find new lambda's Events section and add the event there
        let newLambdaStartLine = -1;
        let newLambdaEndLine = -1;
        let inResources = false;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^Resources:/)) {
                inResources = true;
                continue;
            }
            if (lines[i].match(/^Outputs:/)) {
                if (newLambdaStartLine !== -1 && newLambdaEndLine === -1) {
                    newLambdaEndLine = i;
                }
                break;
            }
            if (inResources) {
                const resMatch = lines[i].match(/^  ([a-zA-Z0-9]+):/);
                if (resMatch) {
                    if (newLambdaStartLine !== -1 && newLambdaEndLine === -1) {
                        newLambdaEndLine = i;
                        break;
                    }
                    if (resMatch[1] === newLambda) {
                        newLambdaStartLine = i;
                    }
                }
            }
        }

        if (newLambdaStartLine !== -1 && newLambdaEndLine === -1) {
            newLambdaEndLine = lines.length;
        }

        // Find Events section in new lambda and count existing events
        let eventsLine = -1;
        let metadataLine = -1;
        let existingEventCount = 0;

        for (let i = newLambdaStartLine; i < newLambdaEndLine; i++) {
            if (lines[i].match(/^\s+Events:\s*$/)) {
                eventsLine = i;
            }
            if (lines[i].match(/^\s+Metadata:/)) {
                metadataLine = i;
                break;
            }
            // Count events
            const eventMatch = lines[i].match(/^        ([a-zA-Z0-9]+):\s*$/);
            if (eventMatch && !['Type', 'Properties'].includes(eventMatch[1])) {
                existingEventCount++;
            }
        }

        // Generate new event name
        const newEventName = `event${existingEventCount + 1}`;
        const newEventBlock = [
            `        ${newEventName}:`,
            `          Type: Api`,
            `          Properties:`,
            `            RestApiId: !Ref ${selectedGateway}`,
            `            Path: ${normalizedNewPath}`,
            `            Method: ${normalizedNewMethod}`
        ];

        if (eventsLine !== -1) {
            // Insert after Events: line
            lines.splice(eventsLine + 1, 0, ...newEventBlock);
        } else if (metadataLine !== -1) {
            // Need to create Events section before Metadata
            const eventsSection = [
                `      Events:`,
                ...newEventBlock
            ];
            lines.splice(metadataLine, 0, ...eventsSection);
        }
    } else {
        // Just update the existing event in place
        for (let i = eventStartLine; i < eventEndLine; i++) {
            if (lines[i].match(/Path:/)) {
                lines[i] = lines[i].replace(/Path:\s*.+/, `Path: ${normalizedNewPath}`);
            }
            if (lines[i].match(/^\s+Method:\s*(get|post|put|delete|patch|options|head)/i)) {
                lines[i] = lines[i].replace(/Method:\s*.+/, `Method: ${normalizedNewMethod}`);
            }
        }
    }

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green(`✓ Endpoint updated successfully!`));
    console.log(chalk.gray(`  ${newMethod.toUpperCase()} ${newPath} → ${newLambda}`));
}

async function updateAuth(selectedGateway) {
    // Ask what auth operation to perform
    const { authAction } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'authAction',
        message: 'Select auth action:',
        choices: [
            'add auth',
            'remove auth',
            'change auth'
        ],
    }]);

    if (authAction && authAction.includes('add auth')) {
        await addAuth(selectedGateway);
    }
    if (authAction && authAction.includes('remove auth')) {
        await removeAuth(selectedGateway);
    }
    if (authAction && authAction.includes('change auth')) {
        console.log(chalk.yellow('TODO implement change auth'));
    }
}

async function addAuth(selectedGateway) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const srcPath = path.join(cwd, 'src');

    // First, check if the API Gateway already has auth configured
    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

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
                if (resMatch[1] === selectedGateway) {
                    apiStartLine = i;
                }
            }
        }
    }

    if (apiStartLine === -1) {
        console.error(chalk.red(`  ✗ Error: API Gateway ${selectedGateway} not found`));
        return;
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

    if (hasAuth) {
        console.error(chalk.red(`✗ Error: ${selectedGateway} already has auth configured.`));
        return;
    }

    // Ask which auth type
    const { authType } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'authType',
        message: 'Select auth type:',
        choices: ['basic auth', 'cognito auth'],
    }]);

    if (authType === 'cognito auth') {
        console.log(chalk.yellow('TODO implement cognito auth'));
        return;
    }

    // Implement basic auth
    console.log(chalk.blue('Adding basic auth...'));

    // 1. Copy authorizer code to src
    const authorizerSourcePath = path.join(__dirname, '../../templates/src/authorizer');
    const authorizerDestPath = path.join(srcPath, 'authorizer');

    if (await fs.pathExists(authorizerDestPath)) {
        console.log(chalk.yellow('  Authorizer directory already exists, skipping copy.'));
    } else {
        await fs.copy(authorizerSourcePath, authorizerDestPath);
        console.log(chalk.green('  ✓ Copied authorizer code to src/authorizer'));
    }

    // 2. Update template.yaml
    templateContent = await fs.readFile(templatePath, 'utf8');
    lines = templateContent.split('\n');

    // Check if BasicAuthorizerFunction already exists
    const hasAuthorizer = lines.some(line => line.includes('BasicAuthorizerFunction:'));
    if (hasAuthorizer) {
        console.log(chalk.yellow('  BasicAuthorizerFunction already exists in template.'));
    } else {
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

        console.log(chalk.green('  ✓ Added BasicAuthorizerFunction to template'));
    }

    // 3. Add Auth section to the selected API Gateway
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Re-find the API Gateway resource (template has been modified)
    apiStartLine = -1;
    apiEndLine = -1;
    inResources = false;

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
                if (resMatch[1] === selectedGateway) {
                    apiStartLine = i;
                }
            }
        }
    }

    if (apiEndLine === -1) apiEndLine = lines.length;

    // Find where to insert Auth (after StageName and before Cors)
    let insertLine = -1;
    for (let i = apiStartLine; i < apiEndLine; i++) {
        if (lines[i].match(/^\s+StageName:/)) {
            insertLine = i + 1;
            break;
        }
    }

    if (insertLine === -1) {
        console.error(chalk.red('  ✗ Error: Could not find StageName in API Gateway'));
        return;
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
    console.log(chalk.green(`  ✓ Added Auth section to ${selectedGateway}`));

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green('✓ Basic auth added successfully!'));
}

async function removeAuth(selectedGateway) {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const srcPath = path.join(cwd, 'src');

    let templateContent = await fs.readFile(templatePath, 'utf8');
    let lines = templateContent.split('\n');

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
                if (resMatch[1] === selectedGateway) {
                    apiStartLine = i;
                }
            }
        }
    }

    if (apiStartLine === -1) {
        console.error(chalk.red(`✗ Error: API Gateway ${selectedGateway} not found`));
        return;
    }

    if (apiEndLine === -1) apiEndLine = lines.length;

    // Check if Auth exists
    let authStartLine = -1;
    let authEndLine = -1;
    for (let i = apiStartLine; i < apiEndLine; i++) {
        if (lines[i].match(/^\s+Auth:/)) {
            authStartLine = i;
            // Find end of Auth block (next property at same or lower indentation)
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

    if (authStartLine === -1) {
        console.error(chalk.red(`✗ Error: ${selectedGateway} does not have auth configured.`));
        return;
    }

    console.log(chalk.blue('Removing auth...'));

    // Step 1: Remove Auth section from API Gateway
    lines.splice(authStartLine, authEndLine - authStartLine);
    console.log(chalk.green(`  ✓ Removed Auth section from ${selectedGateway}`));

    // Update template content
    templateContent = lines.join('\n');
    lines = templateContent.split('\n');

    // Step 2: Check if BasicAuthorizerFunction is referenced in other API Gateways
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
            if (currentResource && currentResource !== selectedGateway && lines[i].includes('Type: AWS::Serverless::Api')) {
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
                    console.log(chalk.gray(`  BasicAuthorizerFunction is still referenced in ${gateway}`));
                    break;
                }
            }
        }

        if (isReferencedElsewhere) break;
    }

    // Step 3: If not referenced elsewhere, remove BasicAuthorizerFunction and LogGroup
    if (!isReferencedElsewhere) {
        // Find and remove BasicAuthorizerFunction
        let authorizerStartLine = -1;
        let authorizerEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^  BasicAuthorizerFunction:/)) {
                authorizerStartLine = i;
                // Find next resource or Outputs
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
            console.log(chalk.green('  ✓ Removed BasicAuthorizerFunction'));
        }

        // Update template content
        templateContent = lines.join('\n');
        lines = templateContent.split('\n');

        // Find and remove BasicAuthorizerFunctionLogGroup
        let logGroupStartLine = -1;
        let logGroupEndLine = -1;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].match(/^  BasicAuthorizerFunctionLogGroup:/)) {
                logGroupStartLine = i;
                // Find next resource or Outputs
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
            console.log(chalk.green('  ✓ Removed BasicAuthorizerFunctionLogGroup'));
        }

        // Delete authorizer source folder
        const authorizerPath = path.join(srcPath, 'authorizer');
        if (await fs.pathExists(authorizerPath)) {
            await fs.remove(authorizerPath);
            console.log(chalk.green('  ✓ Removed src/authorizer'));
        }
    }

    // Clean up multiple blank lines and write
    templateContent = lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
    await fs.writeFile(templatePath, templateContent);

    console.log(chalk.green('✓ Auth removed successfully!'));
}


async function manageLambdas() {
    const questions = [
        {
            type: 'rawlist',
            name: 'action',
            message: 'What do you want to do with Lambdas?',
            choices: [
                'update lambda',
                'create lambda',
                'delete lambda'
            ],
        },
    ];

    const answers = await inquirer.prompt(questions);

    if (answers.action && answers.action.includes('update lambda')) {
        await updateLambda();
    }
    if (answers.action && answers.action.includes('create lambda')) {
        await createLambda();
    }
    if (answers.action && answers.action.includes('delete lambda')) {
        await deleteLambda();
    }
}

async function deleteLambda() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const srcPath = path.join(cwd, 'src');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Find all Lambda functions in the template with their API Gateway references
    const lambdas = [];
    let currentResource = null;
    let currentResourceStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const resMatch = line.match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            currentResource = resMatch[1];
            currentResourceStartLine = i;
        }
        if (currentResource && line.includes('Type: AWS::Serverless::Function')) {
            // Find API Gateway reference for this lambda
            let apiPath = null;
            let apiMethod = null;
            let apiGateway = null;

            // Search within this lambda block for Events
            for (let j = currentResourceStartLine; j < lines.length; j++) {
                // Stop if we hit next resource
                if (j > currentResourceStartLine && /^  [a-zA-Z0-9]+:/.test(lines[j])) {
                    break;
                }
                const pathMatch = lines[j].match(/Path:\s*(.+)/);
                if (pathMatch) {
                    apiPath = pathMatch[1].trim();
                }
                const methodMatch = lines[j].match(/Method:\s*(.+)/);
                if (methodMatch) {
                    apiMethod = methodMatch[1].trim().toUpperCase();
                }
                const apiMatch = lines[j].match(/RestApiId:\s*!Ref\s+(\w+)/);
                if (apiMatch) {
                    apiGateway = apiMatch[1];
                }
            }

            lambdas.push({
                name: currentResource,
                startLine: currentResourceStartLine,
                apiPath,
                apiMethod,
                apiGateway
            });
        }
    }

    if (lambdas.length === 0) {
        console.log(chalk.yellow('No Lambda functions found in template.yaml'));
        return;
    }

    if (lambdas.length === 1) {
        console.log(chalk.yellow('Cannot delete the only Lambda function in the project.'));
        return;
    }

    // Show lambdas with their API Gateway info
    console.log(chalk.blue('\nExisting Lambda functions:'));
    lambdas.forEach((l, index) => {
        const apiInfo = l.apiPath ? `${l.apiMethod} ${l.apiPath} → ${l.apiGateway}` : 'No API Gateway';
        console.log(chalk.cyan(`  ${index + 1}) ${l.name}`));
        console.log(chalk.gray(`     API: ${apiInfo}`));
    });
    console.log('');

    // Select which lambda to delete
    const { selectedLambda } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedLambda',
        message: 'Which Lambda do you want to delete?',
        choices: lambdas.map(l => l.name),
    }]);

    // Confirm deletion
    const lambdaToDelete = lambdas.find(l => l.name === selectedLambda);
    const apiInfo = lambdaToDelete.apiPath ? `${lambdaToDelete.apiMethod} ${lambdaToDelete.apiPath}` : 'No API';

    const { confirmDelete } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmDelete',
        message: `Delete '${selectedLambda}' (${apiInfo})? This will remove the Lambda, LogGroup, and src folder.`,
        default: false,
    }]);

    if (!confirmDelete) {
        console.log(chalk.gray('Deletion cancelled.'));
        return;
    }

    // Find lambda block boundaries and folder name
    const lambdaInfo = lambdas.find(l => l.name === selectedLambda);
    let lambdaEndLine = lines.length;
    let lambdaFolderName = null;

    for (let i = lambdaInfo.startLine + 1; i < lines.length; i++) {
        if (/^  [a-zA-Z0-9]+:/.test(lines[i])) {
            lambdaEndLine = i;
            break;
        }
        const handlerMatch = lines[i].match(/Handler:\s*(\w+)\/handler\./);
        if (handlerMatch) {
            lambdaFolderName = handlerMatch[1];
        }
    }

    // Remove lambda from template
    lines.splice(lambdaInfo.startLine, lambdaEndLine - lambdaInfo.startLine);

    // Find and remove associated LogGroup
    let logGroupStart = -1;
    let logGroupEnd = -1;

    for (let i = 0; i < lines.length; i++) {
        if (lines[i].match(new RegExp(`^  ${selectedLambda}LogGroup:`)) ||
            lines[i].match(new RegExp(`^  ${selectedLambda.replace('Function', '')}FunctionLogGroup:`))) {
            logGroupStart = i;
        }
        if (logGroupStart !== -1 && logGroupEnd === -1 && i > logGroupStart) {
            if (/^  [a-zA-Z0-9]+:/.test(lines[i]) || /^[a-zA-Z]/.test(lines[i])) {
                logGroupEnd = i;
                break;
            }
        }
    }

    if (logGroupStart !== -1) {
        if (logGroupEnd === -1) logGroupEnd = lines.length;
        lines.splice(logGroupStart, logGroupEnd - logGroupStart);
    }

    // Clean up multiple blank lines
    templateContent = lines.join('\n').replace(/\n{3,}/g, '\n\n');
    await fs.writeFile(templatePath, templateContent);

    // Delete the source folder
    if (lambdaFolderName) {
        const lambdaFolderPath = path.join(srcPath, lambdaFolderName);
        if (fs.existsSync(lambdaFolderPath)) {
            await fs.remove(lambdaFolderPath);
            console.log(chalk.green(`✓ Deleted src/${lambdaFolderName}/`));
        }
    }

    console.log(chalk.green(`✓ Lambda '${selectedLambda}' deleted successfully!`));
    console.log(chalk.gray(`  - Removed from template.yaml`));
    console.log(chalk.gray(`  - Removed LogGroup`));
    if (lambdaInfo.apiPath) {
        console.log(chalk.gray(`  - API endpoint ${lambdaInfo.apiPath} no longer available`));
    }
}

async function createLambda() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const envPath = path.join(cwd, './.env');
    const srcPath = path.join(cwd, 'src');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    // Get existing lambda names to check for duplicates
    const existingLambdas = [];
    for (let i = 0; i < lines.length; i++) {
        const handlerMatch = lines[i].match(/Handler:\s*(\w+)\/handler\./);
        if (handlerMatch) {
            existingLambdas.push(handlerMatch[1]);
        }
    }

    // Ask for lambda name
    const { lambdaName } = await inquirer.prompt([{
        type: 'input',
        name: 'lambdaName',
        message: 'What is the name of your Lambda function?',
        validate: (value) => {
            if (!value.length) {
                return 'Please enter a valid function name.';
            }
            if (existingLambdas.includes(value)) {
                return `Lambda '${value}' already exists. Please choose a different name.`;
            }
            return true;
        },
    }]);

    // Ask for timeout
    const { timeout } = await inquirer.prompt([{
        type: 'input',
        name: 'timeout',
        message: 'What is the timeout in seconds?',
        default: '60',
        validate: (value) => {
            const valid = !isNaN(parseFloat(value)) && parseFloat(value) > 0;
            return valid || 'Please enter a valid number greater than 0';
        },
    }]);

    // Ask about environment variables
    let selectedEnvVars = [];
    const availableEnvVars = [];

    if (fs.existsSync(envPath)) {
        const envContent = await fs.readFile(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            line = line.trim();
            if (line && !line.startsWith('#')) {
                const [key] = line.split('=');
                if (key && key.trim() !== 'ENVIRONMENT') {
                    availableEnvVars.push(key.trim());
                }
            }
        });
    }

    if (availableEnvVars.length > 0) {
        const { needsEnvVars } = await inquirer.prompt([{
            type: 'confirm',
            name: 'needsEnvVars',
            message: 'Does this Lambda need environment variables?',
            default: false,
        }]);

        if (needsEnvVars) {
            const { selectedVars } = await inquirer.prompt([{
                type: 'checkbox',
                name: 'selectedVars',
                message: 'Select environment variables to include:',
                choices: availableEnvVars,
            }]);
            selectedEnvVars = selectedVars;
        }
    }
    // Find the architecture from existing lambda
    let architecture = 'arm64';
    for (let i = 0; i < lines.length; i++) {
        const archMatch = lines[i].match(/^\s+- (arm64|x86_64)$/);
        if (archMatch) {
            architecture = archMatch[1];
            break;
        }
    }

    // Build the new Lambda function YAML
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

    // Add environment variables if selected
    if (selectedEnvVars.length > 0) {
        lambdaYaml += `
      Environment:
        Variables:`;
        selectedEnvVars.forEach(v => {
            lambdaYaml += `
          ${v}: !Ref Env${v}`;
        });
    }

    // No Events - new lambdas are not connected to API Gateway by default
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

    // Find where to insert (before Outputs)
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

    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);

    // Create the src folder for the new lambda
    const lambdaFolderPath = path.join(srcPath, lambdaName);
    await fs.ensureDir(lambdaFolderPath);

    // Create handler.ts
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

    // Create handler.test.ts
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

    console.log(chalk.green(`✓ Lambda '${lambdaName}' created successfully!`));
    console.log(chalk.gray(`  - Added to template.yaml`));
    console.log(chalk.gray(`  - Created src/${lambdaName}/handler.ts`));
    console.log(chalk.gray(`  - Created src/${lambdaName}/handler.test.ts`));
}

async function updateLambda() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const envPath = path.join(cwd, './.env');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    let templateContent = await fs.readFile(templatePath, 'utf8');

    // Find all Lambda functions in the template
    const lambdas = [];
    let lines = templateContent.split('\n');
    let currentResource = null;
    let currentResourceStartLine = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Check for resource start (2 spaces indent)
        const resMatch = line.match(/^  ([a-zA-Z0-9]+):/);
        if (resMatch) {
            currentResource = resMatch[1];
            currentResourceStartLine = i;
        }
        // Check if it's a Lambda function
        if (currentResource && line.includes('Type: AWS::Serverless::Function')) {
            lambdas.push({ name: currentResource, startLine: currentResourceStartLine });
        }
    }

    if (lambdas.length === 0) {
        console.log(chalk.yellow('No Lambda functions found in template.yaml'));
        return;
    }

    // Select which lambda to update
    const { selectedLambda } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedLambda',
        message: 'Which Lambda do you want to update?',
        choices: lambdas.map(l => l.name),
    }]);

    // Find current timeout for the selected lambda
    const lambdaInfo = lambdas.find(l => l.name === selectedLambda);
    let currentTimeout = '60'; // default
    let timeoutLineIndex = -1;

    // Find the timeout in the lambda block
    for (let i = lambdaInfo.startLine; i < lines.length; i++) {
        const line = lines[i];
        // Stop if we hit another resource at the same indentation level
        if (i > lambdaInfo.startLine && /^  [a-zA-Z0-9]+:/.test(line)) {
            break;
        }
        const timeoutMatch = line.match(/^\s+Timeout:\s*(\d+)/);
        if (timeoutMatch) {
            currentTimeout = timeoutMatch[1];
            timeoutLineIndex = i;
            break;
        }
    }

    // Ask for new timeout
    const { newTimeout } = await inquirer.prompt([{
        type: 'input',
        name: 'newTimeout',
        message: `Timeout (current: ${currentTimeout}):`,
        default: currentTimeout,
        validate: (value) => {
            const valid = !isNaN(parseFloat(value)) && parseFloat(value) > 0;
            return valid || 'Please enter a valid number greater than 0';
        },
    }]);

    // Update timeout in template if changed
    if (newTimeout !== currentTimeout && timeoutLineIndex !== -1) {
        lines[timeoutLineIndex] = lines[timeoutLineIndex].replace(/Timeout:\s*\d+/, `Timeout: ${newTimeout}`);
        templateContent = lines.join('\n');
    }

    // Ask about environment variables
    const { wantsEnvVars } = await inquirer.prompt([{
        type: 'confirm',
        name: 'wantsEnvVars',
        message: 'Do you want to change environment variables?',
        default: false,
    }]);

    if (wantsEnvVars) {
        // Read available env vars from .env file
        const availableEnvVars = [];
        if (fs.existsSync(envPath)) {
            const envContent = await fs.readFile(envPath, 'utf8');
            envContent.split('\n').forEach(line => {
                line = line.trim();
                if (line && !line.startsWith('#')) {
                    const [key] = line.split('=');
                    if (key && key.trim() !== 'ENVIRONMENT') {
                        availableEnvVars.push(key.trim());
                    }
                }
            });
        }

        if (availableEnvVars.length === 0) {
            console.log(chalk.yellow('No environment variables found in .env file'));
        } else {
            // Find currently used env vars for this lambda
            const currentEnvVars = [];
            let inEnvironment = false;
            let inVariables = false;

            for (let i = lambdaInfo.startLine; i < lines.length; i++) {
                const line = lines[i];
                // Stop if we hit another resource
                if (i > lambdaInfo.startLine && /^  [a-zA-Z0-9]+:/.test(line)) {
                    break;
                }
                if (line.includes('Environment:')) {
                    inEnvironment = true;
                }
                if (inEnvironment && line.includes('Variables:')) {
                    inVariables = true;
                    continue;
                }
                if (inVariables) {
                    // Check for env var reference: VAR_NAME: !Ref EnvVAR_NAME
                    const varMatch = line.match(/^\s+([A-Z0-9_]+):\s*!Ref\s+Env([A-Z0-9_]+)/);
                    if (varMatch) {
                        currentEnvVars.push(varMatch[1]);
                    }
                    // Stop if indentation decreases
                    if (line.match(/^\s{6}\S/) && !line.match(/^\s{10}/)) {
                        break;
                    }
                }
            }

            const choices = availableEnvVars.map(v => ({
                name: v,
                checked: currentEnvVars.includes(v),
            }));

            const { selectedVars } = await inquirer.prompt([{
                type: 'checkbox',
                name: 'selectedVars',
                message: 'Select environment variables to include:',
                choices: choices,
            }]);

            // Update the template with new environment variables
            // First, remove existing Environment block from the lambda
            let lambdaEndLine = lines.length;
            for (let i = lambdaInfo.startLine + 1; i < lines.length; i++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[i])) {
                    lambdaEndLine = i;
                    break;
                }
            }

            // Find and remove Environment block
            let envStartLine = -1;
            let envEndLine = -1;
            for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
                if (lines[i].match(/^\s+Environment:\s*$/)) {
                    envStartLine = i;
                }
                if (envStartLine !== -1 && envEndLine === -1) {
                    // Find where Environment block ends (next property at same or lower indentation)
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

            // Add new Environment block if vars selected
            if (selectedVars.length > 0) {
                // Find where to insert (after Architectures and before Events/Metadata)
                let insertLine = -1;

                // First, try to find Architectures and insert right after its array item
                for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
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
                    for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
                        if (lines[i].match(/^\s+Metadata:/) || lines[i].match(/^\s+Events:/)) {
                            insertLine = i;
                            break;
                        }
                    }
                }

                // If still not found, insert at end of lambda properties (before lambda end)
                if (insertLine === -1) {
                    insertLine = lambdaEndLine;
                }

                const envBlock = ['      Environment:', '        Variables:'];
                selectedVars.forEach(v => {
                    envBlock.push(`          ${v}: !Ref Env${v}`);
                });

                lines.splice(insertLine, 0, ...envBlock);
            }

            templateContent = lines.join('\n');
        }
    }

    // Ensure templateContent is updated from lines (in case timeout changed but env vars didn't)
    templateContent = lines.join('\n');

    // Ask about layers
    const { wantsLayers } = await inquirer.prompt([{
        type: 'confirm',
        name: 'wantsLayers',
        message: 'Do you want to edit layers?',
        default: false,
    }]);

    if (wantsLayers) {
        // Re-read lines after environment changes
        lines = templateContent.split('\n');

        const { layerAction } = await inquirer.prompt([{
            type: 'rawlist',
            name: 'layerAction',
            message: 'What do you want to do with layers?',
            choices: [
                'add layer',
                'remove layer'
            ],
        }]);

        if (layerAction === 'add layer') {
            // Find all layers in template
            const allLayers = [];
            let inResources = false;

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
                        const resourceName = resMatch[1];
                        // Check if it's a layer
                        for (let j = i + 1; j < lines.length; j++) {
                            if (lines[j].match(/^  [a-zA-Z0-9]+:/)) {
                                break;
                            }
                            if (lines[j].includes('AWS::Serverless::LayerVersion')) {
                                allLayers.push(resourceName);
                                break;
                            }
                        }
                    }
                }
            }

            if (allLayers.length === 0) {
                console.log(chalk.yellow('No layers available to add'));
            } else {
                // Find current layers in the selected lambda
                let lambdaEndLine = lines.length;
                for (let i = lambdaInfo.startLine + 1; i < lines.length; i++) {
                    if (/^  [a-zA-Z0-9]+:/.test(lines[i])) {
                        lambdaEndLine = i;
                        break;
                    }
                }

                const currentLayers = [];
                let inLayers = false;

                for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
                    if (lines[i].match(/^\s+Layers:/)) {
                        inLayers = true;
                        continue;
                    }
                    if (inLayers) {
                        if (lines[i].match(/^\s{6}\S/) && !lines[i].match(/^\s{8}/)) {
                            break;
                        }
                        const layerMatch = lines[i].match(/- !Ref\s+(\w+)/);
                        if (layerMatch) {
                            currentLayers.push(layerMatch[1]);
                        }
                    }
                }

                // Filter out layers already in the lambda
                const availableLayers = allLayers.filter(layer => !currentLayers.includes(layer));

                if (availableLayers.length === 0) {
                    console.log(chalk.yellow('All layers are already added to this lambda'));
                } else {
                    // Ask which layer to add
                    const { selectedLayer } = await inquirer.prompt([{
                        type: 'rawlist',
                        name: 'selectedLayer',
                        message: 'Which layer do you want to add?',
                        choices: availableLayers,
                    }]);

                    // Find where to add the layer
                    let layersLineIndex = -1;
                    let insertLine = -1;

                    for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
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
                        // Find where to insert (after Environment or Architectures, before Events/Metadata)
                        let insertPosition = -1;

                        for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
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
                            for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
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
                            `        - !Ref ${selectedLayer}`
                        ];

                        lines.splice(insertPosition, 0, ...layersBlock);
                    } else {
                        // Add to existing Layers section
                        lines.splice(insertLine, 0, `        - !Ref ${selectedLayer}`);
                    }

                    templateContent = lines.join('\n');
                    console.log(chalk.green(`✓ Added layer '${selectedLayer}' to ${selectedLambda}`));
                }
            }
        } else if (layerAction === 'remove layer') {
            // Find current layers in the selected lambda
            let lambdaEndLine = lines.length;
            for (let i = lambdaInfo.startLine + 1; i < lines.length; i++) {
                if (/^  [a-zA-Z0-9]+:/.test(lines[i])) {
                    lambdaEndLine = i;
                    break;
                }
            }

            const currentLayers = [];
            let layersStartLine = -1;
            let inLayers = false;

            for (let i = lambdaInfo.startLine; i < lambdaEndLine; i++) {
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

            if (currentLayers.length === 0) {
                console.log(chalk.yellow('This lambda has no layers to remove'));
            } else {
                // Ask which layer to remove
                const { selectedLayer } = await inquirer.prompt([{
                    type: 'rawlist',
                    name: 'selectedLayer',
                    message: 'Which layer do you want to remove?',
                    choices: currentLayers.map(l => l.name),
                }]);

                // Find and remove the layer line
                const layerToRemove = currentLayers.find(l => l.name === selectedLayer);
                if (layerToRemove) {
                    lines.splice(layerToRemove.line, 1);

                    // If this was the last layer, remove the Layers: line too
                    if (currentLayers.length === 1) {
                        // Recalculate layersStartLine after the splice
                        layersStartLine = layerToRemove.line > layersStartLine ? layersStartLine : layersStartLine - 1;
                        lines.splice(layersStartLine, 1);
                        console.log(chalk.green(`✓ Removed layer '${selectedLayer}' and Layers section from ${selectedLambda}`));
                    } else {
                        console.log(chalk.green(`✓ Removed layer '${selectedLayer}' from ${selectedLambda}`));
                    }

                    templateContent = lines.join('\n');
                }
            }
        }
    }

    // Write updated template
    await fs.writeFile(templatePath, templateContent);
    console.log(chalk.green('✓ Lambda updated successfully!'));
}

async function checkEnvironmentVariables() {
    const cwd = process.cwd();
    const envPath = path.join(cwd, './.env');
    const templatePath = path.join(cwd, 'template.yaml');

    if (!fs.existsSync(envPath)) {
        console.error(chalk.red('✗ Error: .env file not found.'));
        return;
    }

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    // 1. Read template.yaml and extract Parameters
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const templateVars = {};

    // Regex to find Parameters. 
    // Looking for "Env<Name>:\n    Type: String\n    Default: '<Value>'"
    const paramRegex = /Env([a-zA-Z0-9_]+):\s*\n\s*Type:\s*String\s*\n\s*Default:\s*'([^']*)'/g;

    let match;
    while ((match = paramRegex.exec(templateContent)) !== null) {
        const varName = match[1];
        const defaultValue = match[2];
        templateVars[varName] = { value: defaultValue, usedIn: [] };
    }

    // 1.5. Scan for function usages in Resources
    const resourcesIndex = templateContent.indexOf('Resources:');
    if (resourcesIndex !== -1) {
        const resourcesLines = templateContent.slice(resourcesIndex).split('\n');
        let currentResource = null;
        let isFunction = false;

        for (const line of resourcesLines) {
            // Check for new resource start: 2 spaces indent, then name, then colon (and maybe space comment)
            const resMatch = line.match(/^ {2}([a-zA-Z0-9]+):/);
            if (resMatch) {
                currentResource = resMatch[1];
                isFunction = false; // reset
                continue;
            }

            // Check if current resource is a Function
            if (currentResource && line.includes('Type: AWS::Serverless::Function')) {
                isFunction = true;
            }

            // If inside a function, look for !Ref Env<VarName>
            if (currentResource && isFunction) {
                const refMatch = line.match(/!Ref\s+Env([a-zA-Z0-9_]+)/);
                if (refMatch) {
                    const varName = refMatch[1];
                    if (templateVars[varName]) {
                        if (!templateVars[varName].usedIn.includes(currentResource)) {
                            templateVars[varName].usedIn.push(currentResource);
                        }
                    }
                }
            }
        }
    }

    // 2. Read and parse .env
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

    // 3. Compare variables
    const newVars = [];
    const removedVars = [];
    const changedVars = [];

    // Check for new and changed variables
    for (const key of Object.keys(envVars)) {
        if (!templateVars[key]) {
            newVars.push(key);
        } else if (envVars[key] !== templateVars[key].value) {
            changedVars.push({
                name: key,
                oldValue: templateVars[key].value,
                newValue: envVars[key]
            });
        }
    }

    // Check for removed variables
    for (const key of Object.keys(templateVars)) {
        if (!Object.prototype.hasOwnProperty.call(envVars, key)) {
            removedVars.push(key);
        }
    }

    // Report results
    if (newVars.length > 0) {
        console.log(chalk.yellow('\nNew environment variables found:'));
        newVars.forEach(v => console.log(chalk.cyan(`  - ${v}`)));
    } else {
        console.log(chalk.green('\nNo new environment variables found.'));
    }

    if (newVars.length > 0) {
        const { addToTemplate } = await inquirer.prompt([{
            type: 'confirm',
            name: 'addToTemplate',
            message: 'Do you want to add these new variables to template.yaml?',
            default: true
        }]);

        if (addToTemplate) {
            // Get environment from .env (re-read to be safe or rely on process.env from main)
            const envFileContent = await fs.readFile(envPath, 'utf8');
            let environment = '';
            // quick parse for environment
            envFileContent.split('\n').forEach(line => {
                if (line.startsWith('ENVIRONMENT=')) {
                    environment = line.split('=')[1].trim();
                }
            });

            const projectName = path.basename(cwd);

            if (!environment) {
                console.error(chalk.red('Error: ENVIRONMENT variable not found in .env'));
                return;
            }

            // Construct new Parameters YAML
            let newParamsYaml = '';
            newVars.forEach(v => {
                newParamsYaml += `  Env${v}:\n    Type: String\n    Default: '${envVars[v]}'\n`;
            });

            // Construct new Resources YAML
            let newResourcesYaml = '';
            newVars.forEach(v => {
                newResourcesYaml += `  Param${v}:\n    Type: AWS::SSM::Parameter\n    Properties:\n      Name: !Sub '/sam-smith/${environment}/${projectName}/${v}'\n      Type: String\n      Value: !Ref Env${v}\n\n`;
            });

            // Inject into templateContent

            // 1. Insert Parameters (append to end of Parameters section)
            const parametersIndex = templateContent.indexOf('Parameters:');
            const resourcesIndex = templateContent.indexOf('Resources:');

            if (parametersIndex !== -1 && resourcesIndex !== -1) {
                // Extract the Parameters section only
                const parametersSection = templateContent.slice(parametersIndex, resourcesIndex);

                // Find the last Env parameter within Parameters section
                const lastParamMatch = parametersSection.match(/  Env[a-zA-Z0-9_]+:/g);
                if (lastParamMatch) {
                    const lastParam = lastParamMatch[lastParamMatch.length - 1];
                    const lastParamIndexInSection = parametersSection.lastIndexOf(lastParam);
                    const lastParamIndex = parametersIndex + lastParamIndexInSection;

                    // Find end of this parameter block
                    // We want to find the line AFTER "    Default: 'value'"
                    // Look for the pattern: Default line followed by either blank line or Resources
                    const afterParam = templateContent.slice(lastParamIndex);
                    // Match the Default line and capture everything up to and including its newline
                    const defaultLineMatch = afterParam.match(/Default: '[^']*'\n/);

                    if (defaultLineMatch) {
                        const insertPos = lastParamIndex + defaultLineMatch.index + defaultLineMatch[0].length;
                        const before = templateContent.slice(0, insertPos);
                        const after = templateContent.slice(insertPos);
                        // newParamsYaml already ends with \n, and after starts with \n before Resources
                        // So we get: ...Default: 'b1'\nEnvC1:...\n\nResources which is correct
                        templateContent = before + newParamsYaml + after;
                    } else {
                        // Fallback: Insert before Resources
                        const before = templateContent.slice(0, resourcesIndex);
                        const after = templateContent.slice(resourcesIndex);
                        // Ensure there's a blank line before Resources
                        templateContent = before.trimEnd() + `\n${newParamsYaml}` + after;
                    }
                } else {
                    // No existing Env params, insert right after Parameters:
                    templateContent = templateContent.replace(
                        /Parameters:\s*\n/,
                        `Parameters:\n${newParamsYaml}`
                    );
                }
            } else if (resourcesIndex !== -1) {
                // Create Parameters section before Resources
                templateContent = templateContent.replace(
                    /(Resources:)/,
                    `Parameters:\n${newParamsYaml}\n$1`
                );
            }

            // 2. Insert Resources (after the last SSM parameter)
            const ssmType = 'Type: AWS::SSM::Parameter';
            const lastSsmIndex = templateContent.lastIndexOf(ssmType);

            if (lastSsmIndex !== -1) {
                // Find start of next resource or section
                // Search from lastSsmIndex for the next line that starts with 2 spaces and alphanumeric (next resource)
                // or NO spaces (next section like Outputs)
                const remaining = templateContent.slice(lastSsmIndex);
                // Regex for next resource: \n  [A-Za-z]
                // We need to skip the current resource body.
                // Simpler: find the next double-newline which usually limits resources
                const doubleNewline = remaining.indexOf('\n\n');

                if (doubleNewline !== -1) {
                    const insertPos = lastSsmIndex + doubleNewline;
                    const before = templateContent.slice(0, insertPos);
                    const after = templateContent.slice(insertPos);
                    templateContent = before + `\n\n${newResourcesYaml.trimEnd()}` + after;
                } else {
                    // Fallback using Outputs
                    const outputsIndex = templateContent.indexOf('Outputs:');
                    if (outputsIndex !== -1) {
                        const before = templateContent.slice(0, outputsIndex);
                        const after = templateContent.slice(outputsIndex);
                        templateContent = before.trimEnd() + `\n\n${newResourcesYaml.trimEnd()}\n\n` + after;
                    }
                }
            } else {
                // No existing SSM params, insert at top of Resources
                templateContent = templateContent.replace(
                    /(Resources:\s*\n)/,
                    `$1${newResourcesYaml}`
                );
            }

            await fs.writeFile(templatePath, templateContent);
            console.log(chalk.green('✓ template.yaml updated successfully.'));
        }
    }

    if (removedVars.length > 0) {
        console.log(chalk.red('\nRemoved environment variables found:'));
        removedVars.forEach(v => {
            console.log(chalk.red(`  - ${v}`));
            if (templateVars[v] && templateVars[v].usedIn && templateVars[v].usedIn.length > 0) {
                console.log(chalk.red(`    Used in: ${templateVars[v].usedIn.join(', ')}`));
            }
        });

        // Prompt for deletion
        for (const v of removedVars) {
            const { removeVar } = await inquirer.prompt([{
                type: 'confirm',
                name: 'removeVar',
                message: `Do you want to remove ${v} from template.yaml?`,
                default: false
            }]);

            if (removeVar) {
                // 1. Remove from Parameters
                // Regex: Match "  Env<Var>:\n" and following lines that are indented by 4 spaces
                // We use {4,} to match strict spaces.
                // We also match an optional trailing newline (\n?) to consume the blank line after the block.
                const paramRegex = new RegExp(`  Env${v}:\\n( {4,}.*\\n)*\\n?`, 'g');
                templateContent = templateContent.replace(paramRegex, '');

                // 2. Remove AWS::SSM::Parameter Resource
                // Matches block + optional trailing newline
                const resourceRegex = new RegExp(`  Param${v}:\\n( {4,}.*\\n)*\\n?`, 'g');
                templateContent = templateContent.replace(resourceRegex, '');

                // 3. Remove usage in Functions
                if (templateVars[v] && templateVars[v].usedIn) {
                    for (const funcName of templateVars[v].usedIn) {
                        // Find the function block
                        const funcIndex = templateContent.indexOf(`${funcName}:`);
                        if (funcIndex !== -1) {
                            // Limit search to this function scope (rough heuristic: next resource same indentation)
                            // Actually, let's just globally replace the specific reference line if it's uniquely indented
                            // Expected format: "          <Var>: !Ref Env<Var>"
                            // We use multiline regex to match start of line, indentation, content, and the NEWLINE at the end.
                            // This preserves the newline of the previous line (e.g. 'Variables:\n').
                            const usageRegex = new RegExp(`^\\s+${v}: !Ref Env${v}.*\\n?`, 'gm');
                            templateContent = templateContent.replace(usageRegex, '');
                        }
                    }
                }

                // 4. Cleanup empty Environment blocks
                // Look for Environment:\n        Variables:\n      [Dedent]
                const emptyEnvRegex = /( {6}Environment:\n {8}Variables:\n)(?![ ]{10})/g;
                templateContent = templateContent.replace(emptyEnvRegex, '');

                console.log(chalk.green(`✓ Removed ${v} from template.yaml`));
            }
        }


        // Post-removal cleanup

        // 1. Remove empty Parameters section
        // Matches "Parameters:" followed by whitespace/newlines until the next top-level key (start of line char)
        // Checks if the content between is just empty/whitespace.
        const emptyParamsRegex = /Parameters:\s*\n(?=[a-zA-Z0-9])/;
        if (emptyParamsRegex.test(templateContent)) {
            templateContent = templateContent.replace(emptyParamsRegex, '');
        }

        // 2. Ensure there's a blank line before Resources if Parameters exist
        // Match pattern: Default: 'value'\nResources: (missing blank line)
        templateContent = templateContent.replace(/Default: '[^']*'\nResources:/, (match) => {
            return match.replace('\nResources:', '\n\nResources:');
        });

        // 3. Collapse multiple blank lines (3 or more newlines become 2)
        templateContent = templateContent.replace(/\n{3,}/g, '\n\n');

        // Write changes if any removals happened
        await fs.writeFile(templatePath, templateContent);

    } else {
        console.log(chalk.green('\nNo removed environment variables found.'));
    }

    if (changedVars.length > 0) {
        console.log(chalk.blue('\nChanged environment variables found:'));
        changedVars.forEach(v => {
            console.log(chalk.blue(`  - ${v.name}`));
            console.log(chalk.gray(`    Old: '${v.oldValue}'`));
            console.log(chalk.gray(`    New: '${v.newValue}'`));
        });

        const { updateAll } = await inquirer.prompt([{
            type: 'confirm',
            name: 'updateAll',
            message: 'Do you want to update these variables in template.yaml?',
            default: true
        }]);

        if (updateAll) {
            for (const v of changedVars) {
                // Regex matches standard generated format:
                //   EnvNAME:
                //     Type: String
                //     Default: 'VAL'
                const paramRegex = new RegExp(`(  Env${v.name}:\\s+Type:\\s+String\\s+Default:\\s*')([^']*)(')`);

                if (paramRegex.test(templateContent)) {
                    templateContent = templateContent.replace(paramRegex, (match, p1, p2, p3) => p1 + v.newValue + p3);
                    console.log(chalk.green(`✓ Updated ${v.name} to '${v.newValue}'`));
                } else {
                    console.log(chalk.yellow(`⚠ Could not find parameter definition for ${v.name} to update.`));
                }
            }
            await fs.writeFile(templatePath, templateContent);
            console.log(chalk.green('✓ template.yaml updated successfully.'));
        }

    } else {
        console.log(chalk.green('\nNo changed environment variables found.'));
    }
}

async function manageLayers() {
    const questions = [
        {
            type: 'rawlist',
            name: 'action',
            message: 'What do you want to do with Layers?',
            choices: [
                'create layer',
                'delete layer'
            ],
        },
    ];

    const answers = await inquirer.prompt(questions);

    if (answers.action && answers.action.includes('create layer')) {
        await createLayer();
    }
    if (answers.action && answers.action.includes('delete layer')) {
        await deleteLayer();
    }
}

async function deleteLayer() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const srcPath = path.join(cwd, 'src');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    // Read template.yaml and find all layers
    let templateContent = await fs.readFile(templatePath, 'utf8');
    const lines = templateContent.split('\n');

    const layers = [];
    let currentResource = null;
    let inResources = false;

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
            if (currentResource && lines[i].includes("Type: 'AWS::Serverless::LayerVersion'")) {
                layers.push(currentResource);
            }
        }
    }

    if (layers.length === 0) {
        console.log(chalk.yellow('No layers found in template.yaml'));
        return;
    }

    // Show available layers
    console.log(chalk.blue('\nAvailable layers:'));
    layers.forEach((layer, index) => {
        console.log(chalk.cyan(`  ${index + 1}) ${layer}`));
    });
    console.log('');

    // Ask which layer to delete
    const { selectedLayer } = await inquirer.prompt([{
        type: 'rawlist',
        name: 'selectedLayer',
        message: 'Which layer do you want to delete?',
        choices: layers,
    }]);

    // Check if any lambda is using this layer
    const lambdasUsingLayer = [];
    currentResource = null;
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
            // Check if this is a Lambda function
            if (currentResource && lines[i].includes('Type: AWS::Serverless::Function')) {
                // Look for Layers section in this lambda
                for (let j = i; j < lines.length; j++) {
                    if (lines[j].match(/^  [a-zA-Z0-9]+:/)) {
                        // Hit next resource
                        break;
                    }
                    if (lines[j].match(/^\s+Layers:/)) {
                        // Found Layers section, check if it references our layer
                        for (let k = j + 1; k < lines.length; k++) {
                            if (lines[k].match(/^\s{6}\S/) && !lines[k].match(/^\s{8}/)) {
                                // End of Layers section
                                break;
                            }
                            if (lines[k].includes(`!Ref ${selectedLayer}`)) {
                                lambdasUsingLayer.push(currentResource);
                                break;
                            }
                        }
                        break;
                    }
                }
            }
        }
    }

    if (lambdasUsingLayer.length > 0) {
        console.error(chalk.red(`✗ Error: Cannot delete layer '${selectedLayer}' because it is being used by:`));
        lambdasUsingLayer.forEach(lambda => {
            console.error(chalk.red(`  - ${lambda}`));
        });
        return;
    }

    // Confirm deletion
    const { confirmDelete } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmDelete',
        message: `Delete layer '${selectedLayer}'? This will remove it from template.yaml and delete src/layers/${selectedLayer}`,
        default: false,
    }]);

    if (!confirmDelete) {
        console.log(chalk.gray('Deletion cancelled.'));
        return;
    }

    // Find and remove the layer block from template.yaml
    let layerStartLine = -1;
    let layerEndLine = -1;
    inResources = false;

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
                if (resMatch[1] === selectedLayer) {
                    layerStartLine = i;
                }
            }
        }
    }

    if (layerStartLine !== -1) {
        if (layerEndLine === -1) layerEndLine = lines.length;

        // Remove the layer block (including trailing newline if present)
        lines.splice(layerStartLine, layerEndLine - layerStartLine);

        templateContent = lines.join('\n');
        await fs.writeFile(templatePath, templateContent);

        console.log(chalk.green(`✓ Removed layer '${selectedLayer}' from template.yaml`));
    }

    // Delete the layer source directory
    const layerDir = path.join(srcPath, 'layers', selectedLayer);
    if (await fs.pathExists(layerDir)) {
        await fs.remove(layerDir);
        console.log(chalk.green(`✓ Deleted src/layers/${selectedLayer}/`));
    }

    // Check if layers directory is empty and delete it if so
    const layersDir = path.join(srcPath, 'layers');
    if (await fs.pathExists(layersDir)) {
        const remainingLayers = await fs.readdir(layersDir);
        if (remainingLayers.length === 0) {
            await fs.remove(layersDir);
            console.log(chalk.green(`✓ Deleted empty src/layers/ directory`));
        }
    }

    console.log(chalk.green(`\n✓ Layer '${selectedLayer}' deleted successfully!`));
}

async function createLayer() {
    const cwd = process.cwd();
    const templatePath = path.join(cwd, 'template.yaml');
    const srcPath = path.join(cwd, 'src');

    if (!fs.existsSync(templatePath)) {
        console.error(chalk.red('✗ Error: template.yaml file not found.'));
        return;
    }

    // Ask for layer name
    const { layerName } = await inquirer.prompt([{
        type: 'input',
        name: 'layerName',
        message: 'What is the name of your layer?',
        validate: (value) => {
            if (!value.length) {
                return 'Please enter a valid layer name.';
            }
            // Check if layer already exists in template.yaml
            const templateContent = fs.readFileSync(templatePath, 'utf8');
            const layerPattern = new RegExp(`^  ${value}:`, 'm');
            if (layerPattern.test(templateContent)) {
                return `Layer '${value}' already exists in template.yaml`;
            }
            return true;
        },
    }]);

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
        // If no Outputs section, append at the end
        lines.push('');
        lines.push(layerYaml.trim());
    } else {
        // Insert before Outputs
        lines.splice(insertLine, 0, layerYaml);
    }

    // Write updated template
    templateContent = lines.join('\n');
    await fs.writeFile(templatePath, templateContent);


    console.log(chalk.green(`✓ Added layer '${layerName}' to template.yaml`));

    // Create layer directory structure
    const layersDir = path.join(srcPath, 'layers');
    const layerDir = path.join(layersDir, layerName);

    await fs.ensureDir(layerDir);

    // Copy template files from templates/src/layers/BoilerPlateLayer
    const templateLayerPath = path.join(__dirname, '../../templates/src/layers/BoilerPlateLayer');

    // Copy and customize boilerPlateLayerFunctions.ts
    const templateFunctionFile = path.join(templateLayerPath, 'boilerPlateLayerFunctions.ts');
    let functionContent = await fs.readFile(templateFunctionFile, 'utf8');

    // Replace boilerPlateLayer with the actual layer name
    functionContent = functionContent.replace(/boilerPlateLayer/g, layerName);

    const layerFunctionFile = path.join(layerDir, `${layerName}Functions.ts`);
    await fs.writeFile(layerFunctionFile, functionContent);

    // Copy and customize boilerPlateLayerFunctions.test.ts
    const templateTestFile = path.join(templateLayerPath, 'boilerPlateLayerFunctions.test.ts');
    let testContent = await fs.readFile(templateTestFile, 'utf8');

    // Replace boilerPlateLayer with the actual layer name
    testContent = testContent.replace(/boilerPlateLayer/g, layerName);

    const layerTestFile = path.join(layerDir, `${layerName}Functions.test.ts`);
    await fs.writeFile(layerTestFile, testContent);

    console.log(chalk.green(`✓ Created src/layers/${layerName}/${layerName}Functions.ts`));
    console.log(chalk.green(`✓ Created src/layers/${layerName}/${layerName}Functions.test.ts`));
    console.log(chalk.gray(`\nNext steps:`));
    console.log(chalk.gray(`  1. Add the layer to a Lambda function's 'Layers' property in template.yaml`));
    console.log(chalk.gray(`  2. Import and use ${layerName}Function() in your Lambda handler`));
}
