# sam-smith

A CLI tool for scaffolding AWS SAM serverless projects with TypeScript, Lambda functions, API Gateway, and Cognito authentication.

> **Requirements:** Node.js 20+

## Installation

```bash
npm install -g sam-smith
```

## Quick Start

Create a new serverless project:

```bash
npx sam-smith
```

Follow the interactive prompts to configure your project.

## Project Templates

sam-smith offers three project templates:

### 1. **Basic**
Simple serverless API with Lambda and API Gateway.
- Single Lambda function
- API Gateway with one endpoint
- No authentication

### 2. **Basic Auth**
API with Lambda Authorizer for custom authentication.
- Lambda function
- API Gateway endpoint
- Lambda Authorizer function for request-based auth
- Validates custom headers (e.g., API keys)

### 3. **Cognito Auth**
API with AWS Cognito authentication.
- Lambda function
- API Gateway endpoint
- Cognito User Pool and User Pool Client
- JWT-based authentication

## Usage

### Creating a Project

```bash
npx sam-smith
```

You'll be prompted for:
- **Template type**: Choose from `basic`, `basic-auth`, or `cognito-auth`
- **Project name**: Name of your project directory
- **Environment**: Deployment environment (e.g., `dev`, `prod`)
- **Architecture**: `x86_64` or `arm64`
- **API Gateway name**: Name for your API Gateway
- **Lambda function name**: Name of your Lambda function
- **Timeout**: Lambda timeout in seconds

### Environment Variables

sam-smith uses **AWS Systems Manager (SSM) Parameter Store** to manage environment variables securely.

- **Storage**: Variables are stored in SSM Parameter Store with the path `/sam-smith/{environment}/{functionName}/{variableName}`.
- **Template**: The generated `template.yaml` automatically references these parameters and passes them to your Lambda functions.
- **Local Development**: A `.env` file is created in your project root with `ENVIRONMENT={environment}`. You can add local overrides here.
- **Management**: Use `npm run sam-smith:update` to easily add, update, or remove environment variables.

For Cognito Auth template, you'll also be prompted for:
- **User Pool name**: Name for your Cognito User Pool

### Generated Project Structure

```
your-project/
├── src/
│   └── yourFunction/
│       ├── handler.ts       # Lambda function code
│       └── handler.test.ts  # Jest tests
├── template.yaml             # SAM template
├── samconfig.toml           # SAM configuration
├── package.json
├── tsconfig.json
└── jest.config.js
```

## Available Commands

Once your project is created, navigate to the project directory and use these commands:

### Build

Compile TypeScript and prepare for deployment:

```bash
npm run sam-smith:build
```

### Deploy

Deploy to AWS:

```bash
npm run sam-smith:deploy
```

### Local Development

Run API locally (requires Docker):

```bash
npm run sam-smith:start
```

Run on a custom port:

```bash
npm run sam-smith:start -- -p 3001
```

Test your local endpoint:

```bash
curl http://127.0.0.1:3000/hello
```

### Update Project

Manage your SAM project resources interactively:

```bash
npm run sam-smith:update
```

This allows you to:
- **API Gateways**: Create, update, delete API Gateways and endpoints
- **Lambda Functions**: Create, update, delete Lambda functions
- **Layers**: Create and manage Lambda layers
- **DynamoDB Tables**: Create and manage DynamoDB tables
- **Authentication**: Add/remove Basic Auth or Cognito Auth
- **User Pools**: Create user groups in Cognito User Pools
- **Environment Variables**: Add, update, or remove environment variables

### Run Tests

```bash
npm test
```

### Generate Documentation

Generate OpenAPI/Swagger documentation:

```bash
npx sam-smith doc
```

## Features

### Resource Management

- ✅ **API Gateways**: REST APIs with CORS support
- ✅ **Lambda Functions**: TypeScript Lambda functions with esbuild
- ✅ **Lambda Layers**: Shared code and dependencies
- ✅ **DynamoDB Tables**: NoSQL database tables
- ✅ **Environment Variables**: SSM Parameter Store integration

### Authentication

- ✅ **Basic Auth**: Lambda Authorizer with custom header validation
- ✅ **Cognito Auth**: JWT-based authentication with User Pools
- ✅ **User Groups**: Role-based access control with Cognito groups

### Development

- ✅ **TypeScript**: Full TypeScript support
- ✅ **Testing**: Jest test framework included
- ✅ **Local Testing**: Run API locally with SAM CLI
- ✅ **Hot Reload**: TypeScript compilation on changes

## Testing Cognito Authentication

After deploying a Cognito-auth project:

1. **Create a user and set password:**

```bash
aws cognito-idp admin-set-user-password \
  --user-pool-id YOUR_USER_POOL_ID \
  --username testuser \
  --password MyPass123! \
  --permanent
```

2. **Get authentication token:**

```bash
TOKEN=$(aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --client-id YOUR_CLIENT_ID \
  --auth-parameters USERNAME=testuser,PASSWORD=MyPass123! \
  --query 'AuthenticationResult.IdToken' \
  --output text)
```

3. **Call your protected endpoint:**

```bash
curl https://YOUR_API_ID.execute-api.us-east-1.amazonaws.com/default/hello \
  -H "Authorization: Bearer $TOKEN"
```

> **Note:** Cognito authentication only works when deployed to AWS, not in local development with `sam local`.

## Example: Adding DynamoDB to Your Project

```bash
npm run sam-smith:update
# Select: DynamoDB Tables → create → Enter table details
```

## Example: Adding an Endpoint

```bash
npm run sam-smith:update
# Select: API Gateways → update → [Your API] → add endpoint
# Enter: Method (GET/POST/etc.), Path, Lambda function
```

## AWS Requirements

### Prerequisites

- AWS CLI configured with appropriate credentials
- AWS SAM CLI installed
- Docker (for local development)

### IAM Permissions

To use sam-smith, you need an AWS IAM user or role with the following permissions. All resources created by sam-smith use the `sam-smith-*` naming convention for easy identification and security scoping.

#### Required IAM Policy

Create an IAM policy with the following JSON. **Important:** Replace `YOUR_ACCOUNT_ID` and `YOUR_REGION` with your actual AWS account ID and preferred region (e.g., `us-east-1`).

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "CloudFormationStack",
            "Effect": "Allow",
            "Action": [
                "cloudformation:CreateChangeSet",
                "cloudformation:DescribeStacks",
                "cloudformation:ListStacks",
                "cloudformation:GetTemplateSummary",
                "cloudformation:DescribeChangeSet",
                "cloudformation:DescribeStackEvents",
                "cloudformation:ExecuteChangeSet"
            ],
            "Resource": [
                "arn:aws:cloudformation:YOUR_REGION:YOUR_ACCOUNT_ID:stack/aws-sam-cli-managed-default/*",
                "arn:aws:cloudformation:YOUR_REGION:YOUR_ACCOUNT_ID:stack/sam-smith-*"
            ]
        },
        {
            "Sid": "CloudFormationTransform",
            "Effect": "Allow",
            "Action": "cloudformation:CreateChangeSet",
            "Resource": "arn:aws:cloudformation:YOUR_REGION:aws:transform/Serverless-*"
        },
        {
            "Sid": "S3DeploymentBucket",
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject"
            ],
            "Resource": "arn:aws:s3:::aws-sam-cli-managed-default-samclisourcebucket-*/*"
        },
        {
            "Sid": "IAMRoles",
            "Effect": "Allow",
            "Action": [
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:GetRole",
                "iam:PassRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "iam:TagRole",
                "iam:UntagRole",
                "iam:CreatePolicy"
            ],
            "Resource": [
                "arn:aws:iam::YOUR_ACCOUNT_ID:role/sam-smith-*",
                "arn:aws:iam::YOUR_ACCOUNT_ID:policy/sam-smith-*"
            ]
        },
        {
            "Sid": "SSMParameters",
            "Effect": "Allow",
            "Action": [
                "ssm:PutParameter",
                "ssm:GetParameter",
                "ssm:GetParameters",
                "ssm:DeleteParameter",
                "ssm:DescribeParameters",
                "ssm:AddTagsToResource",
                "ssm:RemoveTagsFromResource"
            ],
            "Resource": [
                "arn:aws:ssm:YOUR_REGION:YOUR_ACCOUNT_ID:parameter/sam-smith*",
                "arn:aws:ssm:YOUR_REGION:YOUR_ACCOUNT_ID:parameter/sam-smith-*"
            ]
        },
        {
            "Sid": "LambdaFunctions",
            "Effect": "Allow",
            "Action": [
                "lambda:CreateFunction",
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration",
                "lambda:DeleteFunction",
                "lambda:GetFunction",
                "lambda:TagResource",
                "lambda:UntagResource",
                "lambda:AddPermission",
                "lambda:RemovePermission",
                "lambda:PublishLayerVersion",
                "lambda:GetLayerVersion"
            ],
            "Resource": [
                "arn:aws:lambda:YOUR_REGION:YOUR_ACCOUNT_ID:function:sam-smith-*",
                "arn:aws:lambda:YOUR_REGION:YOUR_ACCOUNT_ID:layer:sam-smith-*"
            ]
        },
        {
            "Sid": "CloudWatchLogs",
            "Effect": "Allow",
            "Action": [
                "logs:CreateLogGroup",
                "logs:DeleteLogGroup",
                "logs:DescribeLogGroups",
                "logs:PutRetentionPolicy"
            ],
            "Resource": "arn:aws:logs:YOUR_REGION:YOUR_ACCOUNT_ID:log-group:/aws/lambda/sam-smith-*"
        },
        {
            "Sid": "APIGateway",
            "Effect": "Allow",
            "Action": [
                "apigateway:POST",
                "apigateway:PUT",
                "apigateway:PATCH",
                "apigateway:DELETE",
                "apigateway:GET"
            ],
            "Resource": "arn:aws:apigateway:YOUR_REGION::/restapis*"
        },
        {
            "Sid": "DynamoDB",
            "Effect": "Allow",
            "Action": [
                "dynamodb:DescribeTable",
                "dynamodb:CreateTable",
                "dynamodb:DeleteTable",
                "dynamodb:UpdateTable"
            ],
            "Resource": "arn:aws:dynamodb:YOUR_REGION:YOUR_ACCOUNT_ID:table/sam-smith-*"
        },
        {
            "Sid": "Cognito",
            "Effect": "Allow",
            "Action": [
                "cognito-idp:CreateUserPool",
                "cognito-idp:CreateUserPoolClient",
                "cognito-idp:DeleteUserPool",
                "cognito-idp:DeleteUserPoolClient",
                "cognito-idp:DescribeUserPool",
                "cognito-idp:UpdateUserPool",
                "cognito-idp:ListUserPools",
                "cognito-idp:GetGroup",
                "cognito-idp:CreateGroup",
                "cognito-idp:DeleteGroup"
            ],
            "Resource": "arn:aws:cognito-idp:YOUR_REGION:YOUR_ACCOUNT_ID:userpool/*"
        }
    ]
}
```

#### Resource Breakdown

| Service | Purpose | Resource Pattern |
|---------|---------|------------------|
| **CloudFormation** | Deploy and manage SAM stacks | `sam-smith-*` |
| **S3** | Store deployment artifacts | SAM CLI managed bucket |
| **IAM** | Lambda execution roles and policies | `sam-smith-*` |
| **SSM Parameter Store** | Environment variable storage | `sam-smith*` and `sam-smith-*` |
| **Lambda** | Function deployment and layers | `sam-smith-*` |
| **CloudWatch Logs** | Function logging | `/aws/lambda/sam-smith-*` |
| **API Gateway** | REST API endpoints | All REST APIs in region |
| **DynamoDB** | Database tables | `sam-smith-*` |
| **Cognito** | User authentication | All user pools |

#### Security Best Practices

- ✅ **Least Privilege**: Policy restricts resources to `sam-smith-*` pattern
- ✅ **Resource Scoping**: All ARNs are scoped to your account and region
- ✅ **Stack Naming**: All CloudFormation stacks use `sam-smith-` prefix
- ⚠️ **API Gateway**: Permissions apply to all REST APIs (cannot be scoped by name pattern)
- ⚠️ **Cognito**: Permissions apply to all user pools in the account


```bash
npm test
```

## License

MIT

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.