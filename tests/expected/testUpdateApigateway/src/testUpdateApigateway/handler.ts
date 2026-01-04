import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testUpdateApigateway = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testUpdateApigateway");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testUpdateApigateway world",
        }),
    };
};
