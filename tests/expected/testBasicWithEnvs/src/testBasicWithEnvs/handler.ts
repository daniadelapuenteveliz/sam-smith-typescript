import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testBasicWithEnvs = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testBasicWithEnvs");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testBasicWithEnvs world",
        }),
    };
};
