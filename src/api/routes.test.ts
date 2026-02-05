import request from 'supertest';
import app from '../index';

describe('POST /api/start-bot', () => {
    it('should sanitize and start the bot', async () => {
        const response = await request(app)
            .post('/api/start-bot')
            .send({
                tokenAddress: "FVVcwtS1qeh9PBqjKd2D1jgGkFfqoAX6SdaCepgZpump",
                settings: { minAmmount: 0.01 }
            });
            
        expect(response.status).toBe(200);
    });
});

describe('POST /api/start-bot', () => {
    it('should fail if tokenAddress is missing', async () => {
        const res = await request(app)
            .post('/api/start-bot')
            .send({ settings: {} });
            
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("required");
    });

    it('should fail if tokenAddress is invalid format', async () => {
        const res = await request(app)
            .post('/api/start-bot')
            .send({ tokenAddress: "invalid-123" });
            
        expect(res.statusCode).toBe(400);
        expect(res.body.error).toContain("format");
    });
});