"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.swaggerDoc = exports.loginAttempts = exports.default = void 0;
exports.ensureDatabase = ensureDatabase;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const child_process_1 = require("child_process");
const jwt_1 = require("./jwt");
const logger = __importStar(require("./logger"));
const auth_1 = __importStar(require("./routes/auth"));
Object.defineProperty(exports, "loginAttempts", { enumerable: true, get: function () { return auth_1.loginAttempts; } });
const system_1 = __importStar(require("./routes/system"));
Object.defineProperty(exports, "swaggerDoc", { enumerable: true, get: function () { return system_1.swaggerDoc; } });
const programs_1 = __importDefault(require("./routes/programs"));
const programYears_1 = __importDefault(require("./routes/programYears"));
const groupingTypes_1 = __importDefault(require("./routes/groupingTypes"));
const groupings_1 = __importDefault(require("./routes/groupings"));
const api_1 = __importDefault(require("./routes/api"));
const app = (0, express_1.default)();
exports.default = app;
const corsOptions = { origin: true, credentials: true };
app.use((0, cors_1.default)(corsOptions));
app.use(express_1.default.json());
app.use((req, _res, next) => {
    const programId = req.user?.programId || 'system';
    logger.info(programId, `${req.method} ${req.path}`);
    next();
});
const jwtSecret = process.env.JWT_SECRET || 'development-secret';
app.use((req, res, next) => {
    if (req.path === '/login' ||
        req.path === '/register' ||
        req.path.startsWith('/docs')) {
        return next();
    }
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
    }
    const token = auth.slice(7);
    try {
        req.user = (0, jwt_1.verify)(token, jwtSecret);
        next();
    }
    catch {
        res.status(401).json({ error: 'Unauthorized' });
    }
});
function ensureDatabase() {
    try {
        logger.info('system', 'Running database synchronization');
        (0, child_process_1.execSync)('npx prisma db push', { stdio: 'inherit' });
    }
    catch (err) {
        logger.error('system', 'Database synchronization failed', err);
    }
}
app.use(auth_1.default);
app.use(system_1.default);
app.use(programs_1.default);
app.use(programYears_1.default);
app.use(groupingTypes_1.default);
app.use(groupings_1.default);
app.use(api_1.default);
const port = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test') {
    ensureDatabase();
    app.listen(port, () => {
        logger.info('system', `Server listening on port ${port}`);
    });
}
