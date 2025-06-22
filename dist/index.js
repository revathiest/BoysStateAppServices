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
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
// Load OpenAPI spec
const openApiPath = path_1.default.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml_1.default.parse((0, fs_1.readFileSync)(openApiPath, 'utf8'));
app.use('/docs', swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(openApiDoc));
app.get('/health', (_req, res) => {
    console.log("Serving /health");
    res.json({ status: 'ok' });
});
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
exports.default = app;
