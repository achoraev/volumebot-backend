import { sanitizeSettings } from './sanitizer';

describe('Sanitizer Logic', () => {
    it('should fix "minAmmount" typo and return a number', () => {
        const raw = { minAmmount: "0.05" };
        const clean = sanitizeSettings(raw);
        
        expect(clean.minAmount).toBe(0.05);
        expect(typeof clean.minAmount).toBe('number');
    });

    it('should provide default values if input is missing', () => {
        const clean = sanitizeSettings({});
        expect(clean.minAmount).toBe(0.01);
        expect(clean.maxDelay).toBe(30);
    });
});