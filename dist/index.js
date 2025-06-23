"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const yaml_1 = __importDefault(require("yaml"));
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = __importDefault(require("./prisma"));
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Load OpenAPI spec
const openApiPath = path_1.default.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml_1.default.parse((0, fs_1.readFileSync)(openApiPath, 'utf8'));
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openApiDoc));
function hashPassword(password) {
    return crypto_1.default.createHash('sha256').update(password).digest('hex');
}
app.get('/health', async (_req, res) => {
    console.log('Serving /health');
    let dbStatus = 'ok';
    try {
        await prisma_1.default.$queryRaw `SELECT 1`;
    }
    catch (err) {
        console.error('Database check failed', err);
        dbStatus = 'error';
    }
    res.json({ status: 'ok', database: dbStatus });
});
app.post('/register', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Missing fields' });
        return;
    }
    const passwordHash = hashPassword(password);
    try {
        const user = await prisma_1.default.user.create({ data: { email, passwordHash } });
        res.status(201).json({ id: user.id, email: user.email });
    }
    catch (err) {
        console.error('Registration failed', err);
        res.status(400).json({ error: 'Registration failed' });
    }
});
app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        res.status(400).json({ error: 'Missing fields' });
        return;
    }
    const user = await prisma_1.default.user.findUnique({ where: { email } });
    if (!user) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    const passwordHash = hashPassword(password);
    if (passwordHash !== user.passwordHash) {
        res.status(401).json({ error: 'Invalid credentials' });
        return;
    }
    res.json({ id: user.id, email: user.email });
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
exports.default = app;
