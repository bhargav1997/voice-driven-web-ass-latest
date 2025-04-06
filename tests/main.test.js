describe('Voice Assistant Tests', () => {
    describe('Security Tests', () => {
        test('Input Sanitization', () => {
            const maliciousInput = '<script>alert("xss")</script>click button';
            expect(sanitizeInput(maliciousInput)).toBe('click button');
        });

        test('Rate Limiting', () => {
            const limiter = new RateLimiter();
            for (let i = 0; i < 10; i++) {
                limiter.checkLimit('test');
            }
            expect(limiter.checkLimit('test')).toBe(false);
        });
    });

    describe('Accessibility Tests', () => {
        test('ARIA Labels Present', () => {
            const feedback = document.getElementById('feedback');
            expect(feedback.getAttribute('role')).toBe('status');
            expect(feedback.getAttribute('aria-live')).toBe('polite');
        });
    });

    describe('Performance Tests', () => {
        test('Command Processing Time', async () => {
            const startTime = performance.now();
            await handleVoiceCommand('click button test');
            const endTime = performance.now();
            expect(endTime - startTime).toBeLessThan(100);
        });
    });
});