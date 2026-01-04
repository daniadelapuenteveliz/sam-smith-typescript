import { l2Function } from './l2Functions';

describe('l2Function', () => {
    it('should call greet with l2', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        l2Function();
        expect(consoleSpy).toHaveBeenCalledWith('hello world from l2');
        consoleSpy.mockRestore();
    });
});
