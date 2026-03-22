export interface ApiResponse<T = any> {
  success: boolean;
  code: number;
  message: string;
  data?: T;
  timestamp: string;
  requestId: string;
}

export interface ApiError {
  success: false;
  code: number;
  message: string;
  timestamp: string;
  requestId: string;
}
