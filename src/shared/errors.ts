export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
<<<<<<< HEAD
  }
}

export class UserInputError extends HttpError {
=======
    this.name = "HttpError";
  }
}

export class BadRequestError extends HttpError {
>>>>>>> upstream/main
  constructor(message: string) {
    super(400, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(404, message);
  }
}
<<<<<<< HEAD
=======

export class TooManyRequestsError extends HttpError {
  constructor(message: string) {
    super(429, message);
  }
}
>>>>>>> upstream/main
