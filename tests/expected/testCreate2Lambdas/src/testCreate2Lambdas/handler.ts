import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreate2Lambdas = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreate2Lambdas");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreate2Lambdas world",
        }),
    };
};
