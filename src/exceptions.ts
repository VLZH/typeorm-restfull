class TypeormRestfullError extends Error {
    constructor(message?: string) {
        super(message);
    }
}
export class BadRequestError extends TypeormRestfullError {}
export class BadMethodError extends BadRequestError {}
export class NotFoundError extends TypeormRestfullError {}
export class UnauthorizedError extends TypeormRestfullError {}
/*
 * Error on try to send request with invalid filter query
 */
export class InvalidQueryKey extends TypeormRestfullError {
    constructor() {
        super();
        this.message = "InvalidQueryKey";
    }
}
