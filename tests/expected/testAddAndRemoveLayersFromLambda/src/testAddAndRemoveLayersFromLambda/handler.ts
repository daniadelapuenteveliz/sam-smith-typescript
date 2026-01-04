import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testAddAndRemoveLayersFromLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testAddAndRemoveLayersFromLambda");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testAddAndRemoveLayersFromLambda world",
        }),
    };
};
