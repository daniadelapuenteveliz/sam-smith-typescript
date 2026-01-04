import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testAddDeleteAndUpdateEnvs = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testAddDeleteAndUpdateEnvs");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testAddDeleteAndUpdateEnvs world",
        }),
    };
};
