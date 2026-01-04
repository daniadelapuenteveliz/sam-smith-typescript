import { tryTabla1Query } from './tabla1Handler';
import { DynamoClient } from 'dynamo-query-builder';

// Mock dynamo-query-builder
jest.mock('dynamo-query-builder', () => {
    const mockTable = {
        put: jest.fn().mockResolvedValue(undefined),
        getOne: jest.fn().mockResolvedValue({
            a: 'a',
            b: 'b',
            c: 'c',
            e: 'e',
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

describe('tabla1Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tryTabla1Query', () => {
        it('should put an item in the table', async () => {
            const result = await tryTabla1Query();

            expect(result).toEqual({
                a: 'a',
                b: 'b',
                c: 'c',
                e: 'e',
                data: 'Hello!',
            });
        });

        it('should execute the complete flow successfully', async () => {
            const result = await tryTabla1Query();

            // Verify result
            expect(result).toBeDefined();
            expect(result.data).toBe('Hello!');
        });
    });
});