import assert from "node:assert/strict";
import test from "node:test";

import * as entry from "../../player/index.js";
import { ERROR_CODES, milimError, structuredError } from "../../player/errors.js";

test("the release entry exposes only mountMilim and stable errors serialize structurally", () => {
  assert.deepEqual(Object.keys(entry), ["mountMilim"]);
  assert.deepEqual(structuredError(milimError(ERROR_CODES.UNSUPPORTED_STATE, "unsupported", { key: "pose" })), {
    code: "MILIM_UNSUPPORTED_STATE",
    message: "unsupported",
    detail: { key: "pose" },
  });
});
