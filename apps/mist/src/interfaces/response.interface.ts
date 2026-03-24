export interface ApiResponse<T = any> {
  success: true;
  statusCode: number;
  message: string;
  data: T;
  timestamp: string;
  requestId: string;
  path?: string;
}

export interface ApiError {
  success: false;
  statusCode: number;
  message: string;
  errors?: Record<string, string[]> | null;
  timestamp: string;
  requestId: string;
  path?: string;
}

export type ApiResponseType<T = any> = ApiResponse<T> | ApiError;
