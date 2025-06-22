import express from 'express';
import cors from 'cors';
import { readFileSync } from 'fs';
import path from 'path';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yaml';

const app = express();
app.use(cors());

// Load OpenAPI spec
const openApiPath = path.join(__dirname, 'openapi.yaml');
const openApiDoc = yaml.parse(readFileSync(openApiPath, 'utf8'));
app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc));

app.get('/health', (_req, res) => {
  console.log("Serving /health");
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

export default app;
