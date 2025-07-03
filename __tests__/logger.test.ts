jest.mock('fs');
jest.mock('../src/prisma');
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import prisma from '../src/prisma';
import * as logger from '../src/logger';

const mockedFs = {
  appendFileSync: appendFileSync as jest.Mock,
  mkdirSync: mkdirSync as jest.Mock,
  existsSync: existsSync as jest.Mock,
};
const mockedPrisma = prisma as any;

beforeEach(() => {
  mockedFs.appendFileSync.mockReset();
  mockedFs.mkdirSync.mockReset();
  mockedFs.existsSync.mockReset();
  mockedPrisma.log.create.mockReset();
  mockedPrisma.log.create.mockResolvedValue(null);
});

test('info creates log directory when missing', () => {
  mockedFs.existsSync.mockReturnValueOnce(false);
  logger.info('test', 'hello');
  expect(mockedFs.mkdirSync).toHaveBeenCalled();
  expect(mockedFs.appendFileSync).toHaveBeenCalled();
  expect(mockedPrisma.log.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        level: 'info',
        programId: 'test',
        source: 'api',
        message: 'hello',
      }),
    }),
  );
});

test('error logs with stack string', () => {
  mockedFs.existsSync.mockReturnValue(true);
  const err = new Error('bad');
  logger.error('test', 'oops', err);
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toContain('bad');
  expect(mockedPrisma.log.create).toHaveBeenCalled();
});


test('error logs without error argument', () => {
  mockedFs.existsSync.mockReturnValue(true);
  logger.error('test', 'missing');
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toBeUndefined();
  expect(mockedPrisma.log.create).toHaveBeenCalled();
});

test('error logs string error', () => {
  mockedFs.existsSync.mockReturnValue(true);
  logger.error('test', 'oops', 'bad');
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toBe('bad');
  expect(mockedPrisma.log.create).toHaveBeenCalled();
});
