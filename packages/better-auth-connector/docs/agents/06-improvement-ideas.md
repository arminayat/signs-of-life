# Connector improvement ideas

## Implemented today

ISO query and cursor timestamps now normalize before comparisons and cursor binding. `tests/connector-protocol.test.ts` covers equivalent spellings, same-second ranges and changed-range rejection. The normalization improvement is done in source; package distribution and customer acceptance remain separate.

## Planned/aspirational

| Idea                                  | Impact                                         | Effort | Area                                           | Status |
| ------------------------------------- | ---------------------------------------------- | ------ | ---------------------------------------------- | ------ |
| Broaden tested Better Auth peer range | Support existing customer installations safely | Medium | Compatibility fixtures/package peer constraint | open   |
