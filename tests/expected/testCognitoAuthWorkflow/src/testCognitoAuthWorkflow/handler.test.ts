import { testCognitoAuthWorkflow } from './handler.js';
import { APIGatewayProxyEvent } from 'aws-lambda';
import { greet } from '../utils/greet';

jest.mock('../utils/greet');

describe('Unit test for app handler', function () {
    it('verifies successful response', async () => {
        const event: APIGatewayProxyEvent = {} as any;
        const result = await testCognitoAuthWorkflow(event);

        expect(result.statusCode).toEqual(200);
        expect(result.body).toEqual(
            JSON.stringify({
                message: 'testCognitoAuthWorkflow world',
            })
        );
        expect(greet).toHaveBeenCalled();
    });
});
