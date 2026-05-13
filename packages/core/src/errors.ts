export class MockPitError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly cause?: unknown,
  ) {
    super(message)
    this.name = "MockPitError"
  }
}

export class MissingMockPitResource extends MockPitError {
  constructor(resourceKey: string) {
    super(`Unknown MockPit resource "${resourceKey}".`, "MOCKPIT_MISSING_RESOURCE")
    this.name = "MissingMockPitResource"
  }
}

export class MockPitParseError extends MockPitError {
  constructor(message: string, cause?: unknown) {
    super(message, "MOCKPIT_PARSE_ERROR", cause)
    this.name = "MockPitParseError"
  }
}

export class MockPitSchemaError extends MockPitError {
  constructor(message: string, cause?: unknown) {
    super(message, "MOCKPIT_SCHEMA_ERROR", cause)
    this.name = "MockPitSchemaError"
  }
}

export class MockPitFallbackError extends MockPitError {
  constructor(message: string, cause?: unknown) {
    super(message, "MOCKPIT_FALLBACK_ERROR", cause)
    this.name = "MockPitFallbackError"
  }
}

export class MockPitStorageError extends MockPitError {
  constructor(message: string, cause?: unknown) {
    super(message, "MOCKPIT_STORAGE_ERROR", cause)
    this.name = "MockPitStorageError"
  }
}

export class MockPitExportError extends MockPitError {
  constructor(message: string, cause?: unknown) {
    super(message, "MOCKPIT_EXPORT_ERROR", cause)
    this.name = "MockPitExportError"
  }
}
