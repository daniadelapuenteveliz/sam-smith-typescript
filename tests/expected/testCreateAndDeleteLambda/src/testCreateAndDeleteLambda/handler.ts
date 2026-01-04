import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateAndDeleteLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateAndDeleteLambda");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateAndDeleteLambda world",
        }),
    };
};
