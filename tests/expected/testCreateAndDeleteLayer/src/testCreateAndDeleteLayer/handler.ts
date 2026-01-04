import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateAndDeleteLayer = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateAndDeleteLayer");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateAndDeleteLayer world",
        }),
    };
};
