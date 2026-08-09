import test from "node:test";
import assert from "node:assert/strict";
import { withSubmitLock } from "../ui-core.js";

function fakeForm() {
  const submit = { disabled: false };
  return {
    dataset: {},
    submit,
    querySelectorAll: () => [submit],
  };
}

test("withSubmitLock ignora un segundo submit hasta terminar el primero", async () => {
  const form = fakeForm();
  let resolveFirst;
  let calls = 0;
  const first = withSubmitLock(form, async () => {
    calls += 1;
    await new Promise((resolve) => {
      resolveFirst = resolve;
    });
  });

  assert.equal(form.submit.disabled, true);
  assert.equal(await withSubmitLock(form, async () => { calls += 1; }), false);
  assert.equal(calls, 1);

  resolveFirst();
  assert.equal(await first, true);
  assert.equal(form.submit.disabled, false);
  assert.equal(form.dataset.submitting, undefined);
});

test("withSubmitLock libera el formulario después de un error", async () => {
  const form = fakeForm();
  await assert.rejects(withSubmitLock(form, async () => {
    throw new Error("fallo de prueba");
  }));
  assert.equal(form.submit.disabled, false);
  assert.equal(form.dataset.submitting, undefined);
});
