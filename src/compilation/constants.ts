
export const conditionTargets = {
    a: 0,
    b: 0,
    c: 0,
    C: 0,
    Z: 0
}

export const sourceLocations = {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    sum: 0,
    sub: 0,
    and: 0,
    or: 0,
    xor: 0,
    stackptr$: 0,
    stack: 0,
    mem: 0,
    stack$: 0,
    mem$: 0,
    $: 0,
    zero: 0
}

export const destinationLocations = {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    m: 0,
    n: 0,
    pc: 0,
    push: 0,
    stack: 0,
    mem: 0,
    out: 0,
    stack$: 0,
    mem$: 0
}

export const validLocations = [...new Set([...Object.keys(sourceLocations), ...Object.keys(destinationLocations)].map(v => v.replace(/\$/g, "")))]

export const actions = {
    done: 0,
    pause: 0,
    halt: 0,
    pop: 0
}

export const registerActions = {
    "!": 0,
    "+": 0,
    "-": 0,
    "<": 0,
    ">": 0
}

export const registers = {
    a: 0,
    b: 0,
    c: 0,
    d: 0
}

export const validActions = Object.keys(actions)
