import { tryTable2Query } from './table2Handler';
import { DynamoClient } from 'dynamo-query-builder';

// Mock dynamo-query-builder
jest.mock('dynamo-query-builder', () => {
    const mockTable = {
        put: jest.fn().mockResolvedValue(undefined),
        getOne: jest.fn().mockResolvedValue({
            a2: 'a2',
            b2: 'b2',
            c2: 'c2',
            e2: 'e2',
            data: 'Hello!',
        }),
        delete: jest.fn().mockResolvedValue(undefined),
    };

    return {
        DynamoClient: jest.fn().mockImplementation(() => ({
            table: jest.fn().mockReturnValue(mockTable),
        })),
    };
});

describe('table2Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tryTable2Query', () => {
        it('should put an item in the table', async () => {
            const result = await tryTable2Query();

            expect(result).toEqual({
                a2: 'a2',
                b2: 'b2',
                c2: 'c2',
                e2: 'e2',
                data: 'Hello!',
            });
        });

        it('should execute the complete flow successfully', async () => {
            const result = await tryTable2Query();

            // Verify result
            expect(result).toBeDefined();
            expect(result.data).toBe('Hello!');
        });
    });
});