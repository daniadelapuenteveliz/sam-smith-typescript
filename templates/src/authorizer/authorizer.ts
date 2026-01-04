import { APIGatewayRequestAuthorizerEvent, APIGatewayAuthorizerResult } from 'aws-lambda';

export const basicAuthorizer = async (event: APIGatewayRequestAuthorizerEvent): Promise<APIGatewayAuthorizerResult> => {
    const apiKey = event.headers?.['Key'] || event.headers?.['key'];
    const expectedApiKey = "TEST_API_KEY_123";

    const effect = apiKey === expectedApiKey ? 'Allow' : 'Deny';

    return {
        principalId: 'user',
        policyDocument: {
            Version: '2012-10-17',
            Statement: [
                {
                    Action: 'execute-api:Invoke',
                    Effect: effect,
                    Resource: event.methodArn,
                },
            ],
        },
    };
};
