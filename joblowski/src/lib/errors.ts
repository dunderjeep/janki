/** A refusal to show the person, with the HTTP status the API answers with. */
export class JoblowskiError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message)
  }
}
