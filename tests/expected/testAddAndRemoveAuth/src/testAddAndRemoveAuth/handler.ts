import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testAddAndRemoveAuth = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testAddAndRemoveAuth");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testAddAndRemoveAuth world",
        }),
    };
};
