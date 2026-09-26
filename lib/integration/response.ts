import type { ApiSuccessResponse, ApiErrorResponse, ApiErrorDetail } from './types';

export function jsonSuccess<T>(
  data: T,
  correlationId: string,
  status = 200,
  extraHeaders: Record<string, string> = {},
): Response {
  const body: ApiSuccessResponse<T> = {
    success: true,
    data,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...extraHeaders,
    },
  });
}

export function jsonError(
  code: ApiErrorResponse['error']['code'],
  message: string,
  correlationId: string,
  status = 400,
  details?: ApiErrorDetail[],
  extraHeaders: Record<string, string> = {},
): Response {
  const body: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
    correlationId,
    timestamp: new Date().toISOString(),
  };

  return Response.json(body, {
    status,
    headers: {
      'Content-Type': 'application/json',
      'X-Correlation-Id': correlationId,
      ...extraHeaders,
    },
  });
}
