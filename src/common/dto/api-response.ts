export class ApiResponse<T> {
  code: number;
  message: string;
  data: T;

  constructor(data: T, message = 'ok', code = 0) {
    this.code = code;
    this.message = message;
    this.data = data;
  }

  static ok<T>(data: T, message = 'ok') {
    return new ApiResponse(data, message, 0);
  }
}
