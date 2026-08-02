import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanOccurrenceStatus,
  fromCents,
  normalizeUniqueIds,
  resolveStoredCents,
  toCents,
} from "../state-core.js";

const validMonth = (value) => /^\d{4}-(0[1-9]|1[0-2])$/.test(value);

test("convierte importes decimales V3.1 a centavos exactos", () => {
  assert.equal(toCents("123.45"), 12345);
  assert.equal(toCents("-10.01"), -1001);
  assert.equal(fromCents(12345), 123.45);
});

test("prioriza centavos V3.2 y migra el importe V3.1 cuando faltan", () => {
  assert.equal(resolveStoredCents(999, 25.5), 999);
  assert.equal(resolveStoredCents(undefined, 25.5), 2550);
  assert.equal(resolveStoredCents(undefined, -1, { positiveOnly: true }), 0);
  assert.equal(resolveStoredCents(Number.MAX_VALUE, 10), 1000);
});

test("rechaza valores monetarios no finitos o fuera del rango seguro", () => {
  assert.equal(toCents(Infinity), 0);
  assert.equal(toCents("no-es-un-importe"), 0);
  assert.equal(toCents(Number.MAX_VALUE), 0);
});

test("elimina estados mensuales inválidos y huérfanos", () => {
  const cleaned = cleanOccurrenceStatus({
    "tx-1:2026-08": "paid",
    "tx-1:2026-13": "paid",
    "missing:2026-08": "paid",
    "tx-1:2026-09": "pending",
    malformed: "paid",
  }, new Set(["tx-1"]), validMonth);
  assert.deepEqual(cleaned, { "tx-1:2026-08": "paid" });
});

test("repara identificadores duplicados sin modificar los demás", () => {
  let nextId = 0;
  const normalized = normalizeUniqueIds([
    { id: "same", name: "Uno" },
    { id: "same", name: "Dos" },
    { id: "third", name: "Tres" },
  ], () => `generated-${++nextId}`);
  assert.deepEqual(normalized.map((item) => item.id), ["same", "generated-1", "third"]);
});
