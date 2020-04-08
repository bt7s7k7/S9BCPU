
export const CONDITION_TARGETS = {
    a: 0,
    b: 0,
    c: 0,
    C: 0,
    Z: 0
} as const

export const INST_TYPE = {
    movement: 0b100000000,
    condition: 0b010000000,
    action: 0b001000000
} as const

export const SOURCE_LOCATIONS = {
    a: 10,
    b: 11,
    c: 12,
    d: 13,
    sum: 1,
    sub: 2,
    and: 3,
    or: 4,
    xor: 5,
    stackptr$: 14,
    stack: 9,
    mem: 7,
    stack$: 8,
    mem$: 6,
    $: 15,
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