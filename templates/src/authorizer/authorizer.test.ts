import { basicAuthorizer } from './authorizer';
import { APIGatewayRequestAuthorizerEvent } from 'aws-lambda';

describe('basicAuthorizer', () => {
    const mockEvent = (headers: { [key: string]: string }): APIGatewayRequestAuthorizerEvent => ({
        type: 'REQUEST',
        methodArn: 'arn:aws:execute-api:us-east-1:123456789012:api-id/default/GET/hello',
        resource: '/hello',
        path: '/hello',
        httpMethod: 'GET',
        headers: headers,
        multiValueHeaders: {},
        pathParameters: {},
        queryStringParameters: {},
        multiValueQueryStringParameters: {},
        stageVariables: {},
        requestContext: {} as any,
    });

    it('should allow request with correct Key', async () => {
        const event = mockEvent({ 'Key': 'TEST_API_KEY_123' });
        const result = await basicAuthorizer(event);

        expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });

    it('should allow request with correct Key (case check)', async () => {
        const event = mockEvent({ 'Key': 'TEST_API_KEY_123' });
        const result = await basicAuthorizer(event);

        expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
    });

    it('should deny request with incorrect Key', async () => {
        const event = mockEvent({ 'Key': 'WRONG_KEY' });
        const result = await basicAuthorizer(event);

        expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    });

    it('should deny request with missing Key', async () => {
        const event = mockEvent({});
        const result = await basicAuthorizer(event);

        expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
    });
});
