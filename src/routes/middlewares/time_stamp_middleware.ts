import { Request, Response, NextFunction } from "express";

// Extend Express Request type to include timestamp
declare global {
  namespace Express {
    interface Request {
      timestamp: number;
      startTime: [number, number]; // [seconds, nanoseconds]
      /**
       * Get execution time in milliseconds
       */
      getExecutionTime(): number;
      /**
       * Get execution time in microseconds for more precise measurements
       */
      getExecutionTimeMicro(): number;
    }
  }
}

/**
 * Configuration options for the timestamp middleware
 */
interface TimestampOptions {
  /**
   * Whether to log execution time for all requests
   */
  logExecutionTime?: boolean;
  /**
   * Threshold in milliseconds. Only log execution time if it exceeds this value
   */
  logThreshold?: number;
  /**
   * Custom logger function
   */
  logger?: (message: string) => void;
}

/**
 * Creates a middleware that adds timestamp and execution time tracking to requests
 * @param options Configuration options for the middleware
 */
export const timestampMiddleware = (options: TimestampOptions = {}) => {
  const {
    logExecutionTime = false,
    logThreshold = 0,
    logger = console.log,
  } = options;

  return (req: Request, res: Response, next: NextFunction) => {
    // Add timestamp in milliseconds
    req.timestamp = Date.now();

    // Add high-resolution timestamp for more precise measurements
    req.startTime = process.hrtime();

    // Add method to get execution time in milliseconds
    req.getExecutionTime = (): number => {
      return Date.now() - req.timestamp;
    };

    // Add method to get execution time in microseconds
    req.getExecutionTimeMicro = (): number => {
      const hrTime = process.hrtime(req.startTime);
      return Math.round(hrTime[0] * 1000000 + hrTime[1] / 1000);
    };

    // Log execution time if enabled
    if (logExecutionTime) {
      res.on("finish", () => {
        const executionTime = req.getExecutionTime();
        if (executionTime >= logThreshold) {
          logger(
            `[${new Date(req.timestamp).toISOString()}] ${req.method} ${
              req.originalUrl
            } - ${executionTime}ms`
          );
        }
      });
    }

    next();
  };
};

/**
 * Helper middleware to log slow requests
 * @param threshold Threshold in milliseconds
 * @param logger Custom logger function
 */
export const logSlowRequests = (
  threshold: number = 1000,
  logger: (message: string) => void = console.warn
) => {
  return timestampMiddleware({
    logExecutionTime: true,
    logThreshold: threshold,
    logger: (message: string) => {
      logger(`⚠️ Slow Request Detected: ${message}`);
    },
  });
};

/**
 * Helper middleware to add execution time header to response
 */
export const addExecutionTimeHeader = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const originalSend = res.send;

    res.send = function (body: any): Response {
      res.setHeader("X-Execution-Time", `${req.getExecutionTime()}ms`);
      return originalSend.call(this, body);
    };

    next();
  };
};
