const fs = require('fs');
const YAML = require('yaml');

function defaultForType(type) {
  switch (type) {
    case 'string':
      return '';
    case 'integer':
    case 'number':
      return 0;
    case 'boolean':
      return false;
    case 'array':
      return [];
    default:
      return null;
  }
}

function buildExample(schema) {
  if (!schema) return null;
  if (schema.example !== undefined) return schema.example;
  if (schema.type === 'object' && schema.properties) {
    const obj = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
      obj[name] = buildExample(prop);
    }
    return obj;
  }
  if (schema.type === 'array') {
    return [buildExample(schema.items)];
  }
  return defaultForType(schema.type);
}

const file = 'src/openapi.yaml';
const doc = YAML.parse(fs.readFileSync(file, 'utf8'));

for (const path of Object.values(doc.paths || {})) {
  for (const method of Object.values(path)) {
    if (!method.responses) continue;
    for (const response of Object.values(method.responses)) {
      if (!response.content) {
        response.content = {
          'application/json': {
            example: {}
          }
        };
        continue;
      }
      for (const content of Object.values(response.content)) {
        if (!content.example) {
          content.example = buildExample(content.schema) || {};
        }
      }
    }
  }
}

fs.writeFileSync(file, YAML.stringify(doc));
