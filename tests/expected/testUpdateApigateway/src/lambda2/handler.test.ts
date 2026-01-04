import { lambda2 } from './handler';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('Unit test for lambda2 handler', function () {
    it('verifies successful response', async () => {
        const event: APIGatewayProxyEvent = {} as any;
        const result = await lambda2(event);

        expect(result.statusCode).toEqual(200);
        expect(result.body).toEqual(
            JSON.stringify({
                message: 'hello from lambda2',
            })
        );
    });
});
