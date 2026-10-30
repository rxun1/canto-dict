// Test helper (not a test file): Lua source in the shape the dial-syn data modules use.

/** Wraps fields in `local export = {} … export.list = { … } … return export`; the first field is on line 4. */
export const luaModule = (body: string): string => `local export = {}\n\nexport.list = {\n${body}\n}\n\nreturn export`;
