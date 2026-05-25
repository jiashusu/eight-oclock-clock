import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

type WakeRecord = {
  id: string
  date: string
  wokeAtISO: string
  createdAtISO: string
  updatedAtISO: string
}

type PersonalTime = {
  displayTime: string
  seconds: string
  phase: string
  progressPercent: number
  elapsedLabel: string
}

type Stats = {
  count30: number
  count7: number
  average7: string
  earliest: string
  latest: string
  range: string
  streak: number
}

const STORAGE_KEY = 'eight-clock-wake-records'
const DEVICE_KEY = 'eight-clock-device-id'
const DAY_MS = 24 * 60 * 60 * 1000
const PERSONAL_START_MINUTES = 8 * 60

function pad(value: number) {
  return String(value).padStart(2, '0')
}

function toLocalDateKey(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function toTimeValue(date: Date) {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function parseLocalDateTime(date: string, time: string) {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

function formatClock(totalMinutes: number) {
  const minutes = ((Math.round(totalMinutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`
}

function formatWakeTime(iso: string) {
  const date = new Date(iso)
  return `${toLocalDateKey(date)} ${toTimeValue(date)}`
}

function getPhase(totalPersonalMinutes: number) {
  const minutes = ((Math.floor(totalPersonalMinutes) % 1440) + 1440) % 1440

  if (minutes >= 8 * 60 && minutes < 12 * 60) return '上午'
  if (minutes >= 12 * 60 && minutes < 18 * 60) return '下午'
  if (minutes >= 18 * 60 && minutes < 22 * 60) return '晚上'
  if (minutes >= 22 * 60 || minutes < 4 * 60) return '深夜'
  return '清晨'
}

function getPersonalTime(now: Date, anchorWokeAt: Date): PersonalTime {
  const elapsedMs = Math.max(0, now.getTime() - anchorWokeAt.getTime()) % DAY_MS
  const elapsedMinutes = elapsedMs / 60000
  const totalPersonalSeconds = PERSONAL_START_MINUTES * 60 + Math.floor(elapsedMs / 1000)
  const personalMinutes = Math.floor(totalPersonalSeconds / 60)
  const elapsedHours = Math.floor(elapsedMinutes / 60)
  const elapsedRemainder = Math.floor(elapsedMinutes % 60)

  return {
    displayTime: formatClock(personalMinutes),
    seconds: pad(totalPersonalSeconds % 60),
    phase: getPhase(personalMinutes),
    progressPercent: Math.min(100, Math.max(0, (elapsedMs / DAY_MS) * 100)),
    elapsedLabel: `${elapsedHours}小时${elapsedRemainder}分钟`,
  }
}

function sortRecords(records: WakeRecord[]) {
  return [...records].sort(
    (a, b) => new Date(b.wokeAtISO).getTime() - new Date(a.wokeAtISO).getTime(),
  )
}

function trimRecords(records: WakeRecord[]) {
  return sortRecords(records).slice(0, 30)
}

function mergeRecords(records: WakeRecord[]) {
  const byDate = new Map<string, WakeRecord>()

  for (const record of sortRecords(records).reverse()) {
    const existing = byDate.get(record.date)
    if (!existing || new Date(record.updatedAtISO).getTime() >= new Date(existing.updatedAtISO).getTime()) {
      byDate.set(record.date, record)
    }
  }

  return trimRecords(Array.from(byDate.values()))
}

function getLatestAnchor(records: WakeRecord[], now: Date) {
  const sorted = sortRecords(records)
  return sorted.find((record) => new Date(record.wokeAtISO).getTime() <= now.getTime()) ?? sorted[0]
}

function averageTime(records: WakeRecord[]) {
  if (records.length === 0) return '--:--'

  const total = records.reduce((sum, record) => {
    const date = new Date(record.wokeAtISO)
    return sum + date.getHours() * 60 + date.getMinutes()
  }, 0)

  return formatClock(total / records.length)
}

function minutesRange(records: WakeRecord[]) {
  if (records.length === 0) {
    return { earliest: '--:--', latest: '--:--', range: '暂无' }
  }

  const minutes = records.map((record) => {
    const date = new Date(record.wokeAtISO)
    return date.getHours() * 60 + date.getMinutes()
  })
  const min = Math.min(...minutes)
  const max = Math.max(...minutes)
  const span = max - min

  return {
    earliest: formatClock(min),
    latest: formatClock(max),
    range: `${Math.floor(span / 60)}小时${span % 60}分钟`,
  }
}

function getStreak(records: WakeRecord[]) {
  const dates = Array.from(new Set(records.map((record) => record.date))).sort().reverse()
  if (dates.length === 0) return 0

  let streak = 1
  let cursor = parseLocalDateTime(dates[0], '12:00')

  for (let index = 1; index < dates.length; index += 1) {
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1, 12, 0)
    if (dates[index] !== toLocalDateKey(cursor)) break
    streak += 1
  }

  return streak
}

function getStats(records: WakeRecord[]): Stats {
  const sorted = sortRecords(records)
  const recent7 = sorted.slice(0, 7)
  const range = minutesRange(recent7)

  return {
    count30: sorted.length,
    count7: recent7.length,
    average7: averageTime(recent7),
    earliest: range.earliest,
    latest: range.latest,
    range: range.range,
    streak: getStreak(sorted),
  }
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as WakeRecord[]

    if (!Array.isArray(parsed)) return []

    return trimRecords(
      parsed.filter(
        (record) =>
          typeof record.id === 'string' &&
          typeof record.date === 'string' &&
          typeof record.wokeAtISO === 'string',
      ),
    )
  } catch {
    return []
  }
}

function getDeviceId() {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing

  const id = crypto.randomUUID().replaceAll('-', '')
  localStorage.setItem(DEVICE_KEY, id)
  return id
}

function App() {
  const [now, setNow] = useState(() => new Date())
  const [records, setRecords] = useState<WakeRecord[]>(loadRecords)
  const [formDate, setFormDate] = useState(() => toLocalDateKey(new Date()))
  const [formTime, setFormTime] = useState(() => toTimeValue(new Date()))
  const [deviceId] = useState(getDeviceId)
  const [syncStatus, setSyncStatus] = useState('正在连接 Vercel 云端...')

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
  }, [records])

  useEffect(() => {
    let cancelled = false

    async function pullCloudRecords() {
      try {
        const response = await fetch(`/api/sync?deviceId=${encodeURIComponent(deviceId)}`)
        if (!response.ok) throw new Error('Cloud pull failed')
        const payload = (await response.json()) as { records?: WakeRecord[]; updatedAtISO?: string | null }

        if (cancelled) return

        if (payload.records?.length) {
          setRecords((current) => mergeRecords([...payload.records!, ...current]))
        }

        setSyncStatus(payload.updatedAtISO ? `已从云端同步 ${payload.records?.length ?? 0} 条记录` : '云端已连接')
      } catch {
        if (!cancelled) setSyncStatus('云端暂不可用，已保存在本机')
      }
    }

    pullCloudRecords()

    return () => {
      cancelled = true
    }
  }, [deviceId])

  useEffect(() => {
    if (records.length === 0) return

    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/sync', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId, records }),
        })
        if (!response.ok) throw new Error('Cloud push failed')
        setSyncStatus('已同步到 Vercel 云端')
      } catch {
        setSyncStatus('云端暂不可用，已保存在本机')
      }
    }, 500)

    return () => window.clearTimeout(timer)
  }, [deviceId, records])

  const anchor = useMemo(() => getLatestAnchor(records, now), [records, now])
  const personalTime = useMemo(
    () => (anchor ? getPersonalTime(now, new Date(anchor.wokeAtISO)) : undefined),
    [anchor, now],
  )
  const stats = useMemo(() => getStats(records), [records])

  function saveRecord(wokeAt: Date) {
    const date = toLocalDateKey(wokeAt)
    const existing = records.find((record) => record.date === date)
    const timestamp = new Date().toISOString()
    const nextRecord: WakeRecord = {
      id: existing?.id ?? crypto.randomUUID(),
      date,
      wokeAtISO: wokeAt.toISOString(),
      createdAtISO: existing?.createdAtISO ?? timestamp,
      updatedAtISO: timestamp,
    }

    setRecords((current) => mergeRecords([nextRecord, ...current.filter((record) => record.date !== date)]))
  }

  function handleWakeNow() {
    const wokeAt = new Date()
    saveRecord(wokeAt)
    setNow(wokeAt)
    setFormDate(toLocalDateKey(wokeAt))
    setFormTime(toTimeValue(wokeAt))
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const date = String(data.get('wake-date') ?? formDate)
    const time = String(data.get('wake-time') ?? formTime)

    setFormDate(date)
    setFormTime(time)
    saveRecord(parseLocalDateTime(date, time))
  }

  return (
    <main className="app-shell">
      <section className="clock-panel" aria-label="当前个人时间">
        <div className="topline">
          <span>8点时钟</span>
          <time dateTime={now.toISOString()}>真实时间 {toTimeValue(now)}</time>
        </div>

        {personalTime ? (
          <>
            <p className="caption">现在是你的</p>
            <h1 className="clock-time">
              {personalTime.displayTime}
              <span>{personalTime.seconds}</span>
            </h1>
            <div className="status-row">
              <span>{personalTime.phase}</span>
              <span>醒来后 {personalTime.elapsedLabel}</span>
            </div>
            <div className="progress-block" aria-label="个人一天进度">
              <div className="progress-meta">
                <span>08:00</span>
                <span>{Math.round(personalTime.progressPercent)}%</span>
                <span>次日 08:00</span>
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${personalTime.progressPercent}%` }} />
              </div>
            </div>
            <p className="anchor-note">当前锚点：{formatWakeTime(anchor.wokeAtISO)}</p>
          </>
        ) : (
          <div className="empty-state">
            <p className="caption">还没有今天的时间锚点</p>
            <h1>你的 08:00</h1>
            <p>醒来后点一下，或者在下面补记起床时间。</p>
          </div>
        )}

        <button className="primary-action" type="button" onClick={handleWakeNow}>
          我醒了
        </button>
        <p className="sync-note">{syncStatus}</p>
      </section>

      <section className="editor-panel" aria-label="补记或修改起床时间">
        <div className="section-heading">
          <h2>补记 / 修改</h2>
          <p>同一天再次保存会覆盖这一天的起床时间。</p>
        </div>
        <form onSubmit={handleSubmit}>
          <label>
            日期
            <input
              name="wake-date"
              type="date"
              value={formDate}
              onChange={(event) => setFormDate(event.target.value)}
              required
            />
          </label>
          <label>
            时间
            <input
              name="wake-time"
              type="time"
              value={formTime}
              onChange={(event) => setFormTime(event.target.value)}
              required
            />
          </label>
          <button type="submit">保存锚点</button>
        </form>
      </section>

      <section className="stats-panel" aria-label="作息统计">
        <div className="section-heading">
          <h2>最近统计</h2>
        </div>
        <div className="stats-grid">
          <div>
            <span>7天平均</span>
            <strong>{stats.average7}</strong>
          </div>
          <div>
            <span>最早 / 最晚</span>
            <strong>
              {stats.earliest} / {stats.latest}
            </strong>
          </div>
          <div>
            <span>波动范围</span>
            <strong>{stats.range}</strong>
          </div>
          <div>
            <span>连续记录</span>
            <strong>{stats.streak} 天</strong>
          </div>
        </div>
        <p className="stats-footnote">
          已保存 {stats.count30} 条记录，其中最近 7 条用于平均值和波动统计。
        </p>
      </section>

      <section className="history-panel" aria-label="起床记录">
        <div className="section-heading">
          <h2>最近记录</h2>
        </div>
        {records.length > 0 ? (
          <ol>
            {sortRecords(records).map((record) => (
              <li key={record.id}>
                <span>{record.date}</span>
                <strong>{toTimeValue(new Date(record.wokeAtISO))}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="history-empty">记录会保存在这个浏览器里，最多保留最近 30 天。</p>
        )}
      </section>
    </main>
  )
}

export default App
