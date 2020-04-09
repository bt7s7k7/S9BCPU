
export const CONDITION_OR = 0b001000000
export const CONDITION_INVERT = 0b000100000

export const CONDITION_TARGETS = {
    Z: 0b000010000,
    C: 0b000001000,
    a: 0b000000100,
    b: 0b000000010,
    c: 0b000000001,
} as const

export const INST_TYPE = {
    movement: 0b100000000,
    condition: 0b010000000,
    action: 0b001000000
} as const

export const SOURCE_LOCATIONS = {
    a: 160,
    b: 176,
    c: 192,
    d: 208,
    sum: 16,
    sub: 32,
    and: 48,
    or: 64,
    xor: 80,
    stackptr$: 224,
    stack: 144,
    mem: 112,
    stack$: 128,
    mem$: 96,
    $: 240,
    zero: 0
} as const

export const DESTINATION_LOCATIONS = {
    nul: 0,
    a: 6,
    b: 7,
    c: 8,
    d: 9,
    m: 10,
    n: 11,
    pc: 12,
    push: 5,
    stack: 4,
    mem: 2,
    out: 13,
    stack$: 3,
    mem$: 1
} as const

export const VALID_LOCATIONS = [...new Set([...Object.keys(SOURCE_LOCATIONS), ...Object.keys(DESTINATION_LOCATIONS)].map(v => v.replace(/\$/g, "")))]

export const ACTIONS = {
    done: 2,
    pause: 3,
    halt: 1,
    pop: 24
} as const

export const REGISTER_ACTIONS = {
    "!": 12,
    "+": 4,
    "-": 8,
    "<": 16,
    ">": 20
} as const

export const REGISTER_ACTION_REGISTERS = {
    a: 0,
    b: 1,
    c: 2,
    d: 3
} as const

export const VALID_ACTIONS = Object.keys(ACTIONS)