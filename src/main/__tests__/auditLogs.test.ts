import { describe, it, expect } from 'vitest'

// Mirror pure helper logic for testing detail breakdown and cross-date detection
function parseAuditDetails(details: string, eventDate: string) {
  let targetSheetDate: string | null = null
  let cleanDetails = details

  const forMatch = details.match(/^\[For\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)$/)
  if (forMatch) {
    targetSheetDate = forMatch[1]
    cleanDetails = forMatch[2]
  }

  const autoMatch = cleanDetails.match(/^Auto-saved\s+day\s+(\d{4}-\d{2}-\d{2})\s*\((.+?)\)/i)
  if (autoMatch && !targetSheetDate) {
    targetSheetDate = autoMatch[1]
  }

  const itemAddMatch = cleanDetails.match(/^Added:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*x(\d+)\s*\|\s*Net:\s*₱([0-9.,]+)/i)
  if (itemAddMatch && !targetSheetDate) {
    targetSheetDate = itemAddMatch[1]
  }

  const dispatchMatch = cleanDetails.match(/^Dispatched:\s*(\d+(?:\.\d+)?)x\s*(.+?)\s+to\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})/i)
  if (dispatchMatch && !targetSheetDate) {
    targetSheetDate = dispatchMatch[4]
  }

  if (!targetSheetDate) {
    targetSheetDate = eventDate
  }

  const isCrossDate = targetSheetDate !== eventDate

  return { targetSheetDate, cleanDetails, isCrossDate }
}

describe('Audit Log Detail Parsing & Cross-Date Detection', () => {
  it('correctly detects cross-date transactions entered for past sheets', () => {
    const eventDate = '2026-09-21'
    const details = '[For 2026-09-19] Added 5x SLIM PURIFIED (PICKUP) @ ₱30'

    const res = parseAuditDetails(details, eventDate)
    expect(res.targetSheetDate).toBe('2026-09-19')
    expect(res.isCrossDate).toBe(true)
    expect(res.cleanDetails).toBe('Added 5x SLIM PURIFIED (PICKUP) @ ₱30')
  })

  it('marks normal same-day transactions as not cross-date', () => {
    const eventDate = '2026-09-21'
    const details = '[For 2026-09-21] Added 2x SLIM ALKALINE (PICKUP) @ ₱40'

    const res = parseAuditDetails(details, eventDate)
    expect(res.targetSheetDate).toBe('2026-09-21')
    expect(res.isCrossDate).toBe(false)
  })

  it('correctly parses target sheet date from auto-save events', () => {
    const eventDate = '2026-09-21'
    const details = 'Auto-saved day 2026-09-19 (5 rows)'

    const res = parseAuditDetails(details, eventDate)
    expect(res.targetSheetDate).toBe('2026-09-19')
    expect(res.isCrossDate).toBe(true)
  })

  it('correctly extracts sheet date from item sale additions', () => {
    const eventDate = '2026-09-21'
    const details = 'Added: 2026-09-21 | 5 GAL SLIM CONTAINER W/ CAP BLUE-WOW x5 | Net: ₱725'

    const res = parseAuditDetails(details, eventDate)
    expect(res.targetSheetDate).toBe('2026-09-21')
    expect(res.isCrossDate).toBe(false)
  })

  it('correctly parses wholesale dispatch audit entries', () => {
    const eventDate = '2026-09-21'
    const details = 'Dispatched: 10x ITM-001 - 5 GAL SLIM CONTAINER to PURE DROP on 2026-09-20 (Wholesale)'

    const res = parseAuditDetails(details, eventDate)
    expect(res.targetSheetDate).toBe('2026-09-20')
    expect(res.isCrossDate).toBe(true)
  })
})
