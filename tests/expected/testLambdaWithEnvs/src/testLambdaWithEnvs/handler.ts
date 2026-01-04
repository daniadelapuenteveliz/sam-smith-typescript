import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testLambdaWithEnvs = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testLambdaWithEnvs");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testLambdaWithEnvs world",
        }),
    };
};
