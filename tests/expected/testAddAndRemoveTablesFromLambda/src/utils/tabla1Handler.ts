import { DynamoClient, KeySchema, Table } from 'dynamo-query-builder';
const tableName = "sam-smith-testAddAndRemoveTablesFromLambda-dev-tabla1";
const client = new DynamoClient({});
export async function tryTabla1Query() {

    type pk = {
        a: string;
        b: string;
    };

    type sk = {
        c: string;
        e: string;
        a: string;
    };

    type data = {
        data: string;
    };

    const keySchema: KeySchema = {
        pk: {
            name: 'a#b',
            keys: ['a', 'b'],
            separator: '#'
        },
        sk: {
            name: 'c#e#a',
            keys: ['c', 'e', 'a'],
            separator: '#',
        },
    };

    const messageTable: Table<pk, sk, data> = client.table<pk, sk, data>(tableName, keySchema);
    await messageTable.put({
        a: 'a',
        b: 'b',
        c: 'c',
        e: 'e',
        data: 'Hello!',
    });
    const result = await messageTable.getOne({
        a: 'a',
        b: 'b',
    }, {
        c: 'c',
        e: 'e',
        a: 'a',
    });
    console.log(result);
    await messageTable.delete({
        a: 'a',
        b: 'b',
    }, {
        c: 'c',
        e: 'e',
        a: 'a',
    });
    return result;
}