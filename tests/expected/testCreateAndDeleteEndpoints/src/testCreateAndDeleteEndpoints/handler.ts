import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateAndDeleteEndpoints = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateAndDeleteEndpoints");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateAndDeleteEndpoints world",
        }),
    };
};
