import { tryTabla2Query } from './tabla2Handler';
import { DynamoClient } from 'dynamo-query-builder';

// Mock dynamo-query-builder
jest.mock('dynamo-query-builder', () => {
    const mockTable = {
        put: jest.fn().mockResolvedValue(undefined),
        getOne: jest.fn().mockResolvedValue({
            x: 'x',
            y: 'y',
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

describe('tabla2Handler', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('tryTabla2Query', () => {
        it('should put an item in the table', async () => {
            const result = await tryTabla2Query();

            expect(result).toEqual({
                x: 'x',
                y: 'y',
                data: 'Hello!',
            });
        });

        it('should execute the complete flow successfully', async () => {
            const result = await tryTabla2Query();

            // Verify result
            expect(result).toBeDefined();
            expect(result.data).toBe('Hello!');
        });
    });
});