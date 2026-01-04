import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testBasicNoEnv = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testBasicNoEnv");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testBasicNoEnv world",
        }),
    };
};
