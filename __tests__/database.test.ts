import { ensureDatabase } from '../src/index';
import * as child_process from 'child_process';
import * as logger from '../src/logger';

jest.mock('child_process');
jest.mock('../src/logger');

const execMock = child_process.execSync as jest.Mock;

beforeEach(() => {
  execMock.mockReset();
  (logger.info as jest.Mock).mockReset();
  (logger.error as jest.Mock).mockReset();
});

describe('ensureDatabase', () => {
  it('runs database sync', () => {
    execMock.mockImplementationOnce(() => {});
    ensureDatabase();
    expect(execMock).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('system', 'Running database synchronization');
  });

  it('logs errors on failure', () => {
    execMock.mockImplementationOnce(() => { throw new Error('fail'); });
    ensureDatabase();
    expect(logger.error).toHaveBeenCalled();
  });
});
