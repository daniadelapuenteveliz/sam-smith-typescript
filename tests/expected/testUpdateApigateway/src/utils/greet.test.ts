import { greet } from './greet';

describe('greet', () => {
    it('should log "hello world from test"', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        greet("test");
        expect(consoleSpy).toHaveBeenCalledWith('hello world from test');
        consoleSpy.mockRestore();
    });
});
