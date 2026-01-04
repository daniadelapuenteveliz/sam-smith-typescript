import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { greet } from '../utils/greet';
import { tryTabla2Query } from '../utils/tabla2Handler';
export const testAddAndRemoveTablesFromLambda = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    greet("testAddAndRemoveTablesFromLambda");
    return {
        statusCode: 200,
        body: JSON.stringify({
            message: "testAddAndRemoveTablesFromLambda world",
        }),
    };
};
