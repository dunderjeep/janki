/** A refusal from the chains, with the HTTP status it should become. */
export class ChainError extends Error {
  constructor(message: string, public status = 400) {
    super(message)
  }
}
