import { boilerPlateLayerFunction } from './boilerPlateLayerFunctions';

describe('boilerPlateLayerFunction', () => {
    it('should call greet with boilerPlateLayer', () => {
        const consoleSpy = jest.spyOn(console, 'log');
        boilerPlateLayerFunction();
        expect(consoleSpy).toHaveBeenCalledWith('hello world from boilerPlateLayer');
        consoleSpy.mockRestore();
    });
});
