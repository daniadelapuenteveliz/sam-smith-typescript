import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCognitoAuthWorkflow = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCognitoAuthWorkflow");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCognitoAuthWorkflow world",
        }),
    };
};
