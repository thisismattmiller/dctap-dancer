import { Request, Response, NextFunction } from 'express';
import { ApiResponse } from '../types/dctap.js';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public code: string = 'INTERNAL_ERROR',
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    // Only log non-4xx errors (server errors)
    if (err.statusCode >= 500) {
      console.error('Error:', err);
    }
    const response: ApiResponse = {
      success: false,
      error: err.message,
      code: err.code,
      details: err.details
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Log unexpected errors
  console.error('Error:', err);

  // Handle SQLite errors
  if (err.message?.includes('SQLITE')) {
    const response: ApiResponse = {
      success: false,
      error: 'Database error',
      code: 'DATABASE_ERROR'
    };
    res.status(500).json(response);
    return;
  }

  // Generic error
  const response: ApiResponse = {
    success: false,
    error: 'Internal server error',
    code: 'INTERNAL_ERROR'
  };
  res.status(500).json(response);
}

// Not found handler
export function notFoundHandler(_req: Request, res: Response): void {
  const response: ApiResponse = {
    success: false,
    error: 'Resource not found',
    code: 'NOT_FOUND'
  };
  res.status(404).json(response);
}
