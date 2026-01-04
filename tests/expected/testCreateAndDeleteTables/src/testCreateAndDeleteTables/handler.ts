import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
export const testCreateAndDeleteTables = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testCreateAndDeleteTables");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testCreateAndDeleteTables world",
        }),
    };
};
