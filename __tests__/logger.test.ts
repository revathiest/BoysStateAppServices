jest.mock('fs');
import { appendFileSync, mkdirSync, existsSync } from 'fs';
import * as logger from '../src/logger';

const mockedFs = {
  appendFileSync: appendFileSync as jest.Mock,
  mkdirSync: mkdirSync as jest.Mock,
  existsSync: existsSync as jest.Mock,
};

beforeEach(() => {
  mockedFs.appendFileSync.mockReset();
  mockedFs.mkdirSync.mockReset();
  mockedFs.existsSync.mockReset();
});

test('info creates log directory when missing', () => {
  mockedFs.existsSync.mockReturnValueOnce(false);
  logger.info('test', 'hello');
  expect(mockedFs.mkdirSync).toHaveBeenCalled();
  expect(mockedFs.appendFileSync).toHaveBeenCalled();
});

test('error logs with stack string', () => {
  mockedFs.existsSync.mockReturnValue(true);
  const err = new Error('bad');
  logger.error('test', 'oops', err);
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toContain('bad');
});


test('error logs without error argument', () => {
  mockedFs.existsSync.mockReturnValue(true);
  logger.error('test', 'missing');
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toBeUndefined();
});

test('error logs string error', () => {
  mockedFs.existsSync.mockReturnValue(true);
  logger.error('test', 'oops', 'bad');
  const call = mockedFs.appendFileSync.mock.calls[0][1] as string;
  const entry = JSON.parse(call);
  expect(entry.error).toBe('bad');
});
