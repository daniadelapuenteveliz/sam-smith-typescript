import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateAndDeleteApigateway = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateAndDeleteApigateway");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateAndDeleteApigateway world",
        }),
    };
};
