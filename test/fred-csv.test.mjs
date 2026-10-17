// parseFredCsv — missing observations are holes, never zeros (2026-10-17).
//  ★ `Number('')` is 0: an empty cell used to be stored as a real 0. Numbers are written out here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseFredCsv } from '../lib/sources.mjs'

test('drops "." and empty cells; keeps negatives, 0 and exponents; UTC midnight', () => {
  const csv = 'observation_date,T10Y2Y\r\n2024-01-01,.\r\n2024-01-02,\r\n2024-01-03, \r\n2024-01-04,-0.35\r\n2024-01-05,0\r\n2024-01-08,1.5e1\r\n2024-01-09,ND\r\n'
  assert.deepEqual(parseFredCsv(csv), [[1704326400, -0.35], [1704412800, 0], [1704672000, 15]])
})
