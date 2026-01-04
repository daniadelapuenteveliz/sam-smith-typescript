import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testAddBasicAuth = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testAddBasicAuth");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testAddBasicAuth world",
        }),
    };
};
