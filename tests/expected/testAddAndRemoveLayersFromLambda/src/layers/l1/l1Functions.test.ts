import { l1Function } from './l1Functions';

describe('l1Function', () => {
    it('should call greet with l1', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        l1Function();
        expect(consoleSpy).toHaveBeenCalledWith('hello world from l1');
        consoleSpy.mockRestore();
    });
});
