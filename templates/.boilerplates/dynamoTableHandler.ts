import { DynamoClient, KeySchema, Table } from 'dynamo-query-builder';
const tableName = "sam-smith-test1-dev-Table1";
const client = new DynamoClient({});
export async function tryDynamoQuery() {

    type pk = {
        pk1: string;
        pk2: string;
    };

    type sk = {
        sk1: string;
        sk2: string;
    };

    type data = {
        data: string;
    };

    const keySchema: KeySchema = {
        pk: {
            name: 'pk1#pk2',
            keys: ['pk1', 'pk2'],
            separator: '#'
        },
        sk: {
            name: 'sk1#sk2',
            keys: ['sk1', 'sk2'],
            separator: '#',
        },
    };

    const messageTable: Table<pk, sk, data> = client.table<pk, sk, data>(tableName, keySchema);
    await messageTable.put({
        pk1: 'pk1',
        pk2: 'pk2',
        sk1: 'sk1',
        sk2: 'sk2',
        data: 'Hello!',
    });
    const result = await messageTable.getOne({
        pk1: 'pk1',
        pk2: 'pk2',
    }, {
        sk1: 'sk1',
        sk2: 'sk2',
    });
    console.log(result);
    await messageTable.delete({
        pk1: 'pk1',
        pk2: 'pk2',
    }, {
        sk1: 'sk1',
        sk2: 'sk2',
    });
    return result;
}