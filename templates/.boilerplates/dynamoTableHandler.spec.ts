import { tryDynamoQuery } from './dynamoTableHandler';
import { DynamoClient } from 'dynamo-query-builder';

// Mock dynamo-query-builder
jest.mock('dynamo-query-builder', () => {
    const mockTable = {
        put: jest.fn().mockResolvedValue(undefined),
        getOne: jest.fn().mockResolvedValue({
            pk1: 'pk1',
            pk2: 'pk2',
            sk1: 'sk1',
            sk2: 'sk2',
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

describe('dynamoTableHandler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tryDynamoQuery', () => {
        it('should put an item in the table', async () => {
            const result = await tryDynamoQuery();

            expect(result).toEqual({
                pk1: 'pk1',
                pk2: 'pk2',
                sk1: 'sk1',
                sk2: 'sk2',
                data: 'Hello!',
            });
        });

        it('should execute the complete flow successfully', async () => {
            const result = await tryDynamoQuery();

            // Verify result
            expect(result).toBeDefined();
            expect(result.data).toBe('Hello!');
        });
    });
});