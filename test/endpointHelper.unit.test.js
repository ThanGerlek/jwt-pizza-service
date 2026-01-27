const { StatusCodeError, asyncHandler } = require('../src/endpointHelper.js');

describe('EndpointHelper Unit Tests', () => {
  // ====================================================================
  // StatusCodeError Class Tests
  // ====================================================================
  describe('StatusCodeError', () => {
    test('creates error with message and statusCode', () => {
      const error = new StatusCodeError('Test error', 404);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(404);
    });

    test('extends Error class', () => {
      const error = new StatusCodeError('Another error', 500);

      expect(error instanceof Error).toBe(true);
      expect(error instanceof StatusCodeError).toBe(true);
    });

    test('error properties are accessible', () => {
      const error = new StatusCodeError('Unauthorized', 401);

      expect(error.message).toBe('Unauthorized');
      expect(error.statusCode).toBe(401);
      expect(error.stack).toBeDefined();
    });

    test('works with different status codes', () => {
      const error400 = new StatusCodeError('Bad Request', 400);
      const error403 = new StatusCodeError('Forbidden', 403);
      const error500 = new StatusCodeError('Internal Server Error', 500);

      expect(error400.statusCode).toBe(400);
      expect(error403.statusCode).toBe(403);
      expect(error500.statusCode).toBe(500);
    });

    test('preserves error message', () => {
      const message = 'This is a custom error message';
      const error = new StatusCodeError(message, 422);

      expect(error.message).toBe(message);
      expect(error.toString()).toContain(message);
    });

    test('can be thrown and caught', () => {
      expect(() => {
        throw new StatusCodeError('Test throw', 418);
      }).toThrow(StatusCodeError);

      try {
        throw new StatusCodeError('Caught error', 409);
      } catch (error) {
        expect(error).toBeInstanceOf(StatusCodeError);
        expect(error.statusCode).toBe(409);
      }
    });
  });

  // ====================================================================
  // asyncHandler Function Tests
  // ====================================================================
  describe('asyncHandler', () => {
    let req, res, next;

    beforeEach(() => {
      req = {};
      res = {
        json: jest.fn(),
        status: jest.fn(() => res),
        send: jest.fn(),
      };
      next = jest.fn();
    });

    test('wraps async function successfully', async () => {
      const asyncFn = async (req, res) => {
        res.json({ success: true });
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ success: true });
      expect(next).not.toHaveBeenCalled();
    });

    test('catches errors and calls next(error)', async () => {
      const error = new Error('Test error');
      const asyncFn = async () => {
        throw error;
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(res.json).not.toHaveBeenCalled();
    });

    test('handles successful resolution', async () => {
      const asyncFn = async (req, res) => {
        const data = await Promise.resolve({ data: 'test' });
        res.json(data);
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(res.json).toHaveBeenCalledWith({ data: 'test' });
      expect(next).not.toHaveBeenCalled();
    });

    test('catches StatusCodeError and passes to next', async () => {
      const error = new StatusCodeError('Forbidden', 403);
      const asyncFn = async () => {
        throw error;
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(next.mock.calls[0][0]).toBeInstanceOf(StatusCodeError);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });

    test('returns a function that returns a Promise', () => {
      const asyncFn = async () => {};
      const wrappedFn = asyncHandler(asyncFn);

      const result = wrappedFn(req, res, next);
      expect(result).toBeInstanceOf(Promise);
    });

    test('handles synchronous errors in async functions', async () => {
      const asyncFn = async () => {
        throw new Error('Sync error in async function');
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toBe('Sync error in async function');
    });

    test('handles rejected promises', async () => {
      const asyncFn = async () => {
        return Promise.reject(new Error('Promise rejection'));
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(next.mock.calls[0][0].message).toBe('Promise rejection');
    });

    test('preserves request and response objects', async () => {
      let capturedReq, capturedRes;
      const asyncFn = async (req, res) => {
        capturedReq = req;
        capturedRes = res;
        res.json({ ok: true });
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(capturedReq).toBe(req);
      expect(capturedRes).toBe(res);
    });

    test('passes next function to wrapped handler', async () => {
      let capturedNext;
      const asyncFn = async (req, res, next) => {
        capturedNext = next;
        res.json({ ok: true });
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(capturedNext).toBe(next);
    });

    test('handles errors with custom properties', async () => {
      const error = new Error('Custom error');
      error.customProp = 'custom value';

      const asyncFn = async () => {
        throw error;
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalledWith(error);
      expect(next.mock.calls[0][0].customProp).toBe('custom value');
    });
  });

  // ====================================================================
  // Integration Tests - StatusCodeError with asyncHandler
  // ====================================================================
  describe('StatusCodeError with asyncHandler integration', () => {
    test('asyncHandler correctly passes StatusCodeError to next', async () => {
      const req = {};
      const res = { json: jest.fn() };
      const next = jest.fn();

      const asyncFn = async () => {
        throw new StatusCodeError('Not found', 404);
      };

      const wrappedFn = asyncHandler(asyncFn);
      await wrappedFn(req, res, next);

      expect(next).toHaveBeenCalled();
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(StatusCodeError);
      expect(error.message).toBe('Not found');
      expect(error.statusCode).toBe(404);
    });

    test('multiple StatusCodeErrors maintain distinct status codes', async () => {
      const req = {};
      const res = { json: jest.fn() };
      const next = jest.fn();

      const fn1 = asyncHandler(async () => {
        throw new StatusCodeError('Unauthorized', 401);
      });

      const fn2 = asyncHandler(async () => {
        throw new StatusCodeError('Forbidden', 403);
      });

      await fn1(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(401);

      next.mockClear();
      await fn2(req, res, next);
      expect(next.mock.calls[0][0].statusCode).toBe(403);
    });
  });
});
