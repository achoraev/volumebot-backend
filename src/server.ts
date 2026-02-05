import app from './index';

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
    console.log(`✅ Volume Bot Server active at http://localhost:${PORT}`);
});