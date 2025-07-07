import express from 'express';
import { getUserPrograms } from '../utils/auth';
const router = express.Router();

router.get('/user-programs/:username', getUserPrograms);

export default router;
