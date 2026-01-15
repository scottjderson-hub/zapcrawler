import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface CustomError extends Error {
  statusCode?: number;
  code?: string | number;
  errors?: any[];
}

export const errorHandler = (
  err: CustomError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Default to 500 if status code not set
  const statusCode = err.statusCode || 500;
  
  // Log the error
  logger.error({
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : {},
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
  });

  // Prepare error response
  const errorResponse: Record<string, any> = {
    success: false,
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_SERVER_ERROR',
    },
  };

  // Add validation errors if they exist
  if (err.errors) {
    errorResponse.error.details = err.errors;
  }

  // Send response
  res.status(statusCode).json(errorResponse);
};

// 404 Not Found handler
export const notFoundHandler = (req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Cannot ${req.method} ${req.originalUrl}`,
      code: 'NOT_FOUND',
    },
  });
};
