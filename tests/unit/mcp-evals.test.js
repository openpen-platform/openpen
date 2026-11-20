import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { BUILTIN_DRAWING_TOOL_IDS, READ_ONLY_TOOL_NAMES, createBuiltinTools } from '../../electron/mcp/tools.js'
import { executeMcpCommand } from '../../src/services/mcp-tool-bridge'
import { clearAll, getAllStrokes, resetHistory } from '../../src/services/stroke-store'
import { seedScene } from '../mcp-evals/seed.js'
import { gradeRun } from '../mcp-evals/grade.js'
import { buildPrompt } from '../mcp-evals/prompt.js'

const bank = JSON.parse(readFileSync(resolve(__dirname, '../mcp-evals/questions.json'), 'utf8'))
const questions = bank.questions

// Same shape as electron/mcp-server-manager.js; the overlay side is the real
// renderer bridge, so bounds and kinds come from the code the app runs.
function makeHost() {
  const state = {
    drawingMode: false,
    tool: 'freehand',
    tools: [...BUILTIN_DRAWING_TOOL_IDS],
    displays: [{ id: 1, pixelWidth: 2560, pixelHeight: 1600, scaleFactor: 2, isCursorDisplay: true }],
  }
  return {
    state,
    getState: () => ({ ...state }),
    setDrawingMode: (on) => { state.drawingMode = on },
    setTool: (id) => { state.tool = id },
    runOnOverlay: (_displayId, command) => executeMcpCommand(command),
    screenshot: async () => ({ data: '', mimeType: 'image/png', width: 2560, height: 1600, displayId: 1 }),
  }
}

function connect(host) {
  const tools = createBuiltinTools(host)
  const calls = []
  const call = async (name, args = {}) => {
    calls.push(name)
    const res = await tools.find((t) => t.name === `openpen__${name}`).handler(args)
    if (res.isError) throw new Error(res.content[0].text)
    const text = res.content.find((c) => c.type === 'text')?.text ?? ''
    return name === 'get_guide' ? text : JSON.parse(text)
  }
  return { call, calls, tools }
}

beforeEach(() => {
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true, writable: true })
  clearAll()
  resetHistory()
})
afterEach(() => {
  clearAll()
  resetHistory()
})

describe('MCP evaluation questions (#1, #2)', () => {
  it('has at least 10 read-only questions whose answers follow from the seeded scene through read-only tools', async () => {
    expect(questions.length).toBeGreaterThanOrEqual(10)
    const readOnly = READ_ONLY_TOOL_NAMES.map((n) => n.replace('openpen__', ''))
    for (const q of questions) {
      expect(q.question, `question ${q.id}`).toBeTruthy()
      expect(q.answer, `question ${q.id}`).toBeTruthy()
      expect(Array.isArray(q.scene?.annotations), `question ${q.id}`).toBe(true)
      for (const n of q.needs) expect(readOnly, `question ${q.id}`).toContain(n)
    }

    const derive = async (q, call, tools) => {
      const list = (await call('list_annotations')).annotations
      const state = await call('get_state')
      const kinds = (k) => list.filter((a) => a.kind === k)
      const right = (a) => a.bounds.x + a.bounds.width
      const leftmost = [...list].sort((a, b) => a.bounds.x - b.bounds.x)[0]
      const describe = (n) => tools.find((t) => t.name === `openpen__${n}`).description
      const guide = await call('get_guide')
      switch (q.id) {
        case 1: return String(list.length)
        case 2: return String(kinds('ellipse').length)
        case 3: return `${leftmost.bounds.x},${leftmost.bounds.y}`
        case 4: return `${kinds('rect')[0].bounds.width}×${kinds('rect')[0].bounds.height}`
        case 5: return `${kinds('rect').length}；${Math.max(...kinds('rect').map((a) => a.bounds.width))}`
        case 6: return !state.drawingMode && /reappear/.test(describe('set_drawing_mode')) ? `${list.length}；set_drawing_mode` : ''
        case 7: return state.tool
        case 8: return state.tools.filter((t) => t.includes('eraser')).join('；')
        case 9: return String(getAllStrokes().filter((s) => s.style.color.toLowerCase() === '#ff0000').length)
        case 10: return String(Math.max(...list.map(right)))
        case 11: return String(kinds('highlighter').length)
        case 12: return /not filled/.test(describe('draw_rect')) && /fills regions with colour/.test(describe('draw_rect')) && /colour a large area, use \S*fill_regions/.test(guide) ? '不可以；fill_regions' : ''
        default: return `no derivation for question ${q.id}`
      }
    }

    // One host for the whole set, as on a real display: each seed must replace the previous scene.
    const host = makeHost()
    const { call, tools } = connect(host)
    for (const q of questions) {
      await seedScene(call, q.scene)
      expect(await derive(q, call, tools), `question ${q.id}`).toBe(q.answer)
    }
  })

  it('seeding a question lays out exactly its annotations, drawing mode and tool, using only scene tools', async () => {
    const host = makeHost()
    const { call, calls } = connect(host)
    await seedScene(call, questions.find((q) => q.id === 1).scene)
    const q6 = questions.find((q) => q.id === 6)
    calls.length = 0
    await seedScene(call, q6.scene)
    const list = (await call('list_annotations')).annotations
    expect(list.map((a) => a.kind)).toEqual(['rect', 'ellipse'])
    expect(list[0].bounds).toEqual({ x: 200, y: 200, width: 300, height: 200 })
    expect(host.state.drawingMode).toBe(false)
    expect(calls.slice(0, 3)).toEqual(['clear_canvas', 'draw_rect', 'draw_ellipse'])

    await seedScene(call, questions.find((q) => q.id === 7).scene)
    expect((await call('list_annotations')).annotations).toEqual([])
    expect(host.state.tool).toBe('highlighter-pen')
  })
})

// A trimmed Claude Code `--output-format stream-json --verbose` run.
const streamJson = (toolNames, finalText) => [
  { type: 'system', subtype: 'init', tools: toolNames.map((n) => `mcp__openpen__${n}`) },
  ...toolNames.map((n, i) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `t${i}`, name: `mcp__openpen__${n}`, input: {} }] } })),
  { type: 'result', subtype: 'success', result: finalText },
].map((l) => JSON.stringify(l)).join('\n')

describe('grading a run (#3)', () => {
  it('marks a run correct when every keyword appears, tolerating spacing and x for ×, and records the tools called', () => {
    const q4 = questions.find((q) => q.id === 4)
    const rec = gradeRun(q4, streamJson(['openpen__get_state', 'openpen__list_annotations'], '框起來的區域是 400 x 300 像素。\n答案：400 x 300'), { round: 2 })
    expect(rec).toMatchObject({
      id: 4, round: 2, correct: true, missing: [],
      toolCalls: ['get_state', 'list_annotations'], usedNeeds: true, changedCanvas: false,
    })
    expect(rec).toMatchObject({ answerLine: '400 x 300' })
    expect(rec.answer).toBe('框起來的區域是 400 x 300 像素。\n答案：400 x 300')
  })

  it('marks a run wrong when a keyword is missing, and flags calls that change the canvas', () => {
    const q6 = questions.find((q) => q.id === 6)
    const rec = gradeRun(q6, streamJson(['openpen__list_annotations', 'openpen__set_drawing_mode'], '還剩 2 個，我已經幫你打開了。\n答案：2'))
    expect(rec).toMatchObject({
      correct: false, missing: ['set_drawing_mode'],
      toolCalls: ['list_annotations', 'set_drawing_mode'], usedNeeds: false, changedCanvas: true,
    })
  })

  // Review regression: a keyword must not match inside a longer number or id.
  it('does not accept a keyword found only inside a longer number, a swapped pair or a longer id', () => {
    const q = (id) => questions.find((x) => x.id === id)
    const grade = (id, reply) => gradeRun(q(id), JSON.stringify({ answer: reply, toolCalls: [] })).correct
    expect(grade(1, '答案：15')).toBe(false)
    expect(grade(1, '答案：5')).toBe(true)
    expect(grade(3, '答案：120,100')).toBe(false)
    expect(grade(3, '答案：(100, 120)')).toBe(true)
    expect(grade(8, '答案：stroke-eraser')).toBe(false)
    expect(grade(12, '答案：可以；fill_regions')).toBe(false)
    expect(grade(12, '答案：不可以；openpen__fill_regions')).toBe(true)
  })

  // The answer line is the only thing graded: a wrong answer that merely
  // mentions the expected value elsewhere in the reply must not pass.
  describe('answer line', () => {
    const q = (id) => questions.find((x) => x.id === id)
    const grade = (id, reply) => gradeRun(q(id), JSON.stringify({ answer: reply, toolCalls: [] }))
    const noAnswerLine = [
      '**0**',
      '',
      '畫面上看不到任何紅色標註。截圖和放大後的區域圖都只有藍綠色的背景。',
      '',
      '標註清單裡有 5 個項目：3 個矩形、1 條直線和 1 個橢圓。清單也沒有記錄顏色，所以我無法確認這 5 個是不是紅色。我看得到的紅色標註數量是 0。',
    ].join('\n')

    it('grades the first-round reply of question 9 (no answer line) as wrong and flags it for review', () => {
      expect(grade(9, noAnswerLine)).toMatchObject({ correct: false, missing: ['3'], answerLine: null, needsReview: true })
    })

    it('grades a wrong answer line wrong even when the reply mentions the expected number elsewhere', () => {
      expect(grade(9, `${noAnswerLine}\n答案：0`)).toMatchObject({ correct: false, answerLine: '0', needsReview: false })
      expect(grade(9, '清單裡共有 3 個矩形，但紅色標註是 0 個。\n答案：0').correct).toBe(false)
      expect(grade(9, '3 個矩形，紅色 0 個\n答案：0').correct).toBe(false)
      expect(grade(1, '5 個? 不，只有 4 個\n答案：4').correct).toBe(false)
    })

    it('grades a correct answer line right however the reply leads up to it', () => {
      expect(grade(9, `${noAnswerLine}\n答案：3`)).toMatchObject({ correct: true, answerLine: '3', needsReview: false })
      expect(grade(9, '畫面共 5 個標註，其中紅色的有 3 個。\n\n答案：3').correct).toBe(true)
      expect(grade(10, '橢圓 x=900、寬 200，右邊緣 900 + 200 = 1100。\n答案：1100 像素').correct).toBe(true)
      expect(grade(5, '答案：2；600').correct).toBe(true)
      expect(grade(5, '答案：600；2').correct).toBe(true)
      expect(grade(5, '答案：3；600').correct).toBe(false)
      expect(grade(6, '答案：2；set_drawing_mode').correct).toBe(true)
      expect(grade(12, '答案：不可以；fill_regions').correct).toBe(true)
    })

    it('accepts the answer of question 3 written as "x,y", the format it asks for', () => {
      expect(q(3).question).toContain('x,y')
      expect(grade(3, '最左邊的是矩形。\n答案：100,120').correct).toBe(true)
    })

    it('accepts the answer of question 4 written as "寬×高", the format it asks for', () => {
      expect(q(4).question).toContain('寬×高')
      expect(grade(4, '框起來的區域有 400 寬、300 高。\n答案：400×300').correct).toBe(true)
    })

    it('tells the agent to follow the format a question asks for before falling back to a separator', () => {
      expect(bank.answerSuffix).toMatch(/題目有指定答案格式時照題目的格式/)
    })

    it('reads the last answer line, tolerating markdown emphasis, a colon in ASCII and a trailing note line', () => {
      expect(grade(1, '答案：4\n改一下：\n**答案**: 5').correct).toBe(true)
      expect(grade(1, '- **答案：5**').correct).toBe(true)
      expect(grade(1, '答案:5').correct).toBe(true)
      expect(grade(1, '答案：5\n以上是依標註清單算的。').correct).toBe(true)
      expect(grade(1, '答案：4\n以上是依標註清單算的，也有人說 5 個。').correct).toBe(false)
    })

    it('flags a reply whose "答案" is not at the start of a line as having no answer line', () => {
      expect(grade(1, '我的答案：5')).toMatchObject({ correct: false, answerLine: null, needsReview: true })
      expect(grade(1, '')).toMatchObject({ correct: false, answerLine: null, needsReview: true })
    })

    it('builds the prompt from the question sentence and the shared answer-line instruction', () => {
      expect(bank.answerSuffix).toMatch(/答案：/)
      expect(buildPrompt(bank, q(9))).toBe(`${q(9).question}\n\n${bank.answerSuffix}`)
      // The instruction must not give any answer away.
      for (const x of questions) expect(bank.answerSuffix).not.toContain(x.answer.split('；')[0])
    })
  })

  // Review regression: a pretty-printed record from another client.
  it('reads a multi-line {answer, toolCalls} file', () => {
    const rec = gradeRun(questions.find((x) => x.id === 1), JSON.stringify({ answer: '5 個\n答案：5', toolCalls: ['list_annotations'] }, null, 2))
    expect(rec).toMatchObject({ answer: '5 個\n答案：5', correct: true, toolCalls: ['list_annotations'] })
  })
})
