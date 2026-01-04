import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateTwoApigateways = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateTwoApigateways");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateTwoApigateways world",
        }),
    };
};
