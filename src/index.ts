import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

import apiRoutes from './api/routes';

dotenv.config();

const app = express();

app.use(cors({
    origin: ['http://localhost:3000', 'http://localhost:3001'], // Add your frontend URL(s)
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));

app.use(express.json());
app.use('/api', apiRoutes);

export default app;