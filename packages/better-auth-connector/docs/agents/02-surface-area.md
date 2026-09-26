# Connector surface area

## Implemented today

src/index.ts exports signsOfLife({tokens, name?}). tokens accepts one or two strings of at least 32 characters for overlap rotation. It returns a BetterAuthPlugin.

GET <existing-auth-base>/signs-of-life/v1/users accepts from/until ISO times, limit 1–200 and after. Bearer authentication is mandatory; output is version:1, configured app name, users[{id,createdAt,anonymous?}], next. Range-bound opaque cursors use timestamp/ID keysets; null next ends the scan. Invalid auth is 401; invalid input/cursor is 400. Responses are no-store. No other endpoints, external calls or persistence are present.
