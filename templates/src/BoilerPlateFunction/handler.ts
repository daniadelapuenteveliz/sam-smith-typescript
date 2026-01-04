import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const hello = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("BoilerPlateFunction");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "hello world",
        }),
    };
};
