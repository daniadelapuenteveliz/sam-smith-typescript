import { DynamoClient, KeySchema, Table } from 'dynamo-query-builder';
const tableName = "sam-smith-testCreateAndDeleteTables-dev-table2";
const client = new DynamoClient({});
export async function tryTable2Query() {

    type pk = {
        a2: string;
        b2: string;
    };

    type sk = {
        c2: string;
        a2: string;
        e2: string;
    };

    type data = {
        data: string;
    };

    const keySchema: KeySchema = {
        pk: {
            name: 'a2#b2',
            keys: ['a2', 'b2'],
            separator: '#'
        },
        sk: {
            name: 'c2#a2#e2',
            keys: ['c2', 'a2', 'e2'],
            separator: '#',
        },
    };

    const messageTable: Table<pk, sk, data> = client.table<pk, sk, data>(tableName, keySchema);
    await messageTable.put({
        a2: 'a2',
        b2: 'b2',
        c2: 'c2',
        e2: 'e2',
        data: 'Hello!',
    });
    const result = await messageTable.getOne({
        a2: 'a2',
        b2: 'b2',
    }, {
        c2: 'c2',
        a2: 'a2',
        e2: 'e2',
    });
    console.log(result);
    await messageTable.delete({
        a2: 'a2',
        b2: 'b2',
    }, {
        c2: 'c2',
        a2: 'a2',
        e2: 'e2',
    });
    return result;
}