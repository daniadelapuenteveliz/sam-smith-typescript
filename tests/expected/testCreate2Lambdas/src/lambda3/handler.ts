import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

export const lambda3 = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "hello from lambda3",
        }),
    };
};
