import { DynamoClient, KeySchema, Table } from 'dynamo-query-builder';
const tableName = "sam-smith-testAddAndRemoveTablesFromLambda-dev-tabla2";
const client = new DynamoClient({});
export async function tryTabla2Query() {

    type pk = {
        x: string;
    };

    type sk = {
        y: string;
    };

    type data = {
        data: string;
    };

    const keySchema: KeySchema = {
        pk: {
            name: 'x',
            keys: ['x'],
            separator: '#'
        },
        sk: {
            name: 'y',
            keys: ['y'],
            separator: '#',
        },
    };

    const messageTable: Table<pk, sk, data> = client.table<pk, sk, data>(tableName, keySchema);
    await messageTable.put({
        x: 'x',
        y: 'y',
        data: 'Hello!',
    });
    const result = await messageTable.getOne({
        x: 'x',
    }, {
        y: 'y',
    });
    console.log(result);
    await messageTable.delete({
        x: 'x',
    }, {
        y: 'y',
    });
    return result;
}