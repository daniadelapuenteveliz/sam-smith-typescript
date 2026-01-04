import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const createAndUpdateLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("createAndUpdateLambda");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "createAndUpdateLambda world",
        }),
    };
};
